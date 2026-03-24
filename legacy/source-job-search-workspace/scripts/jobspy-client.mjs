#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function execMcporter(args, timeout = 30000) {
  const { stdout, stderr } = await execFileAsync('mcporter', args, { timeout });
  return { stdout: stdout?.trim() || '', stderr: stderr?.trim() || '' };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function listServers() {
  const { stdout } = await execMcporter(['list', '--output', 'json']);
  const parsed = parseJsonSafe(stdout) || {};
  const servers = Array.isArray(parsed.servers) ? parsed.servers : [];
  return servers.map((server) => ({
    raw: server,
    name: server.name || server.server || server.id || null
  })).filter((server) => server.name);
}

export function pickJobServer(servers) {
  return servers.find((server) => /jobspy|job|jobs/i.test(server.name)) || null;
}

export async function describeServer(serverName) {
  const { stdout } = await execMcporter(['list', serverName, '--schema', '--json'], 30000);
  const parsed = parseJsonSafe(stdout) || {};
  const toolArrays = [parsed.tools, parsed.items, parsed.entries].filter(Array.isArray);
  const tools = toolArrays.flat().map((tool) => ({
    raw: tool,
    name: tool.name || tool.tool || tool.id || null,
    description: tool.description || ''
  })).filter((tool) => tool.name);
  return { raw: parsed, tools };
}

export function pickSearchTool(tools) {
  const patterns = [
    /search.*job/i,
    /job.*search/i,
    /^search$/i,
    /list.*job/i,
    /find.*job/i,
    /search/i,
    /job/i
  ];
  for (const pattern of patterns) {
    const hit = tools.find((tool) => pattern.test(tool.name) || pattern.test(tool.description || ''));
    if (hit) return hit;
  }
  return null;
}

function buildPayloads(query) {
  return [
    { query: query.search_term, location: query.search_location, limit: query.limit || 10 },
    { search_term: query.search_term, location: query.search_location, limit: query.limit || 10 },
    { title: query.search_term, location: query.search_location, limit: query.limit || 10 },
    { keyword: query.search_term, location: query.search_location, limit: query.limit || 10 },
    { query: query.search_term, location: query.search_location, results_wanted: query.limit || 10 },
    { search: query.search_term, location: query.search_location, results_wanted: query.limit || 10 }
  ];
}

async function tryCall(serverName, toolName, payload) {
  const selector = `${serverName}.${toolName}`;
  const args = ['call', selector, '--args', JSON.stringify(payload), '--output', 'json'];
  const { stdout, stderr } = await execMcporter(args, 45000);
  const parsed = parseJsonSafe(stdout);
  if (!parsed && !stdout) throw new Error(stderr || 'empty mcporter response');
  return { parsed: parsed ?? stdout, stderr, selector, payload };
}

function collectArrays(value, out = []) {
  if (Array.isArray(value)) {
    out.push(value);
    for (const item of value) collectArrays(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectArrays(child, out);
  }
  return out;
}

export function extractJobRecords(response) {
  const arrays = collectArrays(response);
  const candidates = arrays
    .filter((arr) => arr.length > 0)
    .map((arr) => ({
      array: arr,
      score: arr.reduce((sum, item) => {
        if (!item || typeof item !== 'object') return sum;
        const keys = Object.keys(item).join(' ').toLowerCase();
        const bump = /(title|company|location|job|url)/.test(keys) ? 1 : 0;
        return sum + bump;
      }, 0)
    }))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.array || [];
}

export async function runSearchQuery(query) {
  const servers = await listServers();
  const server = pickJobServer(servers);
  if (!server) {
    return { ok: false, blocker: 'no JobSpy-like MCP server is configured', servers };
  }

  const described = await describeServer(server.name);
  const tool = pickSearchTool(described.tools);
  if (!tool) {
    return { ok: false, blocker: `no search-like tool found on server ${server.name}`, server: server.name, tools: described.tools.map((t) => t.name) };
  }

  const attempts = [];
  for (const payload of buildPayloads(query)) {
    try {
      const result = await tryCall(server.name, tool.name, payload);
      const records = extractJobRecords(result.parsed);
      if (records.length > 0) {
        return {
          ok: true,
          server: server.name,
          tool: tool.name,
          payload,
          attempts,
          raw: result.parsed,
          records
        };
      }
      attempts.push({ payload, outcome: 'no_records' });
    } catch (error) {
      attempts.push({ payload, outcome: 'error', error: String(error.message || error) });
    }
  }

  return {
    ok: false,
    blocker: `all payload attempts failed for ${server.name}.${tool.name}`,
    server: server.name,
    tool: tool.name,
    attempts
  };
}

if (process.argv[1] && process.argv[1].endsWith('jobspy-client.mjs')) {
  const [searchTerm = 'data analyst', searchLocation = 'New York, NY'] = process.argv.slice(2);
  runSearchQuery({ search_term: searchTerm, search_location: searchLocation, limit: 5 })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, fatal: String(error.message || error) }, null, 2));
      process.exit(1);
    });
}
