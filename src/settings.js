const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Bump when the on-disk shape changes so old files can be migrated or ignored.
const SETTINGS_VERSION = 1;

// Only these keys are read from / written to disk. Unknown keys on disk are
// ignored so a tampered or stale file can never inject state into the app.
const OPTION_KEYS = ['scrollSync', 'pathSync', 'lockExternal'];

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function defaultOptions() {
  return { scrollSync: false, pathSync: false, lockExternal: false };
}

// Reads persisted sync options. Missing file, invalid JSON, or unexpected shape
// all fall back to defaults; persistence must never block startup.
function loadOptions() {
  const options = defaultOptions();
  try {
    const raw = fs.readFileSync(settingsFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const stored = parsed && typeof parsed === 'object' ? parsed.options : null;
    if (stored && typeof stored === 'object') {
      for (const key of OPTION_KEYS) {
        if (typeof stored[key] === 'boolean') options[key] = stored[key];
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Failed to read settings: ${error.message}`);
    }
  }
  return options;
}

// Writes the known options via a temp file + rename so a crash mid-write can
// never leave a truncated settings.json behind.
function saveOptions(options) {
  const payload = { version: SETTINGS_VERSION, options: {} };
  for (const key of OPTION_KEYS) {
    payload.options[key] = Boolean(options[key]);
  }
  const filePath = settingsFilePath();
  const tempPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    console.warn(`Failed to write settings: ${error.message}`);
  }
}

module.exports = { loadOptions, saveOptions, OPTION_KEYS };
