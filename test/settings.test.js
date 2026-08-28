const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, describe, it } = require('node:test');

const { requireWithElectronStub } = require('./electron-stub');

/**
 * 設定の読み書き。
 * 起動時に必ず通るので、壊れたファイルで落ちるとアプリが起動しなくなる。
 */

const tempDirs = [];

function loadSettings() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sxs-settings-'));
  tempDirs.push(userData);
  const settings = requireWithElectronStub('../src/settings', {
    app: { getPath: () => userData }
  });
  return { settings, settingsFile: path.join(userData, 'settings.json') };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('loadOptions', () => {
  it('returns defaults when there is no settings file', () => {
    const { settings } = loadSettings();

    assert.deepEqual(settings.loadOptions(), {
      scrollSync: false,
      pathSync: false,
      lockExternal: false,
      openLinksNewTab: false,
      scrollSyncMode: 'px'
    });
  });

  it('reads persisted options', () => {
    const { settings, settingsFile } = loadSettings();
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({
        version: 1,
        options: { scrollSync: true, pathSync: true, scrollSyncMode: 'percent' }
      })
    );

    const options = settings.loadOptions();

    assert.equal(options.scrollSync, true);
    assert.equal(options.pathSync, true);
    assert.equal(options.scrollSyncMode, 'percent');
    // 書かれていないキーは既定のまま
    assert.equal(options.lockExternal, false);
  });

  it('falls back to defaults on invalid JSON', () => {
    const { settings, settingsFile } = loadSettings();
    fs.writeFileSync(settingsFile, 'not json at all');

    assert.equal(settings.loadOptions().scrollSync, false);
  });

  it('ignores values of the wrong type', () => {
    const { settings, settingsFile } = loadSettings();
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({ options: { scrollSync: 'yes', scrollSyncMode: 'furlongs' } })
    );

    const options = settings.loadOptions();

    assert.equal(options.scrollSync, false);
    assert.equal(options.scrollSyncMode, 'px');
  });

  it('ignores unknown keys on disk', () => {
    // 改竄された設定ファイルからアプリの状態に値を入れさせない
    const { settings, settingsFile } = loadSettings();
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({ options: { scrollSync: true, somethingElse: true } })
    );

    const options = settings.loadOptions();

    assert.equal(options.scrollSync, true);
    assert.equal('somethingElse' in options, false);
  });

  it('survives a settings file that is not an object', () => {
    const { settings, settingsFile } = loadSettings();
    fs.writeFileSync(settingsFile, '[1, 2, 3]');

    assert.equal(settings.loadOptions().scrollSync, false);
  });
});

describe('saveOptions', () => {
  it('round-trips through the file', () => {
    const { settings } = loadSettings();

    settings.saveOptions({
      scrollSync: true,
      pathSync: false,
      lockExternal: true,
      openLinksNewTab: true,
      scrollSyncMode: 'percent'
    });

    const options = settings.loadOptions();
    assert.equal(options.scrollSync, true);
    assert.equal(options.pathSync, false);
    assert.equal(options.lockExternal, true);
    assert.equal(options.openLinksNewTab, true);
    assert.equal(options.scrollSyncMode, 'percent');
  });

  it('writes only the known keys, coerced to booleans', () => {
    const { settings, settingsFile } = loadSettings();

    settings.saveOptions({ scrollSync: 'truthy', nope: true });

    const written = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.equal(written.version, 1);
    assert.equal(written.options.scrollSync, true);
    assert.equal('nope' in written.options, false);
    assert.deepEqual(Object.keys(written.options).sort(), [
      'lockExternal',
      'openLinksNewTab',
      'pathSync',
      'scrollSync',
      'scrollSyncMode'
    ]);
  });

  it('falls back to px for an unknown scroll sync mode', () => {
    const { settings, settingsFile } = loadSettings();

    settings.saveOptions({ scrollSyncMode: 'furlongs' });

    assert.equal(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).options.scrollSyncMode, 'px');
  });

  it('does not leave a temp file behind', () => {
    const { settings, settingsFile } = loadSettings();

    settings.saveOptions({ scrollSync: true });

    assert.equal(fs.existsSync(`${settingsFile}.tmp`), false);
  });
});
