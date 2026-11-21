'use strict';

// Windows half of lib/orphan-cleanup.js. Windows does not re-parent orphans to
// PID 1, so a leftover plugin is a process whose parent no longer exists and
// whose executable or command line points into one of our plugin folders.

const { execFile } = require('node:child_process');

const PS_QUERY =
  'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress';

function norm(value) {
  return String(value || '').replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();
}

/** Pure: pick orphan pids from Win32_Process rows. */
function findOrphans(rows, roots, runtimes = []) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const alive = new Set(list.map((row) => Number(row.ProcessId)));
  const wanted = roots.filter(Boolean).map((root) => `${norm(root)}\\`);
  const nodes = runtimes.filter(Boolean).map(norm);
  const pids = [];
  for (const row of list) {
    const pid = Number(row.ProcessId);
    const ppid = Number(row.ParentProcessId);
    if (!pid || pid === process.pid || alive.has(ppid)) continue;
    const exe = norm(row.ExecutablePath);
    const command = norm(row.CommandLine);
    const native = wanted.some((root) => exe.startsWith(root));
    const node = nodes.includes(exe) && wanted.some((root) => command.includes(root));
    if (native || node) pids.push(pid);
  }
  return pids;
}

/** Async: the CIM query takes a second or two, so never block startup on it. */
function cleanOrphans({ roots = [], runtimes = [], log = console.log } = {}) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_QUERY],
      { windowsHide: true, timeout: 20000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        let rows = [];
        try {
          rows = JSON.parse(String(stdout || '[]'));
        } catch {
          return resolve([]);
        }
        const pids = findOrphans(rows, roots, runtimes);
        for (const pid of pids) {
          try {
            process.kill(pid);
          } catch {
            /* already gone */
          }
        }
        if (pids.length) log(`[orphans] killed ${pids.length} leftover plugin process(es)`);
        resolve(pids);
      }
    );
  });
}

module.exports = { findOrphans, cleanOrphans };
