const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { requireWithElectronStub } = require('./electron-stub');

/**
 * main.js がモジュールとして読み込めること。
 *
 * 保証するのは「モジュール直下で参照している名前がすべて解決すること」と
 * 「読み込んだだけではウインドウを作りに行かないこと」の 2 点だけ。
 * 関数の中に残った未定義参照は、その関数を呼ぶまで JavaScript では
 * エラーにならないので、ここでは拾えない (拾うには no-undef を見る
 * リンターが要る。このリポジトリには今のところ無い)。
 */
describe('main.js', () => {
  it('loads with a stubbed electron without starting a window', () => {
    const calls = { whenReady: 0, on: [] };
    const electronStub = {
      app: {
        isPackaged: false,
        // 解決しない Promise を返すことで createWindow まで進ませない
        whenReady: () => {
          calls.whenReady += 1;
          return new Promise(() => {});
        },
        on: (event) => {
          calls.on.push(event);
        },
        getPath: () => '/tmp',
        quit: () => {}
      },
      BaseWindow: class {},
      WebContentsView: class {},
      View: class {},
      Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({}) },
      ipcMain: { handle: () => {}, on: () => {} },
      shell: { openExternal: () => {} },
      clipboard: { writeText: () => {} },
      nativeImage: { createFromPath: () => ({ isEmpty: () => true }) }
    };

    const originalArgv = process.argv;
    // --help / --version が混ざると main.js が process.exit する
    process.argv = ['node', 'main.js'];
    try {
      requireWithElectronStub('../src/main', electronStub);
    } finally {
      process.argv = originalArgv;
    }

    assert.equal(calls.whenReady, 1);
    assert.ok(calls.on.includes('window-all-closed'));
    assert.ok(calls.on.includes('activate'));
  });
});
