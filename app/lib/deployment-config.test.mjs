import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compose = await readFile(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
const nginx = await readFile(new URL('../../auth/nginx.conf', import.meta.url), 'utf8');

test('auth reaches web through a unique internal DNS alias', () => {
  assert.match(compose, /auth-web:\s*\n\s+aliases:\s*\n\s+- kidneyquant-internal-web/);
  assert.match(nginx, /server kidneyquant-internal-web:3000;/);
  assert.doesNotMatch(nginx, /server web:3000;/);
});
