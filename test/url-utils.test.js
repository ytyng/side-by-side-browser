const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  DEFAULT_LEFT_URL,
  normalizeInputUrl,
  isHttpUrl,
  hostnameOf,
  pathParts,
  withPathParts,
  trimUrl
} = require('../src/url-utils');

describe('normalizeInputUrl', () => {
  it('keeps a URL that already has a scheme', () => {
    assert.equal(normalizeInputUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(normalizeInputUrl('http://example.com'), 'http://example.com');
    assert.equal(normalizeInputUrl('about:blank'), 'about:blank');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(normalizeInputUrl('  https://example.com  '), 'https://example.com');
  });

  it('falls back to the default URL for empty input', () => {
    assert.equal(normalizeInputUrl(''), DEFAULT_LEFT_URL);
    assert.equal(normalizeInputUrl('   '), DEFAULT_LEFT_URL);
    assert.equal(normalizeInputUrl(null), DEFAULT_LEFT_URL);
    assert.equal(normalizeInputUrl(undefined), DEFAULT_LEFT_URL);
  });

  it('prepends https to a bare host', () => {
    assert.equal(normalizeInputUrl('example.com'), 'https://example.com');
    assert.equal(normalizeInputUrl('example.com/path?q=1'), 'https://example.com/path?q=1');
  });

  it('treats localhost as a host even without a dot', () => {
    assert.equal(normalizeInputUrl('localhost'), 'https://localhost');
  });

  it('treats host:port as a host, not as a scheme', () => {
    // `localhost:3000` parses as scheme "localhost" — the common trap this guards
    assert.equal(normalizeInputUrl('localhost:3000'), 'https://localhost:3000');
    assert.equal(normalizeInputUrl('example.com:8080/a'), 'https://example.com:8080/a');
    // single-label host with a port and no dot
    assert.equal(normalizeInputUrl('app:3000'), 'https://app:3000');
  });

  it('searches the web for anything that is not host-like', () => {
    assert.equal(
      normalizeInputUrl('hello world'),
      'https://www.google.com/search?q=hello%20world'
    );
  });

  it('escapes the search term', () => {
    assert.equal(
      normalizeInputUrl('a&b=c'),
      'https://www.google.com/search?q=a%26b%3Dc'
    );
  });
});

describe('isHttpUrl', () => {
  it('accepts http and https', () => {
    assert.equal(isHttpUrl('http://example.com'), true);
    assert.equal(isHttpUrl('https://example.com'), true);
  });

  it('rejects other schemes and garbage', () => {
    // lockExternal はこの判定に乗っているので、file: を通すと外部遷移の
    // ブロックがすり抜ける
    for (const value of ['about:blank', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', '']) {
      assert.equal(isHttpUrl(value), false, value);
    }
  });
});

describe('hostnameOf', () => {
  it('returns the hostname', () => {
    assert.equal(hostnameOf('https://example.com/a?b=1'), 'example.com');
    assert.equal(hostnameOf('https://example.com:8443/a'), 'example.com');
  });

  it('returns null for a non-URL', () => {
    assert.equal(hostnameOf('nope'), null);
    assert.equal(hostnameOf(''), null);
  });
});

describe('pathParts', () => {
  it('returns path + search + hash', () => {
    assert.equal(pathParts('https://example.com/a/b?q=1#top'), '/a/b?q=1#top');
    assert.equal(pathParts('https://example.com'), '/');
  });

  it('returns null for non-http URLs', () => {
    assert.equal(pathParts('about:blank'), null);
    assert.equal(pathParts('file:///tmp/a'), null);
    assert.equal(pathParts('nope'), null);
  });
});

describe('withPathParts', () => {
  it('copies the path onto another origin', () => {
    assert.equal(
      withPathParts('https://staging.example.com/old', '/a/b?q=1#top'),
      'https://staging.example.com/a/b?q=1#top'
    );
  });

  it('keeps the port of the base URL', () => {
    assert.equal(
      withPathParts('http://localhost:3000/old?x=1#y', '/new'),
      'http://localhost:3000/new'
    );
  });

  it('replaces search and hash even when the new path has none', () => {
    assert.equal(
      withPathParts('https://example.com/old?x=1#y', '/new'),
      'https://example.com/new'
    );
  });

  it('does not let the copied path change the origin', () => {
    // パス同期は相手ペインのホストを変えてはいけない
    assert.equal(
      withPathParts('https://example.com/a', 'https://evil.example/b'),
      'https://example.com/b'
    );
  });

  it('returns null when the base is not http', () => {
    assert.equal(withPathParts('about:blank', '/a'), null);
    assert.equal(withPathParts('nope', '/a'), null);
  });

  it('round-trips with pathParts', () => {
    const source = 'https://a.example.com/x/y?q=1#z';
    const target = 'https://b.example.com/old';

    assert.equal(withPathParts(target, pathParts(source)), 'https://b.example.com/x/y?q=1#z');
  });
});

describe('trimUrl', () => {
  it('leaves short URLs alone', () => {
    assert.equal(trimUrl('https://example.com'), 'https://example.com');
  });

  it('shortens long URLs to 90 characters', () => {
    const long = `https://example.com/${'a'.repeat(200)}`;

    const trimmed = trimUrl(long);

    assert.equal(trimmed.length, 90);
    assert.ok(trimmed.endsWith('...'));
  });

  it('handles null and undefined', () => {
    assert.equal(trimUrl(null), '');
    assert.equal(trimUrl(undefined), '');
  });
});
