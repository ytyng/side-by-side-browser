const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { NOTICES_PATH, readNotices } = require('../src/notices');
const pkg = require('../package.json');

/**
 * THIRD-PARTY-NOTICES.txt が依存と食い違っていないこと。
 *
 * 依存を上げたのに scripts/generate-third-party-notices.sh (pnpm notices) を
 * 流し忘れる事故を拾う。version は package.json の範囲ではなく、
 * pnpm-lock.yaml が実際に選んだものと突き合わせる。
 * ライセンス本文の中身までは見ない (それは `pnpm notices --check` の役目)。
 */

const ROOT = path.join(__dirname, '..');

// Windows の CI では autocrlf で CRLF になる
function readText(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
}

// importers['.'] の { dependencies, devDependencies } を { name: version } で返す。
// lockfile v9 の固定の書式だけを読む最小のパーサー。
function lockedImporterVersions() {
  const lines = readText('pnpm-lock.yaml').split('\n');
  const result = { dependencies: {}, devDependencies: {} };
  let inRoot = false;
  let section = null;
  let name = null;
  for (const line of lines) {
    if (line === '  .:') {
      inRoot = true;
      continue;
    }
    if (!inRoot) continue;
    if (/^\S/.test(line) || /^ {2}\S/.test(line)) break;
    const sectionMatch = line.match(/^ {4}(dependencies|devDependencies|optionalDependencies):$/);
    if (sectionMatch) {
      section = sectionMatch[1] === 'devDependencies' ? 'devDependencies' : 'dependencies';
      continue;
    }
    const nameMatch = line.match(/^ {6}'?([^':]+)'?:$/);
    if (nameMatch) {
      name = nameMatch[1];
      continue;
    }
    const versionMatch = line.match(/^ {8}version: (\S+)$/);
    if (versionMatch && section && name) {
      // 4.3.1(peer@1.0.0) のような peer の付記を落とす
      result[section][name] = versionMatch[1].replace(/\(.*$/, '');
    }
  }
  return result;
}

function listedPackages(notices) {
  const listed = new Set();
  for (const match of notices.matchAll(/^ {2}(\S+) (\S+)(?: \(.*\))?$/gm)) {
    listed.add(`${match[1]} ${match[2]}`);
  }
  return listed;
}

describe('THIRD-PARTY-NOTICES.txt', () => {
  const notices = readNotices().replace(/\r\n/g, '\n');
  const locked = lockedImporterVersions();
  const listed = listedPackages(notices);

  it('reads the lockfile it checks against', () => {
    // パーサーが空振りすると以降のテストが素通りになるので、既知の依存で確かめる
    assert.ok(locked.devDependencies.electron, 'electron not found in pnpm-lock.yaml');
  });

  it('lists Electron at the locked version', () => {
    assert.match(notices, /^# Electron and Chromium$/m);
    assert.ok(listed.has(`electron ${locked.devDependencies.electron}`), `electron ${locked.devDependencies.electron}`);
  });

  it('lists every production dependency at the locked version', () => {
    for (const [name, version] of Object.entries(locked.dependencies)) {
      assert.ok(listed.has(`${name} ${version}`), `${name} ${version} is missing`);
    }
  });

  it('lists the vendored Bootstrap Icons at the vendored version', () => {
    const vendored = readText('src/vendor/bootstrap-icons/VERSION').trim();
    assert.equal(vendored, locked.devDependencies['bootstrap-icons'], 'vendored copy and lockfile disagree');
    assert.ok(listed.has(`bootstrap-icons ${vendored}`));
  });

  it('lists Tailwind CSS, whose output ships as src/styles/app.css', () => {
    assert.ok(listed.has(`tailwindcss ${locked.devDependencies.tailwindcss}`));
  });

  it('is packaged into the app', () => {
    assert.ok(pkg.build.files.includes('THIRD-PARTY-NOTICES.txt'));
    assert.equal(path.resolve(NOTICES_PATH), path.join(ROOT, 'THIRD-PARTY-NOTICES.txt'));
  });
});
