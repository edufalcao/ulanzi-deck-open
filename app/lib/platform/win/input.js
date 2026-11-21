'use strict';

// SendInput through koffi: hotkeys, Unicode text and media keys without a
// helper binary. Events from lib/platform/win/keys.js.

const koffi = require('koffi');
const { hotkeyEvents, textEvents, mediaEvents } = require('./keys');

const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x1;
const KEYEVENTF_KEYUP = 0x2;
const KEYEVENTF_UNICODE = 0x4;
const MAPVK_VK_TO_VSC = 0;

let api = null;
function bind() {
  if (api) return api;
  const user32 = koffi.load('user32.dll');
  const MOUSEINPUT = koffi.struct('UDO_MOUSEINPUT', {
    dx: 'long', dy: 'long', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
  });
  const KEYBDINPUT = koffi.struct('UDO_KEYBDINPUT', {
    wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
  });
  const HARDWAREINPUT = koffi.struct('UDO_HARDWAREINPUT', { uMsg: 'uint32', wParamL: 'uint16', wParamH: 'uint16' });
  const INPUT = koffi.struct('UDO_INPUT', {
    type: 'uint32',
    u: koffi.union('UDO_INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
  });
  api = {
    INPUT,
    size: koffi.sizeof(INPUT),
    SendInput: user32.func('uint32 __stdcall SendInput(uint32 cInputs, UDO_INPUT *pInputs, int cbSize)'),
    MapVirtualKeyW: user32.func('uint32 __stdcall MapVirtualKeyW(uint32 uCode, uint32 uMapType)'),
    GetLastError: koffi.load('kernel32.dll').func('uint32 __stdcall GetLastError()'),
  };
  return api;
}

function toInput(event, a) {
  if (event.unicode !== undefined) {
    return {
      type: INPUT_KEYBOARD,
      u: { ki: { wVk: 0, wScan: event.unicode, dwFlags: KEYEVENTF_UNICODE | (event.up ? KEYEVENTF_KEYUP : 0), time: 0, dwExtraInfo: 0 } },
    };
  }
  let flags = event.up ? KEYEVENTF_KEYUP : 0;
  if (event.extended) flags |= KEYEVENTF_EXTENDEDKEY;
  return {
    type: INPUT_KEYBOARD,
    u: { ki: { wVk: event.vk, wScan: a.MapVirtualKeyW(event.vk, MAPVK_VK_TO_VSC) & 0xffff, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
  };
}

/** Post events in one SendInput call so modifiers cannot interleave with real typing. */
function send(events) {
  if (!events.length) return { ok: true };
  let a;
  try {
    a = bind();
  } catch (err) {
    return { ok: false, error: `SendInput is unavailable: ${err.message}` };
  }
  const inputs = events.map((event) => toInput(event, a));
  // Long text goes in chunks; one huge batch can be dropped by busy apps.
  for (let i = 0; i < inputs.length; i += 200) {
    const chunk = inputs.slice(i, i + 200);
    const sent = a.SendInput(chunk.length, chunk, a.size);
    if (sent !== chunk.length) {
      // UIPI: Windows silently blocks input to elevated (admin) windows.
      return {
        ok: false,
        error: `Windows blocked the keystroke (error ${a.GetLastError()}). The target window may be running as administrator.`,
      };
    }
  }
  return { ok: true };
}

function hotkey(combo) {
  const built = hotkeyEvents(combo);
  if (built.error) return { ok: false, error: built.error };
  return send(built.events);
}

function typeText(text, enter = false) {
  return send(textEvents(text, enter));
}

function mediaKey(op) {
  const events = mediaEvents(op);
  if (!events) return { ok: false, error: `unknown media key: ${op}` };
  return send(events);
}

module.exports = { hotkey, typeText, mediaKey, send };
