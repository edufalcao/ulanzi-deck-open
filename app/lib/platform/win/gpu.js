'use strict';

// GPU utilisation from the "GPU Engine" performance counters (the numbers Task
// Manager shows). typeperf takes about a second per sample, so callers cache.

const { execFile } = require('node:child_process');

const COUNTER = '\\GPU Engine(*engtype_3D)\\Utilization Percentage';

/** Pure: sum the 3D engine columns of one typeperf CSV sample. */
function parseTypeperf(stdout) {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('"'));
  if (lines.length < 2) return null;
  const values = lines[lines.length - 1]
    .split('","')
    .slice(1)
    .map((cell) => Number(cell.replace(/"/g, '')))
    .filter(Number.isFinite);
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.min(100, Math.max(0, Math.round(total)));
}

function sampleGpu(callback) {
  execFile('typeperf', [COUNTER, '-sc', '1'], { windowsHide: true, timeout: 6000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
    callback(err ? null : parseTypeperf(stdout));
  });
}

module.exports = { parseTypeperf, sampleGpu };
