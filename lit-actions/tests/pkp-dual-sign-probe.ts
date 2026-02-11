#!/usr/bin/env bun
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { createLitClient } from "@lit-protocol/lit-client";
import { Env } from "./shared/env";

const pk = process.env.PRIVATE_KEY!;
const litNetwork = Env.litNetwork;
if (!pk) throw new Error("PRIVATE_KEY missing");

const authEoa = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
const litClient = await createLitClient({ network: litNetwork });

const authManager = createAuthManager({
  storage: storagePlugins.localStorageNode({
    appName: "pkp-dual-sign-probe",
    networkName: Env.name,
    storagePath: "./output/lit-auth",
  }),
});

const authData = await ViemAccountAuthenticator.authenticate(authEoa);

const PKPS = {
  f2: {
    name: "f2",
    publicKey: "0x04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5",
  },
  s089f: {
    name: "089f",
    publicKey: "0x044615ca5ec3bfec5f5306f62ccc1a398cbd7e9cc53ac0e715b27ba81272e7397b185aa6f43c9bb2f0d9c489d30478cec9310685cd3a33922c0d12417b6375bc08",
  },
} as const;

const targetKeys = [PKPS.f2, PKPS.s089f];

for (const source of targetKeys) {
  console.log(`\n=== authContext for ${source.name} ===`);
  try {
    const authContext = await authManager.createPkpAuthContext({
      authData,
      pkpPublicKey: source.publicKey,
      authConfig: {
        resources: [["pkp-signing", "*"], ["lit-action-execution", "*"]],
        expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        statement: "",
      },
      litClient,
    });

    for (const target of targetKeys) {
      const code = `
;(async () => {
  const msgHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("probe"));
  const r = await Lit.Actions.signAndCombineEcdsa({
    toSign: Array.from(ethers.utils.arrayify(msgHash)),
    publicKey: "${target.publicKey.slice(2)}",
    sigName: "probe",
  });
  Lit.Actions.setResponse({ response: JSON.stringify({ result: r }) });
})().catch((e) => {
  Lit.Actions.setResponse({ response: JSON.stringify({ error: e?.message || String(e) }) });
});`;
      try {
        const out = await litClient.executeJs({ code, authContext, jsParams: {} as any });
        const parsed = JSON.parse(out.response as string);
        if (parsed?.error) {
          console.log(`sign target ${target.name}: FAIL ${parsed.error}`);
          continue;
        }
        const ok = typeof parsed?.result === "string" && !parsed.result.startsWith("[ERROR]");
        console.log(`sign target ${target.name}: ${ok ? "OK" : `FAIL ${parsed?.result}`}`);
      } catch (err: any) {
        console.log(`sign target ${target.name}: THROW ${err?.message || String(err)}`);
      }
    }
  } catch (err: any) {
    console.log(`createPkpAuthContext failed: ${err?.message || String(err)}`);
  }
}
