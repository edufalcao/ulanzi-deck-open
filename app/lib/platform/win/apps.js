'use strict';

// App list, app icons and "Close app" on Windows. The list comes from Start
// Menu shortcuts, resolved to their .exe so the frontmost-app path matches a
// profile's linked app.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function startMenuDirs(env = process.env) {
  const dirs = [];
  if (env.ProgramData) dirs.push(path.join(env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  return dirs;
}

function walkShortcuts(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkShortcuts(full, depth + 1, out);
    else if (/\.lnk$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const SKIP = /uninstall|unins\d*\.exe|desinstal|readme|help|documentation|release notes/i;

/**
 * [{ name, path }] sorted by name. `readShortcut` is electron's
 * shell.readShortcutLink (injected for tests).
 * @param {{ readShortcut?: (lnk: string) => { target?: string }, dirs?: string[] }} [options]
 */
function listApps({ readShortcut, dirs = startMenuDirs() } = {}) {
  const byTarget = new Map();
  for (const dir of dirs) {
    for (const lnk of walkShortcuts(dir)) {
      const name = path.basename(lnk, path.extname(lnk));
      if (SKIP.test(name)) continue;
      let target = '';
      try {
        target = readShortcut ? String(readShortcut(lnk)?.target || '') : '';
      } catch {
        target = '';
      }
      if (!/\.exe$/i.test(target) || SKIP.test(path.basename(target))) continue;
      const key = target.toLowerCase();
      if (!byTarget.has(key)) byTarget.set(key, { name, path: target });
    }
  }
  return [...byTarget.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A configured app is an .exe/.lnk path or a name like "notepad". */
function resolveAppPath(value) {
  const target = String(value || '').trim();
  if (!target) return null;
  try {
    if (fs.statSync(target).isFile()) return target;
  } catch {
    /* not a path */
  }
  return null;
}

/** "Chrome", "chrome.exe" or a full path → image name for taskkill. */
function imageName(value) {
  const base = path.win32.basename(String(value || '').trim());
  if (!base) return '';
  return /\.exe$/i.test(base) ? base : `${base}.exe`;
}

/** Ask the app to close (WM_CLOSE via taskkill), forcing it only if that fails. */
function closeApp(value) {
  const image = imageName(value);
  if (!image) return Promise.resolve({ ok: false, error: 'empty app name' });
  const run = (args) =>
    new Promise((resolve) => {
      execFile('taskkill', args, { windowsHide: true, timeout: 8000 }, (err, _stdout, stderr) =>
        resolve(err ? String(stderr || err.message).trim() : null)
      );
    });
  return run(['/IM', image]).then((error) => {
    if (!error) return { ok: true };
    if (/not found/i.test(error)) return { ok: false, error: `${image} is not running` };
    return run(['/IM', image, '/F']).then((forced) => (forced ? { ok: false, error: forced } : { ok: true }));
  });
}

module.exports = { listApps, startMenuDirs, resolveAppPath, imageName, closeApp };
