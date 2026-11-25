'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../renderer/press.js'), 'utf8');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeHarness(t, overrides = {}, fakeTimers = true) {
  const calls = {
    actions: [],
    plugins: [],
    pluginKeys: [],
    toasts: [],
    navigations: [],
    profiles: [],
    exitStandby: 0,
    activity: 0,
    push: 0,
  };
  const page = { id: 'page', profileId: 'profile', keys: {}, parentId: null };
  const key = { action: { type: 'app', value: 'app' } };
  const state = {
    config: {
      activeProfileId: 'profile',
      activePageId: 'page',
      settings: { brightness: 50 },
      pages: [page],
    },
    plugins: [],
    selected: null,
  };
  const api = {
    runAction: async (action) => {
      calls.actions.push(action);
      return { ok: true };
    },
    runPluginAction: async (actionid) => {
      calls.plugins.push(actionid);
      return { ok: true };
    },
    pluginKey: (actionid, pressed) => calls.pluginKeys.push([actionid, pressed]),
    showPop: async () => 1,
    setBrightness: () => {},
    setWideMode: (mode) => calls.wideMode.push(mode),
    requestAccessibility: () => {},
  };
  calls.wideMode = [];
  const context = {
    state,
    WIDE_KEY_INDEX: 13,
    api,
    keyAt: () => key,
    activePage: () => page,
    pinnedFor: () => ({}),
    navigate: (id) => calls.navigations.push(id),
    switchProfile: (id) => calls.profiles.push(id),
    lockActive: () => false,
    standbyActive: () => false,
    exitStandby: () => {
      calls.exitStandby += 1;
    },
    noteActivity: () => {
      calls.activity += 1;
    },
    notePluginKeyPress: () => {},
    drawIndex: () => {},
    renderInspector: () => {},
    refreshWideStats: () => {},
    scheduleSave: () => {},
    commit: () => {},
    pushNow: () => {
      calls.push += 1;
    },
    scheduleLivePush: () => {},
    toast: (...args) => calls.toasts.push(args),
    actionMeta: () => ({ label: 'App' }),
    actionIconSrc: () => '',
    $: () => ({ children: [] }),
    window: { KeyRenderer: { truncateMain: (text) => text } },
    document: { getElementById: () => null },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    ...overrides,
  };
  if (fakeTimers && t) t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  vm.createContext(context);
  new vm.Script(source, { filename: 'press.js' }).runInContext(context);
  return { context, calls, state, page, key };
}

test('a tap runs once on press, not on release', async (t) => {
  const { context, calls } = makeHarness(t);

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.deepEqual(calls.actions, [{ type: 'app', value: 'app' }]);
});

test('a locked deck ignores key events', async (t) => {
  const { context, calls } = makeHarness(t, { lockActive: () => true });

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.equal(calls.actions.length, 0);
});

test('the first press while standby is up only wakes the deck', async (t) => {
  let standby = true;
  const { context, calls } = makeHarness(t, {
    standbyActive: () => standby,
    exitStandby: () => {
      calls.exitStandby += 1;
      standby = false;
    },
  });

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.equal(calls.exitStandby, 1);
  assert.equal(calls.actions.length, 0);
});

test('a hold fires at holdMs and suppresses the tap', async (t) => {
  const { context, calls, key } = makeHarness(undefined, {}, false);
  key.holdAction = { type: 'app', value: 'hold' };
  key.holdMs = 150;

  context.handleKeyEvent(0, true);
  await new Promise((resolve) => setTimeout(resolve, 180));
  context.handleKeyEvent(0, false);
  await flush();

  assert.deepEqual(calls.actions, [{ type: 'app', value: 'hold' }]);
});

test('a double press runs the double action instead of the tap', async (t) => {
  const { context, calls, key } = makeHarness(undefined, {}, false);
  key.doubleAction = { type: 'app', value: 'double' };

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await new Promise((resolve) => setTimeout(resolve, 70));
  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.deepEqual(calls.actions, [{ type: 'app', value: 'double' }]);
});

test('a bounce inside 60 ms is ignored', async (t) => {
  const { context, calls } = makeHarness(t);

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, true);
  await flush();

  assert.equal(calls.actions.length, 1);
});

test('Stream Deck plugin keys forward press and release without a tap', async (t) => {
  const { context, calls, key } = makeHarness(t);
  key.action = { type: 'plugin', sdk: 'streamdeck', actionid: 'plugin-action' };

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.deepEqual(calls.pluginKeys, [
    ['plugin-action', true],
    ['plugin-action', false],
  ]);
  assert.equal(calls.actions.length, 0);
});

test('the wide key cycles the panel without running an action', async (t) => {
  const { context, calls, page } = makeHarness(undefined, {}, false);

  context.handleKeyEvent(13, true);
  await new Promise((resolve) => setTimeout(resolve, 70));
  context.handleKeyEvent(13, true);
  await new Promise((resolve) => setTimeout(resolve, 70));
  context.handleKeyEvent(13, true);

  assert.deepEqual(calls.wideMode, ['stats', 'blank', 'clock']);
  assert.equal(page.wideMode, undefined);
  assert.equal(calls.actions.length, 0);
});

test('multi runs sequential steps and delays in order', async (t) => {
  const { context, calls } = makeHarness(undefined, {}, false);

  const result = await context.runMulti({
    type: 'multi',
    mode: 'sequence',
    steps: [
      { action: { type: 'app', value: 'first' } },
      { delay: 1 },
      { action: { type: 'app', value: 'second' } },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.actions.map((action) => action.value), ['first', 'second']);
});

test('toggle alternates between its two actions', async (t) => {
  const { context, calls } = makeHarness(t);
  const action = {
    type: 'toggle',
    steps: [
      { action: { type: 'app', value: 'one' } },
      { action: { type: 'app', value: 'two' } },
    ],
  };

  await context.runToggle(action);
  await context.runToggle(action);
  await context.runToggle(action);

  assert.deepEqual(calls.actions.map((item) => item.value), ['one', 'two', 'one']);
});

test('a POP selection runs the chosen item', async (t) => {
  const { context, calls } = makeHarness(t);

  await context.openPop({
    type: 'pop',
    steps: [
      { action: { type: 'app', value: 'zero' } },
      { action: { type: 'app', value: 'one' } },
    ],
  });
  await flush();

  assert.deepEqual(calls.actions, [{ type: 'app', value: 'one' }]);
});

test('formatTimer renders hours, minutes and seconds', () => {
  const { context } = makeHarness();

  assert.equal(context.formatTimer(0), '0:00');
  assert.equal(context.formatTimer(65), '1:05');
  assert.equal(context.formatTimer(3661), '1:01:01');
});

test('a timer counts down, beeps on finish and clears its face', async () => {
  const { context, calls, key, page } = makeHarness(undefined, {}, false);
  const timer = { type: 'timer', seconds: 1, sound: true };
  key.action = timer;
  page.keys[0] = key;

  context.toggleTimer(timer);
  assert.match(context.timerTextFor(timer), /^0:0[01]$/);
  assert.equal(calls.toasts.some(([message]) => /Timer started/.test(message)), true);

  const deadline = Date.now() + 3000;
  while (context.timerTextFor(timer) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(context.timerTextFor(timer), '');
  assert.equal(calls.toasts.some(([message]) => message === 'Timer finished'), true);
  assert.equal(
    calls.actions.some((action) => action.type === 'command' && /afplay/.test(action.value)),
    true
  );
  assert.ok(calls.push > 0);
});

test('a second timer press cancels it without a beep', () => {
  const { context, calls, key, page } = makeHarness();
  const timer = { type: 'timer', seconds: 1, sound: true };
  key.action = timer;
  page.keys[0] = key;

  context.toggleTimer(timer);
  context.toggleTimer(timer);

  assert.equal(context.timerTextFor(timer), '');
  assert.equal(calls.toasts.some(([message]) => message === 'Timer cancelled'), true);
  assert.equal(calls.actions.some((action) => /afplay/.test(action.value)), false);
});

test('a running timer updates one key instead of pushing the page', async (t) => {
  const live = [];
  const { context, calls, key, page } = makeHarness(
    undefined,
    { scheduleLivePush: (index) => live.push(index) },
    false
  );
  const timer = { type: 'timer', seconds: 300, sound: false };
  key.action = timer;
  page.keys[0] = key;
  t.after(() => context.toggleTimer(timer));

  context.toggleTimer(timer);
  await new Promise((resolve) => setTimeout(resolve, 1100));

  assert.ok(live.length >= 2, `expected a per-second key update, got ${live.length}`);
  assert.deepEqual([...new Set(live)], [0], 'only the timer key is sent');
  assert.equal(calls.push, 0, 'the full page is not pushed while the timer runs');
});

test('a running timer keeps counting across a page change', async () => {
  const { context, key, page } = makeHarness(undefined, {}, false);
  const timer = { type: 'timer', seconds: 600, sound: false };
  key.action = timer;
  page.keys[0] = key;
  const other = { id: 'other', profileId: 'profile', keys: {} };
  context.state.config.pages.push(other);

  context.toggleTimer(timer);
  const before = context.timerTextFor(timer);

  context.state.config.activePageId = 'other';
  await new Promise((resolve) => setTimeout(resolve, 1100));
  context.state.config.activePageId = 'page';
  const after = context.timerTextFor(timer);

  assert.notEqual(after, '', 'the timer is still in the map after the page change');
  assert.notEqual(after, before, 'the remaining time kept counting down');
  context.toggleTimer(timer);
});

test('a timer survives the inspector replacing its action object', async () => {
  const { context, key, page } = makeHarness(undefined, {}, false);
  const timer = { type: 'timer', seconds: 600, sound: false };
  key.action = timer;
  page.keys[0] = key;

  context.toggleTimer(timer);
  const before = context.timerTextFor(timer);
  assert.match(before, /^\d+:\d{2}$/);

  // Editing the duration or sound in the inspector replaces key.action.
  const replacement = { ...timer };
  page.keys[0] = { ...key, action: replacement };
  assert.equal(context.timerTextFor(replacement), before, 'the countdown follows the slot');

  context.toggleTimer(replacement);
  assert.equal(context.timerTextFor(replacement), '', 'cancel found the running timer');
});

function brightnessHarness(t, overrides = {}) {
  const levels = [];
  // Resolve timers lazily so they hit the mocked globals.
  const harness = makeHarness(t, {
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    setInterval: (...args) => globalThis.setInterval(...args),
    clearInterval: (...args) => globalThis.clearInterval(...args),
    ...overrides,
  });
  harness.context.api.setBrightness = (level) => levels.push(level);
  return { ...harness, levels };
}

test('brightness off darkens the deck only after the key is released', async (t) => {
  const { context, state, key, levels } = brightnessHarness(t);
  key.action = { type: 'brightness', op: 'off' };

  context.handleKeyEvent(0, true);
  await flush();
  t.mock.timers.tick(1000);
  assert.deepEqual(levels, []);

  context.handleKeyEvent(0, false);
  t.mock.timers.tick(249);
  assert.deepEqual(levels, []);
  t.mock.timers.tick(1);
  assert.deepEqual(levels, [0]);
  assert.equal(state.config.settings.brightness, 50);
});

test('brightness off waits for every held key', async (t) => {
  const { context, key, levels } = brightnessHarness(t);
  key.action = { type: 'none' };
  context.handleKeyEvent(5, true);
  key.action = { type: 'brightness', op: 'off' };
  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();
  t.mock.timers.tick(1000);
  assert.deepEqual(levels, []);

  context.handleKeyEvent(5, false);
  t.mock.timers.tick(250);
  assert.deepEqual(levels, [0]);
});

test('keys after brightness off run normally (the firmware handles waking)', async (t) => {
  const { context, calls, key, levels } = brightnessHarness(t);
  key.action = { type: 'brightness', op: 'off' };
  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();
  t.mock.timers.tick(250);

  key.action = { type: 'app', value: 'app' };
  context.handleKeyEvent(1, true);
  context.handleKeyEvent(1, false);
  await flush();
  assert.deepEqual(levels, [0]);
  assert.deepEqual(calls.actions, [{ type: 'app', value: 'app' }]);
});

test('clearDeckOff cancels a turn-off that has not gone dark yet', async (t) => {
  const { context, key, levels } = brightnessHarness(t);
  key.action = { type: 'brightness', op: 'off' };
  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  context.clearDeckOff();
  t.mock.timers.tick(250);
  assert.deepEqual(levels, []);
});

test('brightness off forgets a key whose release never arrives', async (t) => {
  let now = 1_000_000;
  const { context, key, levels } = brightnessHarness(t, {
    Date: { now: () => now },
  });
  key.action = { type: 'brightness', op: 'off' };
  context.handleKeyEvent(0, true);
  await flush();
  t.mock.timers.tick(1000);
  assert.deepEqual(levels, []);

  now += 6000;
  t.mock.timers.tick(250);
  assert.deepEqual(levels, [0]);
});

test('brightness off waits for an upload in flight', async (t) => {
  const { context, key, levels } = brightnessHarness(t);
  let finish;
  const upload = context.trackDeckPush(new Promise((resolve) => (finish = resolve)));
  key.action = { type: 'brightness', op: 'off' };
  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();
  t.mock.timers.tick(1000);
  assert.deepEqual(levels, []);

  finish();
  await upload;
  t.mock.timers.tick(250);
  assert.deepEqual(levels, [0]);
});

// The real push code (ui.js) and screensaver (app.js) around the turn-off.
function offHarness(t) {
  const harness = brightnessHarness(t);
  const { context, state } = harness;
  const sent = [];
  const read = (file) => fs.readFileSync(path.join(__dirname, '../renderer', file), 'utf8');
  const slice = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
  const ui = read('ui.js');
  const app = read('app.js');
  state.status = { connected: true };
  Object.assign(state.config.settings, { autoPush: true, standbySeconds: 20, lockScreen: true });
  context.api.pushPage = async () => (sent.push('page'), { ok: true });
  context.api.pushKey = async () => (sent.push('key'), { ok: true });
  const tile = {
    classList: { add: () => {}, remove: () => {} },
    querySelector: () => ({ toDataURL: () => 'data:image/png;base64,AA==' }),
  };
  const grid = { children: Array.from({ length: 14 }, () => tile), textContent: '' };
  Object.assign(context, {
    $: () => grid,
    COLS: 5,
    LIVE_PUSH_INTERVAL: 1000,
    LIVE_PUSH_URGENT_INTERVAL: 150,
    drawGrid: async () => {},
    renderPushButton: () => {},
    renderSyncState: () => {},
    renderStandbySlices: async () => [],
    scheduleAutoExit: () => {},
  });
  const push = slice(ui, 'let livePushTimer', '// ------------------------------------------------------------------ pages');
  const saver = slice(app, 'const standby = {', 'function bind()');
  const lock = /const lock = \{/.test(saver) ? '' : 'const lock = { active: false };';
  const lockFn = /function lockActive/.test(saver) ? '' : 'function lockActive() { return lock.active; }';
  new vm.Script(`let pushTimer = null;\n${push}\n${lock}\n${lockFn}\n${saver}`).runInContext(context);
  const settle = async () => {
    for (let i = 0; i < 6; i += 1) await flush();
  };
  const tick = async (ms) => {
    t.mock.timers.tick(ms);
    await settle();
  };
  const turnOff = async () => {
    harness.key.action = { type: 'brightness', op: 'off' };
    context.handleKeyEvent(0, true);
    context.handleKeyEvent(0, false);
    await tick(250);
    assert.deepEqual(harness.levels, [0]);
    harness.key.action = { type: 'none' };
    sent.length = 0;
  };
  return { ...harness, sent, tick, turnOff };
}

test('the screensaver starts on a lit deck', async (t) => {
  const { context, sent, tick } = offHarness(t);
  context.scheduleStandby();
  await tick(20_000);
  assert.deepEqual(sent, ['page']);
});

test('the screensaver does not light a deck that is off', async (t) => {
  const { context, sent, tick, turnOff } = offHarness(t);
  context.scheduleStandby();
  await turnOff();
  for (let i = 0; i < 5; i += 1) await tick(20_000);
  assert.deepEqual(sent, []);
  assert.equal(context.standbyActive(), false);
});

test('automatic pushes wait for the next key event, then send one page', async (t) => {
  const { context, state, sent, tick, turnOff } = offHarness(t);
  state.config.settings.standbySeconds = 0;
  await turnOff();
  context.scheduleLivePush(3);
  context.schedulePush();
  context.pushNow({ background: true });
  await tick(10_000);
  assert.deepEqual(sent, []);

  context.handleKeyEvent(4, false); // the firmware delivers a lone release
  await tick(400);
  assert.deepEqual(sent, ['page']);
  context.scheduleLivePush(3);
  await tick(10_000);
  assert.deepEqual(sent, ['page', 'key']);
});

test('a push already scheduled when the deck goes off is held', async (t) => {
  const { context, sent, tick, turnOff } = offHarness(t);
  context.schedulePush();
  await turnOff();
  await tick(1000);
  assert.deepEqual(sent, []);
});

test('an explicit push (unlock, Push button) lights the deck', async (t) => {
  const { context, sent, tick, turnOff } = offHarness(t);
  await turnOff();
  await context.pushNow();
  assert.deepEqual(sent, ['page']);
  context.scheduleLivePush(3);
  await tick(10_000);
  assert.deepEqual(sent, ['page', 'key']);
});

test('locking a deck that is off keeps it dark and still ignores keys', async (t) => {
  const { context, calls, key, sent, tick, turnOff } = offHarness(t);
  await turnOff();
  await context.enterLockScreen();
  await tick(1000);
  assert.deepEqual(sent, []);

  key.action = { type: 'app', value: 'app' };
  context.handleKeyEvent(2, true);
  context.handleKeyEvent(2, false);
  await tick(400);
  assert.equal(calls.actions.length, 0);
  assert.deepEqual(sent, ['page']); // the lock frame, now that the deck is lit

  await context.exitLockScreen();
  assert.deepEqual(sent, ['page', 'page']);
});
