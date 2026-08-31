import assert from 'node:assert/strict';

const url = process.env.KIDNEYQUANT_SMOKE_URL || 'http://127.0.0.1:3000/';
const user = process.env.KIDNEYQUANT_SMOKE_USER;
const password = process.env.KIDNEYQUANT_SMOKE_PASSWORD;
const headers = new Headers();
if (user || password) {
  assert.ok(user && password, 'Set both KIDNEYQUANT_SMOKE_USER and KIDNEYQUANT_SMOKE_PASSWORD.');
  headers.set('authorization', `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`);
}

const response = await fetch(url, { headers, redirect: 'manual' });
assert.equal(response.ok, true, `Expected ${url} to return 2xx, received ${response.status}`);
const html = await response.text();
assert.equal(/\/home\/[A-Za-z0-9._-]+\//.test(html), false, 'HTML must not expose absolute host filesystem paths');
assert.match(html, /KidneyQuant/, 'Workbench identity should be present');
assert.doesNotMatch(html, /Access required/, 'Authenticated smoke must reach the workbench, not the access gate');
console.log(`HTML smoke passed: ${url}`);
