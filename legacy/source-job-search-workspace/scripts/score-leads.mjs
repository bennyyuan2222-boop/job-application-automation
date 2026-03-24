#!/usr/bin/env node
import fs from 'node:fs';
import { normalizeLead } from './lead-utils.mjs';

const titleBuckets = {
  5: ['data analyst', 'business analyst', 'analytics engineer', 'analytic engineer', 'ai product manager', 'product manager, ai'],
  4: ['product analyst', 'solutions analyst', 'revenue operations analyst', 'go to market analyst', 'ai solutions'],
  3: ['operations analyst', 'strategy analyst', 'business operations']
};

const preferredLocationTerms = ['new york', 'nyc', 'san francisco', 'bay area', 'remote'];
const preferredIndustries = ['ai', 'tech', 'fintech', 'devtools', 'healthcare', 'consumer', 'b2b saas', 'e-commerce', 'crm', 'real estate', 'fashion', 'vc'];

function includesAny(text, needles) {
  const hay = String(text || '').toLowerCase();
  return needles.some((n) => hay.includes(n));
}

function scoreTitle(title) {
  const lower = String(title || '').toLowerCase();
  for (const [score, phrases] of Object.entries(titleBuckets).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    if (phrases.some((phrase) => lower.includes(phrase))) return Number(score);
  }
  return 2;
}

function scoreLocation(location, remote) {
  const lower = String(location || '').toLowerCase();
  if (remote === true || lower.includes('remote')) return 5;
  if (preferredLocationTerms.some((term) => lower.includes(term))) return 5;
  if (lower.includes('united states') || lower.includes('usa')) return 4;
  return 3;
}

function scoreIndustry(industryHint, summary, company) {
  const corpus = [industryHint, summary, company].filter(Boolean).join(' ').toLowerCase();
  if (includesAny(corpus, preferredIndustries)) return 4;
  if (includesAny(corpus, ['government'])) return 1;
  if (corpus) return 3;
  return 3;
}

function scoreSeniority(title, seniorityHint, summary) {
  const corpus = [title, seniorityHint, summary].filter(Boolean).join(' ').toLowerCase();
  if (includesAny(corpus, ['senior', 'staff', 'principal', 'director', 'vp', 'vice president'])) return 1;
  if (includesAny(corpus, ['entry', 'junior', 'new grad', 'associate', 'early career'])) return 5;
  return 3;
}

function decide(scores) {
  const overall = Math.round((scores.title_fit + scores.location_fit + scores.industry_fit + scores.seniority_fit) / 4);
  if (overall >= 4) return { overall, decision: 'keep' };
  if (overall >= 3) return { overall, decision: 'maybe' };
  return { overall, decision: 'discard' };
}

function reasonFor(record, scores, decision) {
  const parts = [];
  if (scores.title_fit >= 4) parts.push('strong title fit');
  if (scores.location_fit >= 4) parts.push('acceptable location/work mode');
  if (scores.industry_fit >= 4) parts.push('plausibly attractive sector/company');
  if (scores.seniority_fit <= 2) parts.push('seniority risk');
  if (decision === 'maybe' && parts.length === 0) parts.push('mixed first-pass fit');
  if (decision === 'discard' && parts.length === 0) parts.push('weak first-pass alignment');
  return parts.join('; ');
}

export function scoreLead(raw) {
  const record = normalizeLead(raw);
  const scores = {
    title_fit: scoreTitle(record.title),
    location_fit: scoreLocation(record.location, record.remote),
    industry_fit: scoreIndustry(record.industry_hint, record.summary, record.company),
    seniority_fit: scoreSeniority(record.title, record.seniority_hint, record.summary)
  };
  const { overall, decision } = decide(scores);
  return {
    ...record,
    scores: { ...scores, overall },
    decision,
    reason: reasonFor(record, scores, decision)
  };
}

if (process.argv[1] && process.argv[1].endsWith('score-leads.mjs')) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node score-leads.mjs <candidates.json>');
    process.exit(1);
  }
  const candidates = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  console.log(JSON.stringify(candidates.map(scoreLead), null, 2));
}
