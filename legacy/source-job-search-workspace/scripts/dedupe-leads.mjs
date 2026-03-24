#!/usr/bin/env node
import fs from 'node:fs';
import { canonicalizeUrl, normalizeCompany, normalizeLead, normalizeLocation, normalizeTitle } from './lead-utils.mjs';

function readJsonl(path) {
  if (!fs.existsSync(path)) return [];
  const lines = fs.readFileSync(path, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

function buildKeys(record) {
  const normalized = normalizeLead(record);
  const urlKey = normalized.url ? `url:${canonicalizeUrl(normalized.url)}` : null;
  const sourceIdKey = normalized.source && normalized.source_job_id ? `source:${normalized.source}:${normalized.source_job_id}` : null;
  const tupleKey = `tuple:${normalizeCompany(normalized.company)}|${normalizeTitle(normalized.title)}|${normalizeLocation(normalized.location)}`;
  const companyTitleKey = `ct:${normalizeCompany(normalized.company)}|${normalizeTitle(normalized.title)}`;
  return { normalized, urlKey, sourceIdKey, tupleKey, companyTitleKey };
}

export function dedupeCandidates(existingRecords, candidateRecords) {
  const seen = new Map();
  const accepted = [];
  const duplicates = [];

  for (const record of existingRecords) {
    const keys = buildKeys(record);
    for (const key of [keys.urlKey, keys.sourceIdKey, keys.tupleKey, keys.companyTitleKey].filter(Boolean)) {
      if (!seen.has(key)) seen.set(key, { type: 'existing', record: keys.normalized });
    }
  }

  for (const record of candidateRecords) {
    const keys = buildKeys(record);
    const possible = [keys.urlKey, keys.sourceIdKey, keys.tupleKey, keys.companyTitleKey].filter(Boolean);
    const hit = possible.find((key) => seen.has(key));
    if (hit) {
      duplicates.push({ record: keys.normalized, duplicate_of: seen.get(hit).record.id || null, matched_on: hit });
      continue;
    }

    accepted.push(keys.normalized);
    for (const key of possible) seen.set(key, { type: 'candidate', record: keys.normalized });
  }

  return { accepted, duplicates };
}

if (process.argv[1] && process.argv[1].endsWith('dedupe-leads.mjs')) {
  const [existingPath, candidatesPath] = process.argv.slice(2);
  if (!existingPath || !candidatesPath) {
    console.error('Usage: node dedupe-leads.mjs <existing.jsonl> <candidates.json>');
    process.exit(1);
  }

  const existing = readJsonl(existingPath);
  const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  console.log(JSON.stringify(dedupeCandidates(existing, candidates), null, 2));
}
