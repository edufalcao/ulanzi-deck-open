'use strict';

// Windows support (lib/platform/win). The pure parts run everywhere; the
// integration tests run only on Windows.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const keys = require('../lib/platform/win/keys');
const { findOrphans } = require('../lib/platform/win/processes');
const { parseTypeperf } = require('../lib/platform/win/gpu');
const winApps = require('../lib/platform/win/apps');
const winPaths = require('../lib/platform/win/paths');

const onWindows = { skip: process.platform !== 'win32' && 'Windows only' };
const { VK } = keys;
const down = (vk, extended = false) => ({ vk, up: false, extended });
const up = (vk, extended = false) => ({ vk, up: true, extended });

test('win hotkeys: cmd maps to Ctrl and modifiers wrap the key in order', () => {
  assert.deepEqual(keys.hotkeyEvents('cmd+shift+4').events, [
    down(VK.CONTROL), down(VK.SHIFT), down(0x34), up(0x34), up(VK.SHIFT), up(VK.CONTROL),
  ]);
  assert.deepEqual(keys.hotkeyEvents('win+shift+s').events, [
    down(VK.SHIFT), down(VK.LWIN, true), down(0x53), up(0x53), up(VK.LWIN, true), up(VK.SHIFT),
  ]);
  // cmd and ctrl together are one Ctrl press.
  assert.equal(keys.hotkeyEvents('cmd+ctrl+c').events.filter((e) => e.vk === VK.CONTROL).length, 2);
});

test('win hotkeys: named, numpad and extended keys', () => {
  assert.deepEqual(keys.hotkeyEvents('left').events, [down(VK.LEFT, true), up(VK.LEFT, true)]);
  assert.equal(keys.hotkeyEvents('delete').events[0].vk, VK.BACK);
  assert.equal(keys.hotkeyEvents('f13').events[0].vk, VK.F1 + 12);
  assert.equal(keys.hotkeyEvents('numpad7').events[0].vk, VK.NUMPAD0 + 7);
  assert.deepEqual(keys.hotkeyEvents('numpadenter').events[0], down(VK.RETURN, true));
  assert.equal(keys.hotkeyEvents('ctrl++').events.at(-3).vk, VK.OEM_PLUS);
  assert.equal(keys.hotkeyEvents('ctrl+nope').error, 'unknown key: nope');
  assert.equal(keys.hotkeyEvents('').error, 'empty hotkey');
});

test('win text: UTF-16 units, surrogate pairs for emoji, Return for newlines', () => {
  const events = keys.textEvents('é😀\nx', true);
  const units = events.filter((e) => e.unicode !== undefined && !e.up).map((e) => e.unicode);
  assert.deepEqual(units, [0xe9, 0xd83d, 0xde00, 0x78]);
  assert.equal(events.filter((e) => e.vk === VK.RETURN && !e.up).length, 2);
});

test('win media keys cover every media op', () => {
  const { MEDIA_OPS } = require('../lib/actions-meta');
  for (const op of MEDIA_OPS) assert.ok(keys.mediaEvents(op), op);
  assert.equal(keys.mediaEvents('nope'), null);
});

test('win orphan sweep picks plugins whose parent is gone', () => {
  const rows = [
    { ProcessId: 10, ParentProcessId: 1, ExecutablePath: 'C:\\Users\\a\\Plugins\\x.sdPlugin\\bin\\x.exe', CommandLine: '' },
    { ProcessId: 11, ParentProcessId: 2, ExecutablePath: 'C:\\Program Files\\App\\app.exe', CommandLine: '"app.exe" C:\\Users\\a\\Plugins\\y\\app.js' },
    { ProcessId: 12, ParentProcessId: 3, ExecutablePath: 'C:\\Program Files\\App\\app.exe', CommandLine: 'unrelated' },
    { ProcessId: 13, ParentProcessId: 10, ExecutablePath: 'c:/users/a/plugins/z/z.exe', CommandLine: '' },
    { ProcessId: 2, ParentProcessId: 0, ExecutablePath: 'C:\\Windows\\explorer.exe', CommandLine: '' },
  ];
  // 10: native plugin, parent gone. 11: parent (2) alive. 12: not ours.
  // 13: parent 10 is alive in this snapshot. A trailing separator is optional.
  assert.deepEqual(findOrphans(rows, ['C:\\Users\\a\\Plugins\\'], ['C:\\Program Files\\App\\app.exe']), [10]);
  assert.deepEqual(findOrphans(rows, ['C:\\Users\\a\\Plugins'], ['C:\\Program Files\\App\\app.exe']), [10]);
});

test('win GPU parses a typeperf sample', () => {
  const csv = [
    '',
    '"(PDH-CSV 4.0)","\\\\PC\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage","\\\\PC\\GPU Engine(pid_2_engtype_3D)\\Utilization Percentage"',
    '"11/20/2026 10:00:00.000","12.5","30.1"',
    'Exiting, please wait...',
  ].join('\r\n');
  assert.equal(parseTypeperf(csv), 43);
  assert.equal(parseTypeperf(''), null);
});

test('win apps: shortcut list resolves to exes and drops uninstallers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-win-apps-'));
  fs.mkdirSync(path.join(dir, 'Tools'));
  for (const name of ['Editor.lnk', 'Tools/Uninstall Editor.lnk', 'Tools/Docs.lnk', 'Tools/Editor copy.lnk']) {
    fs.writeFileSync(path.join(dir, name), '');
  }
  const targets = {
    'Editor.lnk': 'C:\\Apps\\editor.exe',
    'Uninstall Editor.lnk': 'C:\\Apps\\unins000.exe',
    'Docs.lnk': 'C:\\Apps\\manual.pdf',
    'Editor copy.lnk': 'c:\\apps\\EDITOR.exe',
  };
  const apps = winApps.listApps({ dirs: [dir], readShortcut: (lnk) => ({ target: targets[path.basename(lnk)] }) });
  assert.deepEqual(apps, [{ name: 'Editor', path: 'C:\\Apps\\editor.exe' }]);
  assert.equal(winApps.imageName('C:\\Apps\\Chrome.exe'), 'Chrome.exe');
  assert.equal(winApps.imageName('notepad'), 'notepad.exe');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('win paths follow %APPDATA%', () => {
  const env = { APPDATA: 'D:\\Roam', 'ProgramFiles(x86)': 'D:\\PF86' };
  assert.equal(winPaths.ulanziIconsDir(env), path.join('D:\\Roam', 'Ulanzi', 'UlanziDeck', 'Icons'));
  assert.deepEqual(winPaths.ulanziPluginDirs(env), [
    path.join('D:\\Roam', 'Ulanzi', 'UlanziDeck', 'Plugins'),
    path.join('D:\\PF86', 'Ulanzi Studio', 'Plugins'),
  ]);
  assert.deepEqual(winPaths.streamDeckPluginDirs(env), [
    path.join('D:\\Roam', 'opendeck', 'plugins'),
    path.join('D:\\Roam', 'Elgato', 'StreamDeck', 'Plugins'),
  ]);
});

test('Stream Deck plugins on Windows prefer CodePathWin and run it natively', () => {
  const { codeForWindows } = require('../lib/streamdeck-plugins');
  assert.deepEqual(
    codeForWindows({ CodePathMac: 'mac/bin', CodePathWin: 'win/plugin.exe', CodePath: 'bin/plugin', OS: [{ Platform: 'mac' }, { Platform: 'windows' }] }),
    { path: 'win/plugin.exe', kind: 'native', wine: false }
  );
  assert.deepEqual(codeForWindows({ CodePaths: { 'x86_64-pc-windows-msvc': 'p.exe' }, OS: [] }), {
    path: 'p.exe',
    kind: 'native',
    wine: false,
  });
  // A Mac-only plugin still runs when its code is Node or HTML…
  assert.deepEqual(codeForWindows({ CodePath: 'plugin.js', OS: [{ Platform: 'mac' }] }), {
    path: 'plugin.js',
    kind: 'node',
    wine: false,
  });
  // …but never as a Mac binary.
  assert.equal(codeForWindows({ CodePath: 'bin/plugin', OS: [{ Platform: 'mac' }] }), null);
});

// ------------------------------------------------------------ Windows only

test('win command output runs through cmd.exe', onWindows, async () => {
  const { runCommandOutput } = require('../lib/actions');
  assert.deepEqual(await runCommandOutput('echo 42 & echo  is the answer'), { ok: true, text: '42 is the answer' });
  const failed = await runCommandOutput('echo nope 1>&2 & exit /b 3');
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'nope');
});

test('win command output timeout kills the whole tree', onWindows, async () => {
  const { runCommandOutput } = require('../lib/actions');
  const started = Date.now();
  const result = await runCommandOutput('ping -n 30 127.0.0.1 > nul & echo late', { timeout: 500 });
  assert.deepEqual(result, { ok: false, error: 'command timed out' });
  assert.ok(Date.now() - started < 10_000);
});

test('win ZIP extraction uses tar.exe', onWindows, async () => {
  const JSZip = require('jszip');
  const { extractZip, readZipEntry } = require('../lib/archive');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-win-zip-'));
  const zip = new JSZip();
  zip.file('a/manifest.json', '{"ok":true}');
  const source = path.join(dir, 'p.zip');
  fs.writeFileSync(source, await zip.generateAsync({ type: 'nodebuffer' }));
  await extractZip(source, path.join(dir, 'out'));
  assert.equal(fs.readFileSync(path.join(dir, 'out', 'a', 'manifest.json'), 'utf8'), '{"ok":true}');
  assert.equal(await readZipEntry(source, 'a/manifest.json'), '{"ok":true}');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('win app log lives under %LOCALAPPDATA%', onWindows, () => {
  const { appLogPath } = require('../lib/app-log');
  assert.equal(
    appLogPath('deck'),
    path.join(process.env.LOCALAPPDATA, 'Ulanzi Deck Open', 'Logs', 'deck.log')
  );
});

test('win frontmost app returns an exe path', onWindows, () => {
  const { frontmostApp } = require('../lib/platform/win/frontmost');
  const front = frontmostApp();
  // A headless CI session can have no foreground window.
  if (front) assert.match(front.path, /\.exe$/i);
});

test('Ulanzi Studio for Windows hotkeys import as Windows combos', () => {
  const { convertHotkey } = require('../lib/import-ulanzi');
  assert.equal(convertHotkey('Win+Shift+S'), 'shift+win+s');
  assert.equal(convertHotkey('Win+Alt+R'), 'alt+win+r');
  assert.equal(convertHotkey('Ctrl+Alt+Delete'), 'ctrl+alt+forwarddelete');
  assert.equal(convertHotkey('Ctrl+F5'), 'ctrl+f5');
  assert.equal(convertHotkey('Ctrl++'), 'ctrl+plus');
  // macOS glyph combos are unchanged.
  assert.equal(convertHotkey('⌃ ⌘ Q'), 'ctrl+cmd+q');
  assert.equal(convertHotkey('F5'), 'f5');
});
