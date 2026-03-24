#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeLead } from './lead-utils.mjs';
import { scoreLead } from './score-leads.mjs';
import { dedupeCandidates } from './dedupe-leads.mjs';
import { runSearchQuery } from './jobspy-client.mjs';

const execFileAsync = promisify(execFile);
const root = '/Users/clawbot/.openclaw/workspace/job-search';
const leadsPath = path.join(root, 'data/leads/leads.jsonl');
const runsPath = path.join(root, 'data/leads/search-runs.md');
const logsDir = path.join(root, 'logs/job-search');
const runId = `${new Date().toISOString().slice(0, 10)}-run-${String(Date.now()).slice(-4)}`;

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
}

function appendJsonl(filePath, records) {
  if (!records.length) return;
  const payload = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(filePath, payload);
}

function appendRunSummary(text) {
  fs.appendFileSync(runsPath, '\n' + text.trimEnd() + '\n');
}

async function healthcheck() {
  try {
    const { stdout } = await execFileAsync('node', [path.join(root, 'scripts/jobspy-healthcheck.mjs')], { timeout: 20000 });
    return JSON.parse(stdout);
  } catch (error) {
    return { ok: false, blocker: String(error.message || error) };
  }
}

function loadQueryBatch() {
  return [
    { search_term: 'data analyst', search_location: 'New York, NY', limit: 8 },
    { search_term: 'business analyst', search_location: 'New York, NY', limit: 8 },
    { search_term: 'data analyst', search_location: 'Remote, US', limit: 8 },
    { search_term: 'business analyst', search_location: 'Remote, US', limit: 8 },
    { search_term: 'analytics engineer', search_location: 'Remote, US', limit: 6 }
  ];
}

function extractText(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return record[key];
  }
  return null;
}

function extractBoolean(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (/^(true|yes|remote)$/i.test(value)) return true;
      if (/^(false|no)$/i.test(value)) return false;
    }
  }
  return null;
}

function mapRawRecord(raw, query, source, index) {
  const title = extractText(raw, ['title', 'jobTitle', 'job_title', 'position', 'name']);
  const company = extractText(raw, ['company', 'companyName', 'company_name', 'employer']);
  const location = extractText(raw, ['location', 'city', 'jobLocation', 'job_location', 'location_display']) || query.search_location;
  const url = extractText(raw, ['url', 'jobUrl', 'job_url', 'jobUrlDirect', 'link', 'apply_url']);
  const summary = extractText(raw, ['description', 'summary', 'snippet']);
  const salaryMin = extractText(raw, ['salary_min', 'minAmount']);
  const salaryMax = extractText(raw, ['salary_max', 'maxAmount']);
  const salary = extractText(raw, ['salary', 'salary_text']) || (salaryMin || salaryMax ? `${salaryMin || '?'}-${salaryMax || '?'}` : null);
  const remote = extractBoolean(raw, ['remote', 'isRemote', 'is_remote', 'remote_allowed']);
  const datePosted = extractText(raw, ['date_posted', 'datePosted', 'posted_at', 'posted_date']);
  const employmentType = extractText(raw, ['employment_type', 'employmentType', 'jobType', 'job_type', 'schedule_type']);
  const sourceJobId = extractText(raw, ['id', 'job_id', 'listing_id', 'req_id']) || `${source}-${index}`;

  return normalizeLead({
    source,
    source_job_id: sourceJobId,
    search_term: query.search_term,
    search_location: query.search_location,
    title,
    company,
    location,
    url,
    summary,
    salary,
    remote,
    date_posted: datePosted,
    employment_type: employmentType,
    run_id: runId,
    signals: [],
    risks: []
  }, { run_id: runId, source, search_term: query.search_term, search_location: query.search_location });
}

async function executeQueries(queries) {
  const results = [];
  for (const query of queries) {
    const outcome = await runSearchQuery(query);
    results.push({ query, outcome });
    if (!outcome.ok) break;
  }
  return results;
}

async function main() {
  fs.mkdirSync(logsDir, { recursive: true });
  const health = await healthcheck();
  const queries = loadQueryBatch();
  const existing = readJsonl(leadsPath);

  if (!health.ok) {
    const blockedSummary = `### ${new Date().toLocaleString('en-US', { hour12: false, timeZone: 'America/New_York' })} EDT\n- Queries run: none (blocked before live execution)\n- Sources: none\n- New keeps: 0\n- Maybes: 0\n- Discards reviewed: 0\n- Duplicate merges: 0\n- Notes: sourcing runner health check failed; blocker: ${health.blocker || 'unknown'}\n- Recommended next search angle: restore JobSpy MCP connectivity, then run the focused analyst batch first\n`;
    const logPath = path.join(logsDir, `${new Date().toISOString().slice(0,10)}-${runId}-blocked.md`);
    fs.writeFileSync(logPath, `# Blocked sourcing run\n\nRun ID: ${runId}\n\n## Health check\n\n${JSON.stringify(health, null, 2)}\n\n## Planned queries\n\n${queries.map((q) => `- ${q.search_term} :: ${q.search_location}`).join('\n')}\n`);
    appendRunSummary(blockedSummary);
    console.log(JSON.stringify({ ok: false, run_id: runId, blocked: true, health, log_path: logPath }, null, 2));
    return;
  }

  const executionResults = await executeQueries(queries);
  const failedQuery = executionResults.find((item) => !item.outcome.ok);
  if (failedQuery) {
    const logPath = path.join(logsDir, `${new Date().toISOString().slice(0,10)}-${runId}-query-failed.md`);
    fs.writeFileSync(logPath, `# Query-path failed run\n\nRun ID: ${runId}\n\n## Health\n\n${JSON.stringify(health, null, 2)}\n\n## Query results\n\n${JSON.stringify(executionResults, null, 2)}\n`);
    const summary = `### ${new Date().toLocaleString('en-US', { hour12: false, timeZone: 'America/New_York' })} EDT\n- Queries run: ${executionResults.map((r) => `${r.query.search_term} in ${r.query.search_location}`).join('; ')}\n- Sources: ${failedQuery.outcome.server || 'configured MCP, but live call failed'}\n- New keeps: 0\n- Maybes: 0\n- Discards reviewed: 0\n- Duplicate merges: 0\n- Notes: live query path attempted but failed; blocker: ${failedQuery.outcome.blocker || 'unknown query failure'}\n- Recommended next search angle: inspect the server/tool schema and pin the exact JobSpy tool + payload shape\n`;
    appendRunSummary(summary);
    console.log(JSON.stringify({ ok: false, run_id: runId, blocked: true, stage: 'query', failure: failedQuery, log_path: logPath }, null, 2));
    return;
  }

  const rawCandidates = executionResults.flatMap((result) => {
    const source = result.outcome.server || 'unknown';
    return (result.outcome.records || []).map((record, index) => mapRawRecord(record, result.query, source, index));
  }).filter((record) => record.title && record.company && record.url);

  const scored = rawCandidates.map(scoreLead);
  const { accepted, duplicates } = dedupeCandidates(existing, scored);
  const keeps = accepted.filter((r) => r.decision === 'keep');
  const maybes = accepted.filter((r) => r.decision === 'maybe');
  const discards = accepted.filter((r) => r.decision === 'discard');

  appendJsonl(leadsPath, keeps);

  const logPath = path.join(logsDir, `${new Date().toISOString().slice(0,10)}-${runId}.md`);
  fs.writeFileSync(logPath, `# Sourcing run\n\nRun ID: ${runId}\n\n## Health\n\n${JSON.stringify(health, null, 2)}\n\n## Execution results\n\n${JSON.stringify(executionResults.map((result) => ({
    query: result.query,
    server: result.outcome.server,
    tool: result.outcome.tool,
    payload: result.outcome.payload,
    record_count: (result.outcome.records || []).length
  })), null, 2)}\n\n## Summary\n\n- raw candidates: ${rawCandidates.length}\n- keeps: ${keeps.length}\n- maybes: ${maybes.length}\n- discards: ${discards.length}\n- duplicates: ${duplicates.length}\n`);

  const summary = `### ${new Date().toLocaleString('en-US', { hour12: false, timeZone: 'America/New_York' })} EDT\n- Queries run: ${queries.map((q) => `${q.search_term} in ${q.search_location}`).join('; ')}\n- Sources: ${[...new Set(executionResults.map((r) => r.outcome.server).filter(Boolean))].join(', ') || 'unknown'}\n- New keeps: ${keeps.length}\n- Maybes: ${maybes.length}\n- Discards reviewed: ${discards.length}\n- Duplicate merges: ${duplicates.length}\n- Notes: live query execution is wired into the runner; results were normalized, scored, and deduped\n- Recommended next search angle: review keeps/maybes, then tighten title priority and rejection heuristics from real output\n`;
  appendRunSummary(summary);

  console.log(JSON.stringify({
    ok: true,
    run_id: runId,
    keeps: keeps.length,
    maybes: maybes.length,
    discards: discards.length,
    duplicates: duplicates.length,
    log_path: logPath,
    live_search: true
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, fatal: String(error.message || error) }, null, 2));
  process.exit(1);
});
