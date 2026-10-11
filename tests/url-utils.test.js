import test from 'node:test';
import assert from 'node:assert/strict';
import { isWebUrl, normalizeAddress } from '../src/url-utils.js';

test('blank address bar input stays empty', () => {
  assert.equal(normalizeAddress('   '), null);
  assert.equal(normalizeAddress(null), null);
});

test('ordinary web URLs keep their protocol and canonical form', () => {
  assert.equal(normalizeAddress(' https://example.com/path?q=one '), 'https://example.com/path?q=one');
  assert.equal(normalizeAddress('http://example.com'), 'http://example.com/');
});

test('a domain without a protocol defaults to HTTPS', () => {
  assert.equal(normalizeAddress('example.com/docs'), 'https://example.com/docs');
  assert.equal(normalizeAddress('localhost:3000'), 'https://localhost:3000/');
});

test('ordinary words are searched with URL encoding', () => {
  assert.equal(normalizeAddress('  tri core browser  '), 'https://duckduckgo.com/?q=tri%20core%20browser');
  assert.equal(normalizeAddress('cats & dogs'), 'https://duckduckgo.com/?q=cats%20%26%20dogs');
});

test('non-web protocols are treated as search text, never navigated', () => {
  assert.equal(normalizeAddress('javascript:alert(1)'), 'https://duckduckgo.com/?q=javascript%3Aalert(1)');
  assert.equal(normalizeAddress('file:///etc/passwd'), 'https://duckduckgo.com/?q=file%3A%2F%2F%2Fetc%2Fpasswd');
  assert.equal(isWebUrl('javascript:alert(1)'), false);
  assert.equal(isWebUrl('data:text/html,hello'), false);
});

test('isWebUrl accepts only HTTP and HTTPS', () => {
  assert.equal(isWebUrl('https://example.com'), true);
  assert.equal(isWebUrl('http://localhost:5173'), true);
  assert.equal(isWebUrl('mailto:hello@example.com'), false);
});
