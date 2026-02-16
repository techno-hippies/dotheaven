# Lit Actions

Operational notes for `lit-actions`.

## Purpose
Lit action bundle used for gasless/sponsored flows across:
- profile and names
- music publishing/playlists/content
- social interactions
- verification mirror helpers

## Local Workflow
From `lit-actions`:

```bash
bun install
bun run verify
```

Deploy/update a specific action:

```bash
bun run setup <actionName>
```

Upload-only path:

```bash
bun run upload <actionName>
```

## Typical Action Areas
- `lit-actions/features/profile/`
- `lit-actions/features/music/`
- `lit-actions/features/social/`
- `lit-actions/features/verification/`

## Common Tests
Run focused tests for the feature you changed, for example:

```bash
bun features/music/playlist-v1.test.ts
bun features/profile/heaven-claim-name.test.ts
bun features/social/post-register.test.ts
```

## Config and Artifacts
- Action CID snapshots: `lit-actions/cids/`
- Action deployment scripts: `lit-actions/scripts/`
- Network config: `lit-actions/config/`
- Encrypted keys/material: `lit-actions/keys/` (gitignored)

## Integration Boundaries
- Web/desktop/android clients consume action CIDs from app-side config.
- Contract address constants in actions must match deployed chain targets.
- Keep signature message formats stable unless clients are updated in lockstep.

## Files You Will Touch Most
- `lit-actions/features/**/<action>.js`
- `lit-actions/scripts/setup.ts`
- `lit-actions/cids/dev.json`
- `lit-actions/config/*`

## Safety Rules
- Preserve replay protection and signature verification semantics.
- Avoid adding new external API dependencies without fallback/error handling.
- When changing an action interface, update caller code and tests in the same branch.
