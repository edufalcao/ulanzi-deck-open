'use strict';

// Windows support lives here, so shared files only need a short
// `if (win) return win.x(...)` guard and the macOS code paths stay untouched.
// `win` is null on every other platform; the modules load lazily because some
// of them bind user32/kernel32 through koffi.

const isWin = process.platform === 'win32';

const cache = {};
function lazy(name) {
  if (!(name in cache)) cache[name] = require(`./win/${name}`);
  return cache[name];
}

const win = isWin
  ? {
      get input() { return lazy('input'); },
      get keys() { return lazy('keys'); },
      get frontmost() { return lazy('frontmost'); },
      get apps() { return lazy('apps'); },
      get shell() { return lazy('shell'); },
      get paths() { return lazy('paths'); },
      get processes() { return lazy('processes'); },
      get gpu() { return lazy('gpu'); },
      get sound() { return lazy('sound'); },
    }
  : null;

module.exports = { isWin, win };
