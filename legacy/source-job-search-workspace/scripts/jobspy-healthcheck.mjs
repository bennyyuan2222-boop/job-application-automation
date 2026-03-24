#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runCommand(args, timeout = 20000) {
  const { stdout, stderr } = await execFileAsync('mcporter', args, { timeout });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function run() {
  const result = {
    checked_at: new Date().toISOString(),
    ok: false,
    daemon_running: false,
    daemon_required: false,
    configured_servers: [],
    jobspy_like_servers: [],
    chosen_server: null,
    search_tool_found: false,
    blocker: null,
    notes: []
  };

  try {
    const { stdout } = await runCommand(['daemon', 'status'], 15000);
    result.daemon_running = /not running/i.test(stdout) ? false : /running/i.test(stdout);
    result.notes.push(stdout);
  } catch (error) {
    result.notes.push(String(error.message || error));
  }

  try {
    const { stdout } = await runCommand(['list', '--json'], 20000);
    const parsed = JSON.parse(stdout || '{}');
    const servers = Array.isArray(parsed.servers) ? parsed.servers : [];
    result.configured_servers = servers.map((s) => s.name || s.server || s.id).filter(Boolean);
    result.jobspy_like_servers = result.configured_servers.filter((name) => /jobspy|job|jobs/i.test(name));
  } catch (error) {
    result.blocker ??= 'mcporter list failed';
    result.notes.push(String(error.message || error));
  }

  if (result.jobspy_like_servers.length > 0) {
    result.chosen_server = result.jobspy_like_servers[0];
    try {
      const { stdout } = await runCommand(['list', result.chosen_server, '--schema', '--json'], 30000);
      const parsed = JSON.parse(stdout || '{}');
      const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
      result.search_tool_found = tools.some((tool) => /search.*job|job.*search|search/i.test(`${tool.name || ''} ${tool.description || ''}`));
      if (!result.search_tool_found) {
        result.blocker ??= `no search-like tool found on server ${result.chosen_server}`;
      }
    } catch (error) {
      result.blocker ??= `failed to inspect schema for server ${result.chosen_server}`;
      result.notes.push(String(error.message || error));
    }
  }

  if (result.configured_servers.length === 0) {
    result.blocker ??= 'no MCP servers are configured';
  } else if (result.jobspy_like_servers.length === 0) {
    result.blocker ??= 'no JobSpy-like MCP server is configured';
  } else if (!result.search_tool_found) {
    result.blocker ??= 'no search-like tool discovered';
  } else {
    result.ok = true;
  }

  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, fatal: String(error.message || error) }, null, 2));
  process.exit(1);
});
