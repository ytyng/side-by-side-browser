// Loads a main-process module with `electron` replaced by a stub.
//
// The real module is only available inside an Electron runtime, so
// `node --test` cannot require src/settings.js or src/main.js directly.
// Module._load is intercepted for the duration of the require.

const Module = require('node:module');

// Applies the stub, requires `request` fresh (bypassing the module cache so
// each test gets its own state), and always restores Module._load.
function requireWithElectronStub(request, electronStub) {
  const originalLoad = Module._load;
  const resolved = require.resolve(request);
  const hadCached = Object.prototype.hasOwnProperty.call(require.cache, resolved);
  const cached = require.cache[resolved];
  delete require.cache[resolved];

  Module._load = function load(name, parent, isMain) {
    if (name === 'electron') return electronStub;
    return originalLoad.call(this, name, parent, isMain);
  };
  try {
    return require(request);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolved];
    if (hadCached) require.cache[resolved] = cached;
  }
}

module.exports = { requireWithElectronStub };
