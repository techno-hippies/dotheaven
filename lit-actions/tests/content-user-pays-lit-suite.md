# Content Encryption Test Suite — LEGACY

> **Status: Superseded.** Content encryption is moving to client-side ECIES with Tempo P256 passkey keys. Lit Protocol is being fully removed from the stack. See `docs/new-architecture.md` §6 for the decided architecture.

This suite validated the intermediate "user-paid Lit" approach where:
1. App sponsors Tempo gas for write transactions.
2. Users pay Lit usage for encryption/decryption.
3. No user PKP required.
4. No Lit Action required in the primary encrypt/decrypt path.

## What Passed (2026-02-16)

- `tempo-acc-support.test.ts` — Confirms `tempoModerato` ACCs are NOT yet supported in Lit SDK schema.
- `content-share-decrypt-direct-eoa.test.ts` — Full encrypt/decrypt/share/revoke cycle with direct Lit EOA auth (no PKP, no Lit Action). All checks pass.

## What's Next

This entire approach is being replaced:
- **Content encryption**: Client-side ECIES with Tempo P256 keys (free, no Lit dependency)
- **Access control**: On-chain key copies per recipient (ECIES re-encrypt on share)
- **No Lit network fees**: Pure client-side crypto

The `lit-actions/` directory will be archived. Compute jobs (lyrics, translation, moderation) move to standalone serverless functions.

## Legacy Run Commands (still work)

```bash
cd lit-actions

# Primary (no Lit Action, no PKP)
bun run test:content-user-pays

# Legacy Lit Action compatibility suite
bun run test:content-user-pays:legacy-actions
```
