'use strict';

// The foreground window's process, in the same shape lsappinfo gives on macOS:
// { bundleId, name, path }. Windows has no bundle ids, so bundleId is the
// lower-case exe name — except for this app, which reports the macOS id the
// renderer already checks for.

const path = require('node:path');
const koffi = require('koffi');

const SELF_BUNDLE_ID = 'com.edufalcao.ulanzideckopen';
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

let api = null;
function bind() {
  if (api) return api;
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  api = {
    GetForegroundWindow: user32.func('void * __stdcall GetForegroundWindow()'),
    GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *pid)'),
    OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)'),
    QueryFullProcessImageNameW: kernel32.func(
      'int __stdcall QueryFullProcessImageNameW(void *h, uint32 flags, _Out_ uint8_t *buf, _Inout_ uint32 *size)'
    ),
    CloseHandle: kernel32.func('int __stdcall CloseHandle(void *h)'),
  };
  return api;
}

function processImage(pid) {
  const a = bind();
  const handle = a.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!handle) return '';
  try {
    const buf = Buffer.alloc(32768 * 2);
    const size = [32768];
    if (!a.QueryFullProcessImageNameW(handle, 0, buf, size)) return '';
    return buf.toString('utf16le', 0, size[0] * 2);
  } finally {
    a.CloseHandle(handle);
  }
}

function isSelf(pid, exe) {
  if (pid === process.pid) return true;
  return Boolean(exe) && path.resolve(exe).toLowerCase() === path.resolve(process.execPath).toLowerCase();
}

/** Synchronous and cheap (three syscalls), so no watcher process is needed. */
function frontmostApp() {
  try {
    const a = bind();
    const hwnd = a.GetForegroundWindow();
    if (!hwnd) return null;
    const pidOut = [0];
    a.GetWindowThreadProcessId(hwnd, pidOut);
    const pid = pidOut[0];
    if (!pid) return null;
    const exe = processImage(pid);
    if (isSelf(pid, exe)) return { bundleId: SELF_BUNDLE_ID, name: 'Ulanzi Deck Open', path: exe, pid };
    if (!exe) return null;
    const base = path.win32.basename(exe);
    return { bundleId: base.toLowerCase(), name: base.replace(/\.exe$/i, ''), path: exe, pid };
  } catch {
    return null;
  }
}

module.exports = { frontmostApp, processImage, SELF_BUNDLE_ID };
