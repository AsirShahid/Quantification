import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { headers } from 'next/headers';
import { requireChatGPTUser } from './chatgpt-auth';
import Workbench from './workbench';

export const dynamic = 'force-dynamic';

const ASSERTION_HEADER = 'x-kidneyquant-proxy-assertion';
const ASSERTION_FILE = '/run/secrets/kidneyquant-proxy-assertion';
const ASSERTION_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

type HeaderReader = { get(name: string): string | null };

async function hasTrustedGatewayAssertion(requestHeaders: HeaderReader): Promise<boolean> {
  const presented = requestHeaders.get(ASSERTION_HEADER);
  if (!presented || !ASSERTION_PATTERN.test(presented)) return false;

  try {
    const expected = (await readFile(ASSERTION_FILE, 'utf8')).trim();
    if (!ASSERTION_PATTERN.test(expected)) return false;

    const expectedBytes = Buffer.from(expected, 'utf8');
    const presentedBytes = Buffer.from(presented, 'utf8');
    return expectedBytes.length === presentedBytes.length && timingSafeEqual(expectedBytes, presentedBytes);
  } catch {
    return false;
  }
}

async function ProtectedWorkbench() {
  const requestHeaders = await headers();
  const isSelfHosted = process.env.SELF_HOSTED === 'true';

  if (isSelfHosted) {
    const authenticatedUser = requestHeaders.get('x-kidneyquant-authenticated-user')?.trim();
    const trustedGateway = await hasTrustedGatewayAssertion(requestHeaders);
    if (trustedGateway && authenticatedUser) return <Workbench userName={authenticatedUser} />;

    return (
      <main className="access-setup">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><span /></span><div><p>KidneyQuant</p><span>private stain analysis</span></div></div>
        <p className="eyebrow">Access required</p>
        <h1>This lab workspace is protected.</h1>
        <p>Open it through the approved private gateway. If you manage this server, keep the application origin reachable only from that trusted gateway.</p>
      </main>
    );
  }

  const user = await requireChatGPTUser('/');
  return <Workbench userName={user.displayName} />;
}

export default function Home() {
  return <ProtectedWorkbench />;
}
