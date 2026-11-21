'use strict';

/* global HOTKEY_MODS, HOTKEY_GLYPHS, hotkeyMods:writable, hotkeyKeyToken:writable, hotkeyKeyLabel:writable,
   hotkeyCategory:writable, canonicalMod:writable, hotkeyCombo:writable, prettyHotkey:writable,
   handleHotkeyKey:writable, hotkeyLabelFor, hotkeyCategoryFor, closeHotkeyModal, renderHotkeyModal, $ */

// Windows adjustments for the editor, kept in one file loaded last so the
// shared renderer scripts stay as they are upstream:
//  * hotkey picker: Ctrl / Alt / Shift / Win instead of ⌘ ⌃ ⌥ ⇧. `cmd` in
//    existing profiles is shown and sent as Ctrl.
//  * UI text: ⌘ shortcuts become Ctrl+…, Finder becomes Explorer, macOS
//    examples become Windows ones.
//  * macOS-only settings (Accessibility, key capture) are hidden.

const IS_WIN = /^win/i.test(navigator.platform || '');

if (IS_WIN) {
  document.documentElement.dataset.platform = 'win32';

  // ------------------------------------------------------------ hotkeys
  HOTKEY_MODS.splice(
    0,
    HOTKEY_MODS.length,
    { token: 'ctrl', label: 'Ctrl', symbol: 'Ctrl' },
    { token: 'alt', label: 'Alt', symbol: 'Alt' },
    { token: 'shift', label: 'Shift', symbol: 'Shift' },
    { token: 'win', label: 'Win', symbol: 'Win' }
  );
  Object.assign(HOTKEY_GLYPHS, {
    cmd: 'Ctrl', command: 'Ctrl', meta: 'Ctrl', ctrl: 'Ctrl', control: 'Ctrl',
    alt: 'Alt', option: 'Alt', shift: 'Shift', win: 'Win', super: 'Win',
    return: 'Enter', enter: 'Enter', tab: 'Tab', delete: 'Backspace', backspace: 'Backspace',
  });

  const WIN_MOD_ORDER = ['ctrl', 'alt', 'shift', 'win'];

  canonicalMod = function (token) {
    const t = String(token || '').toLowerCase();
    if (['cmd', 'command', 'meta', 'ctrl', 'control'].includes(t)) return 'ctrl';
    if (t === 'alt' || t === 'option') return 'alt';
    if (t === 'shift') return 'shift';
    if (t === 'win' || t === 'super') return 'win';
    return null;
  };

  hotkeyCombo = function () {
    if (!hotkeyKeyToken) return '';
    return [...WIN_MOD_ORDER.filter((m) => hotkeyMods.has(m)), hotkeyKeyToken].join('+');
  };

  prettyHotkey = function (value) {
    return String(value || '')
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => HOTKEY_GLYPHS[part.toLowerCase()] || part.toUpperCase())
      .join('+');
  };

  const modsFromEvent = (e) => {
    const mods = new Set();
    if (e.ctrlKey) mods.add('ctrl');
    if (e.altKey) mods.add('alt');
    if (e.shiftKey) mods.add('shift');
    if (e.metaKey) mods.add('win');
    return mods;
  };

  handleHotkeyKey = function (e) {
    if ($('#hotkey-modal').classList.contains('hidden')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      closeHotkeyModal();
      return;
    }
    hotkeyMods = modsFromEvent(e);
    if (['Meta', 'OS', 'Control', 'Alt', 'Shift'].includes(e.key)) {
      renderHotkeyModal();
      return;
    }
    // eslint-disable-next-line no-undef
    const token = physicalKeyToken(e);
    if (token) {
      hotkeyKeyToken = token;
      hotkeyKeyLabel = hotkeyLabelFor(token);
      hotkeyCategory = hotkeyCategoryFor(token);
      renderHotkeyModal();
    }
  };

  // ------------------------------------------------------------ UI text
  const TEXT = [
    [/⌘\s?/g, 'Ctrl+'],
    [/⌥/g, 'Alt+'],
    [/Reveal in Finder/g, 'Show in Explorer'],
    [/in the menu bar/g, 'in the system tray'],
    [/Applications from \/Applications, \/System\/Applications and ~\/Applications\./g, 'Apps from the Start menu.'],
  ];
  const PLACEHOLDERS = {
    'Safari or /Applications/Safari.app': 'notepad or C:\\Path\\To\\App.exe',
    Safari: 'notepad',
    "osascript -e '…'": 'powershell -Command "…"',
    "osascript -e 'set volume output muted'": 'powershell -Command "Get-Date"',
  };

  const fixText = (text) => {
    let out = text;
    for (const [pattern, replacement] of TEXT) out = out.replace(pattern, replacement);
    return out;
  };
  const fixNode = (node) => {
    if (node.nodeType === 3) {
      const fixed = fixText(node.nodeValue || '');
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = /** @type {Element} */ (node);
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && PLACEHOLDERS[placeholder]) el.setAttribute('placeholder', PLACEHOLDERS[placeholder]);
    const title = el.getAttribute('title');
    if (title) {
      const fixed = fixText(title);
      if (fixed !== title) el.setAttribute('title', fixed);
    }
    for (const child of el.childNodes) fixNode(child);
  };

  const hideMacOnly = () => {
    const accessibility = document.getElementById('accessibility-state')?.closest('.settings-row');
    if (accessibility) {
      accessibility.classList.add('hidden');
      const note = accessibility.nextElementSibling;
      if (note?.classList.contains('settings-note')) note.classList.add('hidden');
    }
  };

  const start = () => {
    fixNode(document.body);
    hideMacOnly();
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') fixNode(record.target);
        else if (record.type === 'attributes') fixNode(record.target);
        else record.addedNodes.forEach(fixNode);
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title'],
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
