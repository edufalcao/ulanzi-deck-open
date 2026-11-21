'use strict';

// Preloaded by `npm run test:win`. Upstream tests that assume macOS or POSIX
// (a /bin/sh command line, osascript/afplay/sips, .app bundles, symlinks that
// need admin rights on Windows, Unix file modes, ps) are skipped here instead
// of being edited one by one.
// Windows behaviour is covered by test/platform-win.test.js.

if (process.platform === 'win32') {
  const Module = require('node:module');

  const SKIP = {
    'POSIX shell command line': [
      'a failing command reports stderr with the key metadata',
      'a key command releases its pipes when the shell exits',
      'reports a failing shell command through the error handler',
      'does not report successful shell commands',
      'command output runs a command and parses stdout',
      'a failing command reports the last stderr line',
      'the output cap kills a runaway command',
      'a timed-out command kills its whole process group',
    ],
    'macOS tool (osascript, afplay, sips, ioreg, login shell)': [
      'close uses System Events',
      'playSound clamps volume, rejects missing files and stops cleanly',
      'appIconDataUrl converts through sips and caches the result',
      'a failed thumbnail falls back to the .icns path',
      'gpuPercent parses utilization and caches for five seconds',
      'applyLoginPath merges the login PATH into the supplied environment',
    ],
    'macOS path layout (.app bundles, ~/Library, POSIX absolute paths)': [
      'appLogPath points at the user Library Logs folder',
      'resolveAppPath accepts an existing bundle and rejects an empty name',
      'openView parameters stay out of the filename',
      'openView merges a query already present in the URL',
      'openView refuses paths outside the plugin root',
    ],
    'symlinks need admin rights or Developer Mode on Windows': [
      'command output reads an image file path',
      'isInsideReal rejects a symlink that leaves the root',
      'refuses a symlink that points outside the plugin directory',
      'openView refuses a symlink that escapes the plugin root',
      'the renderer directory is the only trusted file origin',
    ],
    'Unix file modes': [
      'login persists a private token file and logout removes it',
      'the config and its backup are written owner-only',
      'load tightens a config left world-readable by an older version',
    ],
    'stubbed unzip / ps': [
      'extractZip stops an archive that expands beyond the budget while unpacking',
      'a real orphaned plugin process is killed at startup',
    ],
  };
  const reasons = new Map();
  for (const [reason, names] of Object.entries(SKIP)) for (const name of names) reasons.set(name, reason);

  const realLoad = Module._load;
  let wrapped = null;
  Module._load = function (request, ...rest) {
    const loaded = realLoad.call(this, request, ...rest);
    if (request !== 'node:test' && request !== 'test') return loaded;
    if (!wrapped) {
      wrapped = function (name, ...args) {
        const reason = typeof name === 'string' && reasons.get(name);
        if (!reason) return loaded(name, ...args);
        return loaded(name, { skip: `Windows: ${reason}` }, () => {});
      };
      Object.assign(wrapped, loaded);
      wrapped.test = wrapped;
    }
    return wrapped;
  };
}
