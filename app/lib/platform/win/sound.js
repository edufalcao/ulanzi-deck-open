'use strict';

// "Play audio" on Windows: a hidden PowerShell running WPF's MediaPlayer
// (wav, mp3, m4a, wma). Killing the child stops playback, like afplay on macOS.
// The file and volume travel in environment variables, never in the script.

const { spawn } = require('node:child_process');

const SCRIPT = [
  'Add-Type -AssemblyName PresentationCore',
  '$p = New-Object System.Windows.Media.MediaPlayer',
  '$p.Volume = [double]$env:UDO_VOLUME',
  '$p.Open([uri]$env:UDO_FILE)',
  '$p.Play()',
  '$w = 0',
  'while (-not $p.NaturalDuration.HasTimeSpan -and $w -lt 100) { Start-Sleep -Milliseconds 50; $w++ }',
  'if ($p.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 200) }',
  '$p.Close()',
].join('; ');

function spawnPlayer(file, volume = 1) {
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, UDO_FILE: String(file), UDO_VOLUME: String(volume) },
  });
}

module.exports = { spawnPlayer };
