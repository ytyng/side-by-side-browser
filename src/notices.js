// Location and loader for THIRD-PARTY-NOTICES.txt.
//
// The file sits at the repository root and electron-builder packs it into the
// asar next to src/ (see `build.files` in package.json), so the same relative
// path works in `pnpm start` and in the packaged app. Kept free of `electron`
// so `--license` and the tests can use it without booting Electron.

const fs = require('node:fs');
const path = require('node:path');

const NOTICES_PATH = path.join(__dirname, '..', 'THIRD-PARTY-NOTICES.txt');

function readNotices() {
  return fs.readFileSync(NOTICES_PATH, 'utf8');
}

module.exports = { NOTICES_PATH, readNotices };
