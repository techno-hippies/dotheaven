import { Env } from './shared/env.ts';
import { ethers } from 'ethers';

// Intercept fetch to capture encrypted payload
const origFetch = globalThis.fetch;
globalThis.fetch = async function(input: any, init?: any) {
  const url = typeof input === 'string' ? input : input?.url;
  if (url?.includes('/web/execute')) {
    const bodyStr = typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body);
    const body = JSON.parse(bodyStr);
    console.log('\n=== INTERCEPTED EXECUTE REQUEST ===');
    console.log('URL:', url);
    console.log('Body top-level keys:', Object.keys(body));
    console.log('version:', body.version);
    if (body.payload) {
      console.log('payload.verification_key len:', body.payload.verification_key?.length);
      console.log('payload.random:', body.payload.random);
      console.log('payload.created_at:', body.payload.created_at);
      console.log('payload.ciphertext_and_tag length:', body.payload.ciphertext_and_tag?.length);
    }
    console.log('epoch:', body.epoch);

    const { writeFileSync } = await import('fs');
    writeFileSync('/tmp/intercepted_body.json', JSON.stringify(body, null, 2));
  }
  return origFetch.apply(globalThis, arguments as any);
};

async function main() {
  const pkp = Env.loadPkpCreds();
  const wallet = new ethers.Wallet(pkp.pkpPrivateKey!);

  // Use nagaDev module directly — same as how tests use it
  const { nagaDev } = await import('@lit-protocol/networks');

  // Get session sigs using EOA auth
  const authData = nagaDev.auth.createEthWalletAuthData(wallet);

  const sessionSigs = await nagaDev.auth.createPkpAuthContext({
    pkpPublicKey: pkp.publicKey,
    authData,
    resources: [{
      resource: { resource: '*', resourcePrefix: 'lit-litaction' },
      ability: 'lit-action-execution',
    }],
  });

  console.log('Got auth context');

  const res = await nagaDev.executeJs({
    code: `(async () => { Lit.Actions.setResponse({ response: "intercepted" }); })();`,
    ...sessionSigs,
  });
  console.log('Response:', res.response);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message?.slice(0, 300)); process.exit(1); });
