# study-progress subgraph

Indexes learning attempts from `StudyAttemptsV1` and canonical study set anchors from `StudySetRegistryV1`.

## What it indexes

- `StudyAttempt` (immutable): one row per `AttemptSubmitted` event.
- `UserStudySetProgress` (mutable aggregate): totals and latest canonical ordering fields per `(user, studySetKey)`.
- `UserStudySetQuestionTouch` (immutable): first touch marker per `(user, studySetKey, questionId)`.
- `StudySetAnchor` (immutable): canonical anchor payload per `studySetKey` from `StudySetRegistered`.

## Canonical replay order

Use chain-derived ordering only:

1. `blockNumber`
2. `logIndex`

`canonicalOrder = blockNumber * 1_000_000 + logIndex` is stored to allow single-field ordering in GraphQL.

Do **not** use `clientTimestamp` as canonical replay order; it is user-provided calldata.

`StudySetRegistryV1` is first-write-wins per `studySetKey`, so one immutable anchor row per key is expected.

## Configure addresses

Set addresses via script (updates both manifests):

```bash
bun run set-addresses -- \
  --attempts 0x... \
  --registry 0x... \
  --attempts-start 123456 \
  --registry-start 123456
```

You can also use env vars:

- `TEMPO_STUDY_ATTEMPTS` (or `STUDY_ATTEMPTS`)
- `TEMPO_STUDY_SET_REGISTRY` (or `STUDY_SET_REGISTRY`)
- `STUDY_ATTEMPTS_START_BLOCK`
- `STUDY_SET_REGISTRY_START_BLOCK`

## Build

```bash
bun install
bun run build:tempo
```

## Deploy contracts first

Deploy both contracts from `contracts/tempo`:

```bash
forge script script/DeployStudyV1.s.sol:DeployStudyV1Script \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --broadcast
```

Script outputs:

- `TEMPO_STUDY_SET_REGISTRY=0x...`
- `TEMPO_STUDY_ATTEMPTS=0x...`

## Example query

```graphql
query AttemptsForUserStudySet($userStudySetId: ID!, $first: Int = 200) {
  userStudySetProgress(id: $userStudySetId) {
    id
    user
    studySetKey
    totalAttempts
    uniqueQuestionsTouched
    averageScore
    latestCanonicalOrder
    attempts(first: $first, orderBy: canonicalOrder, orderDirection: asc) {
      id
      questionId
      rating
      score
      canonicalOrder
      blockNumber
      logIndex
      blockTimestamp
      clientTimestamp
    }
  }
}
```
