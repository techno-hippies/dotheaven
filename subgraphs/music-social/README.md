# Music-Social Subgraph (Tempo)

This subgraph indexes the Tempo music-social domain.

## What it indexes on Tempo

- Scrobble/track registry: `Track`, `Scrobble`, `UserListeningStats`, `UserArtistStats`
- Music publishing/access: `ContentEntry`, `AccessGrant`
- Social graph: `Follow`, `UserFollowStats`

## Tempo schema

- Tempo manifests (`subgraph.tempo.yaml`, `subgraph.tempo.local.yaml`) use `schema.tempo.graphql`.
- Post/comment/translation entities are intentionally excluded from the Tempo schema.

## Deployment naming

- Tempo local slug/scripts use `dotheaven/music-social-tempo`.
