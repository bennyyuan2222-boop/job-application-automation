#!/usr/bin/env node

export function normalizeWhitespace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeCompany(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[.,]+$/g, '')
    .replace(/\b(incorporated|inc|llc|ltd|corporation|corp|company|co)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(value) {
  let out = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[|/\-]+/g, ' ')
    .replace(/\b(i|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  out = out
    .replace(/^associate data analyst$/, 'associate data analyst')
    .replace(/^data analyst$/, 'data analyst')
    .replace(/^business analyst$/, 'business analyst');

  return out;
}

export function normalizeLocation(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\bnyc\b/g, 'new york, ny')
    .replace(/remote\s*-\s*us|united states remote/g, 'remote, us')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalizeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gh_jid', 'gh_src', 'lever-source', 'source'
    ];
    for (const key of trackingParams) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

export function buildDerivedId(record) {
  if (record.source && record.source_job_id) return `${record.source}:${record.source_job_id}`;
  return [record.source || 'unknown', normalizeCompany(record.company), normalizeTitle(record.title), normalizeLocation(record.location)]
    .join(':');
}

export function normalizeLead(raw, context = {}) {
  const normalized = {
    id: raw.id || buildDerivedId(raw),
    source: raw.source || context.source || 'unknown',
    source_job_id: raw.source_job_id || null,
    search_term: raw.search_term || context.search_term || null,
    search_location: raw.search_location || context.search_location || null,
    searched_at: raw.searched_at || context.searched_at || new Date().toISOString(),
    title: normalizeWhitespace(raw.title),
    company: normalizeWhitespace(raw.company),
    location: normalizeWhitespace(raw.location),
    remote: typeof raw.remote === 'boolean' ? raw.remote : null,
    hybrid: typeof raw.hybrid === 'boolean' ? raw.hybrid : null,
    url: canonicalizeUrl(raw.url),
    date_posted: raw.date_posted || null,
    salary: raw.salary || null,
    employment_type: raw.employment_type || null,
    seniority_hint: raw.seniority_hint || null,
    industry_hint: raw.industry_hint || null,
    summary: raw.summary || null,
    decision: raw.decision || null,
    scores: raw.scores || null,
    reason: raw.reason || null,
    signals: Array.isArray(raw.signals) ? raw.signals : [],
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    next_step: raw.next_step || null,
    status: raw.status || 'new',
    run_id: raw.run_id || context.run_id || null
  };

  return normalized;
}
