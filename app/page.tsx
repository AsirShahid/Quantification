import { headers } from 'next/headers';
import { getChatGPTUser, requireChatGPTUser } from './chatgpt-auth';
import Workbench from './workbench';

export const dynamic = 'force-dynamic';

async function ProtectedWorkbench() {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const accessEmail = requestHeaders.get('cf-access-authenticated-user-email');
  const isSelfHosted = process.env.SELF_HOSTED === 'true';

  if (accessEmail) return <Workbench userName={accessEmail} />;
  if (isSelfHosted && !isLocal) {
    return (
      <main className="access-setup">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><span /></span><div><p>KidneyQuant</p><span>private stain analysis</span></div></div>
        <p className="eyebrow">Access required</p>
        <h1>This lab workspace is protected.</h1>
        <p>Open it through the approved lab sign-in address. If you manage this server, finish the Cloudflare Access email allowlist and keep the origin private.</p>
      </main>
    );
  }

  const user = isLocal ? await getChatGPTUser() : await requireChatGPTUser('/');
  return <Workbench userName={user?.displayName ?? 'Local preview'} />;
}

export default function Home() {
  return <ProtectedWorkbench />;
}
