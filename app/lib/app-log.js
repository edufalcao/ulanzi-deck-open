'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** ~/Library/Logs/Ulanzi Deck Open/<name>.log */
function appLogPath(name, home = process.env.HOME || '') {
  // Windows has no HOME and no ~/Library: use %LOCALAPPDATA%.
  if (process.platform === 'win32' && !arguments[1]) {
    const base = process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData', 'Local');
    return path.join(base, 'Ulanzi Deck Open', 'Logs', `${name}.log`);
  }
  return path.join(home, 'Library', 'Logs', 'Ulanzi Deck Open', `${name}.log`);
}

/** Append one timestamped line; logging must never break the app. */
function appendAppLog(name, message, { file = appLogPath(name) } = {}) {
  const line = `${new Date().toISOString()} ${String(message || '').replace(/\s+$/, '')}\n`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, line);
  } catch {
    /* logging is best-effort */
  }
  return line;
}

module.exports = { appLogPath, appendAppLog };
