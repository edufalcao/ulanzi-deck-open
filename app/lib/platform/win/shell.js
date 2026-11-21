'use strict';

// `Run command` on Windows: cmd.exe instead of /bin/sh, and a tree kill
// instead of a process-group kill.

const { spawn, execFile } = require('node:child_process');

/** Same quoting Node uses for `shell: true`: cmd.exe /d /s /c "<command>". */
function spawnShell(command, stdio) {
  const comspec = process.env.ComSpec || 'cmd.exe';
  return spawn(comspec, ['/d', '/s', '/c', `"${String(command)}"`], {
    stdio,
    windowsHide: true,
    windowsVerbatimArguments: true,
  });
}

/** Kill a shell and everything it started. */
function killTree(pid) {
  if (!pid) return;
  try {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
  } catch {
    /* already gone */
  }
}

module.exports = { spawnShell, killTree };
