'use strict';

// Windows locations of Ulanzi Studio, Elgato Stream Deck and OpenDeck data.
// Ulanzi Studio for Windows keeps the same layout as on macOS, under
// %APPDATA%\Ulanzi\UlanziDeck (Plugins, Icons, ProfilesV2, System\Plugins).

const os = require('node:os');
const path = require('node:path');

function appData(env = process.env) {
  return env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function programFilesX86(env = process.env) {
  return env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
}

function ulanziDataDir(env) {
  return path.join(appData(env), 'Ulanzi', 'UlanziDeck');
}

function ulanziPluginDirs(env) {
  return [
    path.join(ulanziDataDir(env), 'Plugins'),
    // Plugins bundled with the Studio install.
    path.join(programFilesX86(env), 'Ulanzi Studio', 'Plugins'),
  ];
}

function ulanziIconsDir(env) {
  return path.join(ulanziDataDir(env), 'Icons');
}

function ulanziProfilesDir(env) {
  return path.join(ulanziDataDir(env), 'ProfilesV2');
}

function streamDeckPluginDirs(env) {
  return [
    path.join(appData(env), 'opendeck', 'plugins'),
    path.join(appData(env), 'Elgato', 'StreamDeck', 'Plugins'),
  ];
}

module.exports = {
  appData,
  ulanziDataDir,
  ulanziPluginDirs,
  ulanziIconsDir,
  ulanziProfilesDir,
  streamDeckPluginDirs,
};
