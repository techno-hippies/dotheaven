# Subgraphs

Indexers for on-chain Heaven protocol data.

## Purpose
- Provide queryable projections for app features (profiles, activity, playlists, etc.).

## Boundary
- This folder contains subgraph definitions only (schema/mappings/manifests).
- Runtime/hosting for subgraphs lives in `services/graph-node-tempo/`.

## Usage
- Each subgraph folder contains its own schema, mappings, and deployment config.
- Keep ABI and mapping changes in sync with contract changes.
- Study attempts + study set anchors indexing lives in `subgraphs/study-progress`.
