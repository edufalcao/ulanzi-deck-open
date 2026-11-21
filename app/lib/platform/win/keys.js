'use strict';

// Pure key tables for SendInput. No FFI here, so the mapping is testable on any
// platform. Token names match the hotkey picker and lib/actions.js KEY_CODES.

const VK = {
  BACK: 0x08, TAB: 0x09, CLEAR: 0x0c, RETURN: 0x0d, SHIFT: 0x10, CONTROL: 0x11, MENU: 0x12,
  ESCAPE: 0x1b, SPACE: 0x20, PRIOR: 0x21, NEXT: 0x22, END: 0x23, HOME: 0x24,
  LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28, INSERT: 0x2d, DELETE: 0x2e,
  LWIN: 0x5b, NUMPAD0: 0x60, MULTIPLY: 0x6a, ADD: 0x6b, SUBTRACT: 0x6d, DECIMAL: 0x6e,
  DIVIDE: 0x6f, F1: 0x70,
  VOLUME_MUTE: 0xad, VOLUME_DOWN: 0xae, VOLUME_UP: 0xaf,
  MEDIA_NEXT_TRACK: 0xb0, MEDIA_PREV_TRACK: 0xb1, MEDIA_PLAY_PAUSE: 0xb3,
  OEM_1: 0xba, OEM_PLUS: 0xbb, OEM_COMMA: 0xbc, OEM_MINUS: 0xbd, OEM_PERIOD: 0xbe,
  OEM_2: 0xbf, OEM_3: 0xc0, OEM_4: 0xdb, OEM_5: 0xdc, OEM_6: 0xdd, OEM_7: 0xde,
};

const KEY_VK = {
  return: VK.RETURN, enter: VK.RETURN, tab: VK.TAB, space: VK.SPACE,
  // The picker's "Delete" is the Mac delete key, i.e. Backspace.
  delete: VK.BACK, backspace: VK.BACK, forwarddelete: VK.DELETE, del: VK.DELETE,
  insert: VK.INSERT, escape: VK.ESCAPE, esc: VK.ESCAPE,
  left: VK.LEFT, right: VK.RIGHT, up: VK.UP, down: VK.DOWN,
  home: VK.HOME, end: VK.END, pageup: VK.PRIOR, pagedown: VK.NEXT,
  '-': VK.OEM_MINUS, '=': VK.OEM_PLUS, plus: VK.OEM_PLUS, '[': VK.OEM_4, ']': VK.OEM_6,
  ';': VK.OEM_1, "'": VK.OEM_7, ',': VK.OEM_COMMA, '.': VK.OEM_PERIOD, '/': VK.OEM_2,
  '`': VK.OEM_3, '\\': VK.OEM_5,
  numpadplus: VK.ADD, numpadminus: VK.SUBTRACT, numpadmultiply: VK.MULTIPLY,
  numpaddivide: VK.DIVIDE, numpaddecimal: VK.DECIMAL, numpadenter: VK.RETURN,
  numpadclear: VK.CLEAR, numpadequal: VK.OEM_PLUS,
};
for (let i = 0; i < 26; i++) KEY_VK[String.fromCharCode(97 + i)] = 0x41 + i;
for (let i = 0; i <= 9; i++) {
  KEY_VK[String(i)] = 0x30 + i;
  KEY_VK[`numpad${i}`] = VK.NUMPAD0 + i;
}
for (let i = 1; i <= 24; i++) KEY_VK[`f${i}`] = VK.F1 + i - 1;

// `cmd` becomes Ctrl so Mac and Ulanzi Studio profiles (cmd+c, cmd+v) keep
// working; `win` is the Windows key.
const MOD_VK = {
  cmd: VK.CONTROL, command: VK.CONTROL, ctrl: VK.CONTROL, control: VK.CONTROL,
  alt: VK.MENU, option: VK.MENU, shift: VK.SHIFT,
  meta: VK.CONTROL, win: VK.LWIN, super: VK.LWIN,
};
const MOD_ORDER = [VK.CONTROL, VK.MENU, VK.SHIFT, VK.LWIN];

// Keys that need KEYEVENTF_EXTENDEDKEY, or Windows sends their numpad twin.
const EXTENDED = new Set([
  VK.LEFT, VK.RIGHT, VK.UP, VK.DOWN, VK.HOME, VK.END, VK.PRIOR, VK.NEXT,
  VK.INSERT, VK.DELETE, VK.DIVIDE, VK.LWIN,
  VK.VOLUME_MUTE, VK.VOLUME_DOWN, VK.VOLUME_UP,
  VK.MEDIA_NEXT_TRACK, VK.MEDIA_PREV_TRACK, VK.MEDIA_PLAY_PAUSE,
]);

const MEDIA_VK = {
  playpause: VK.MEDIA_PLAY_PAUSE,
  next: VK.MEDIA_NEXT_TRACK,
  prev: VK.MEDIA_PREV_TRACK,
  volumeup: VK.VOLUME_UP,
  volumedown: VK.VOLUME_DOWN,
  mute: VK.VOLUME_MUTE,
};

/** "cmd+shift+4" → [{vk, up:false, extended}, …] or {error}. */
function hotkeyEvents(combo) {
  const parts = String(combo || '')
    .toLowerCase()
    .split('+')
    .map((s) => s.trim());
  // "ctrl++" splits into a trailing empty token: that key is "+".
  if (parts.length > 1 && parts[parts.length - 1] === '' && parts[parts.length - 2] === '') {
    parts.splice(-2, 2, 'plus');
  }
  const tokens = parts.filter(Boolean);
  if (!tokens.length) return { error: 'empty hotkey' };
  const keyName = tokens.pop();
  const key = KEY_VK[keyName] ?? MOD_VK[keyName];
  if (key === undefined) return { error: `unknown key: ${keyName}` };
  const mods = [...new Set(tokens.map((m) => MOD_VK[m]).filter((v) => v !== undefined))].sort(
    (a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b)
  );
  const ev = (vk, up) => ({ vk, up, extended: EXTENDED.has(vk) || (keyName === 'numpadenter' && vk === VK.RETURN) });
  const events = [];
  for (const m of mods) events.push(ev(m, false));
  events.push(ev(key, false), ev(key, true));
  for (const m of [...mods].reverse()) events.push(ev(m, true));
  return { events };
}

/** UTF-16 code units for KEYEVENTF_UNICODE; newlines become Return presses. */
function textEvents(text, enter = false) {
  const events = [];
  for (const unit of String(text ?? '').replace(/\r\n?/g, '\n')) {
    if (unit === '\n') {
      events.push({ vk: VK.RETURN, up: false }, { vk: VK.RETURN, up: true });
      continue;
    }
    for (let i = 0; i < unit.length; i++) {
      const code = unit.charCodeAt(i);
      events.push({ unicode: code, up: false }, { unicode: code, up: true });
    }
  }
  if (enter) events.push({ vk: VK.RETURN, up: false }, { vk: VK.RETURN, up: true });
  return events;
}

function mediaEvents(op) {
  const vk = MEDIA_VK[op];
  if (vk === undefined) return null;
  return [
    { vk, up: false, extended: true },
    { vk, up: true, extended: true },
  ];
}

module.exports = { VK, KEY_VK, MOD_VK, MEDIA_VK, hotkeyEvents, textEvents, mediaEvents };
