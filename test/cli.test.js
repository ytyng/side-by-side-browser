const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { parseCli, clampInt, helpText } = require('../src/cli');
const pkg = require('../package.json');

describe('parseCli', () => {
  it('has sensible defaults', () => {
    const cli = parseCli([]);

    assert.equal(cli.help, false);
    assert.equal(cli.version, false);
    assert.equal(cli.left, null);
    assert.equal(cli.right, null);
    assert.deepEqual(cli.positionals, []);
    assert.equal(cli.width, 1440);
    assert.equal(cli.height, 950);
    assert.equal(cli.partition, 'side-by-side-browser');
    assert.equal(cli.persistSession, true);
    assert.equal(cli.allowPopups, false);
  });

  it('accepts both --flag value and --flag=value', () => {
    assert.equal(parseCli(['--left', 'example.com']).left, 'https://example.com');
    assert.equal(parseCli(['--left=example.com']).left, 'https://example.com');
    assert.equal(parseCli(['--right', 'example.org']).right, 'https://example.org');
    assert.equal(parseCli(['--right=example.org']).right, 'https://example.org');
  });

  it('normalizes the URLs it is given', () => {
    assert.equal(parseCli(['--left=localhost:3000']).left, 'https://localhost:3000');
  });

  it('collects positionals', () => {
    const cli = parseCli(['example.com', 'example.org']);

    assert.deepEqual(cli.positionals, ['example.com', 'example.org']);
  });

  it('recognizes the boolean flags', () => {
    const cli = parseCli([
      '--scroll-sync',
      '--path-sync',
      '--lock-external',
      '--start-maximized',
      '--no-persist-session',
      '--allow-popups',
      '--open-devtools'
    ]);

    assert.equal(cli.scrollSync, true);
    assert.equal(cli.pathSync, true);
    assert.equal(cli.lockExternal, true);
    assert.equal(cli.startMaximized, true);
    assert.equal(cli.persistSession, false);
    assert.equal(cli.allowPopups, true);
    assert.equal(cli.openDevtools, true);
  });

  it('recognizes help and version in both forms', () => {
    assert.equal(parseCli(['--help']).help, true);
    assert.equal(parseCli(['-h']).help, true);
    assert.equal(parseCli(['--version']).version, true);
    assert.equal(parseCli(['-v']).version, true);
  });

  it('clamps the window size', () => {
    assert.equal(parseCli(['--width=100']).width, 900);
    assert.equal(parseCli(['--width=99999']).width, 4000);
    assert.equal(parseCli(['--height=1']).height, 560);
    assert.equal(parseCli(['--height=99999']).height, 3000);
  });

  it('keeps the default size when the value is not a number', () => {
    assert.equal(parseCli(['--width=abc']).width, 1440);
    assert.equal(parseCli(['--height', 'abc']).height, 950);
  });

  it('ignores an empty --partition instead of using an empty session name', () => {
    assert.equal(parseCli(['--partition=']).partition, 'side-by-side-browser');
    assert.equal(parseCli(['--partition', '']).partition, 'side-by-side-browser');
  });

  it('takes a user agent override', () => {
    assert.equal(parseCli(['--user-agent', 'Mozilla/5.0 test']).userAgent, 'Mozilla/5.0 test');
    assert.equal(parseCli(['--user-agent=UA']).userAgent, 'UA');
  });

  it('ignores a bare -- token', () => {
    // POSIX の「以降はすべて位置引数」ではなく、単に読み飛ばすだけ
    // (元からの挙動)。`--` の後ろにもオプション解析は続く。
    assert.deepEqual(parseCli(['--', 'example.com']).positionals, ['example.com']);
    assert.equal(parseCli(['--', '--help']).help, true);
  });

  it('does not treat an unknown option as a positional URL', () => {
    const cli = parseCli(['--nope', 'example.com']);

    assert.deepEqual(cli.positionals, ['example.com']);
  });
});

describe('clampInt', () => {
  it('clamps into the range', () => {
    assert.equal(clampInt('50', 100, 200, 150), 100);
    assert.equal(clampInt('500', 100, 200, 150), 200);
    assert.equal(clampInt('150', 100, 200, 111), 150);
  });

  it('falls back when the value is not a number', () => {
    assert.equal(clampInt('abc', 100, 200, 150), 150);
    assert.equal(clampInt(undefined, 100, 200, 150), 150);
    assert.equal(clampInt('', 100, 200, 150), 150);
  });
});

describe('helpText', () => {
  it('reports the package version', () => {
    assert.ok(helpText().includes(pkg.version));
  });

  it('documents every option parseCli understands', () => {
    const text = helpText();

    for (const flag of [
      '--left',
      '--right',
      '--scroll-sync',
      '--path-sync',
      '--lock-external',
      '--width',
      '--height',
      '--start-maximized',
      '--user-agent',
      '--partition',
      '--no-persist-session',
      '--allow-popups',
      '--open-devtools',
      '--help',
      '--version'
    ]) {
      assert.ok(text.includes(flag), `help text is missing ${flag}`);
    }
  });
});
