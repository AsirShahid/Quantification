import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const runtime = 'nodejs';

const ASSERTION_HEADER = 'x-kidneyquant-proxy-assertion';
const ASSERTION_FILE = '/run/secrets/kidneyquant-proxy-assertion';
const ASSERTION_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

async function ready(request: Request) {
  const presented = request.headers.get(ASSERTION_HEADER);
  const authenticatedUser = request.headers.get('x-kidneyquant-authenticated-user')?.trim();
  if (!authenticatedUser || !presented || !ASSERTION_PATTERN.test(presented)) {
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  }

  try {
    const expected = (await readFile(ASSERTION_FILE, 'utf8')).trim();
    if (!ASSERTION_PATTERN.test(expected)) throw new Error('invalid assertion file');
    const expectedBytes = Buffer.from(expected, 'utf8');
    const presentedBytes = Buffer.from(presented, 'utf8');
    if (expectedBytes.length !== presentedBytes.length || !timingSafeEqual(expectedBytes, presentedBytes)) {
      throw new Error('assertion mismatch');
    }
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch {
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}

export const GET = ready;
export const HEAD = ready;
