# Library And Search Updates (GPUI, Performance-First)

## Goal

Ship a responsive GPUI library experience for large local collections (21k+ tracks), with:

1. Stable render performance during playback.
2. Fast in-page search across common fields.
3. Click-to-sort table headers with clear state.
4. Data-layer improvements that keep rescans and future query paths scalable.

## Scope

In scope:

1. `apps/desktop/src/main.rs`
2. `apps/desktop/src/library.rs`
3. `apps/desktop/src/music_db.rs`

Out of scope (this plan):

1. Web/frontend library UX changes.
2. Shared-with-me feature redesign beyond perf safety.
3. Playlist feature expansion unrelated to list/search/sort performance.

## Ground Truth (Audited)

Confirmed priority issues:

1. `P0`: Global app rerender every 200ms from playback polling.
2. `P0`: Full `tracks` vector clone on each library render.
3. `P1`: Missing DB indexes for common sort/search paths.
4. `P1`: No scan write transaction batching.
5. `P2`: Static (non-clickable) table headers.
6. `P2`: Active row keyed by index (`usize`) instead of stable identity.
7. `P2`: Intermediate vector clones during initial paged loading.

Severity adjustments from prior pass:

1. Startup-only paged clones are downgraded from P1 to P2.
2. Per-file cache read during scan is valid; batching writes is the actual issue.

## Performance Targets

Targets for a 21k+ track library on a typical dev machine:

1. No app-wide periodic rerender loop while idle.
2. Search keystroke-to-visible-update under 150ms for normal queries.
3. Sort action-to-visible-update under 200ms.
4. Smooth list scrolling (no regular hitch pattern from timer-driven rerenders).
5. Rescan write stage materially reduced via transaction batching.

## Execution Plan

### Phase 0: Baseline Safety

1. Ensure `apps/desktop` is compiling before perf refactors proceed.
2. Capture baseline timings:
   1. startup load to first list paint
   2. search latency
   3. sort latency
   4. subjective scroll smoothness

Exit criteria:

1. Build is green.
2. Baseline numbers logged in PR notes.

### Phase 1: Stop The Bleeding (Highest ROI)

1. Replace global `HeavenApp` timer `cx.notify()` behavior with targeted updates only.
2. Remove per-render full `tracks.clone()` in library render path.
3. Move from index-based active row tracking to stable key (`file_path`-based identity).

Implementation notes:

1. Keep row virtualization (`uniform_list`) intact.
2. Use shared immutable track storage (`Arc<Vec<TrackRow>>` or equivalent) to avoid structural clones.
3. Keep playback auto-advance logic without forcing root repaints.

Exit criteria:

1. No full-app repaint every 200ms.
2. No full-library clone on steady-state rerender.
3. Active row remains correct after reorder/filter operations.

### Phase 2: Library Search

1. Add search input to library toolbar (above header row; not in right side panel).
2. Add query state and derived `filtered_indices: Vec<usize>`.
3. Filter against `title`, `artist`, and `album`.
4. Render list from `filtered_indices`, not raw sequential positions.
5. Add debounce (~150ms) to avoid excessive recomputation.

Behavior:

1. Incremental filtering while typing.
2. Clear/no-results states.
3. Preserve playback state and active-row highlight by stable identity.

Exit criteria:

1. Search UX is page-local and functional.
2. Typing remains responsive on 21k+ tracks.

### Phase 3: Sortable Columns

1. Add sort state (`column`, `direction`) for title/artist/album/duration.
2. Make headers clickable and show sort indicator on active column.
3. Apply sorting to `filtered_indices` in place (not full track struct copies).
4. Keep sort + filter composition deterministic.

Behavior:

1. Click cycle: `asc -> desc -> default`.
2. Sorting does not break current playback identity/highlight.

Exit criteria:

1. Header interactions work as expected.
2. Sort operations complete within target latency on 21k+ tracks.

### Phase 4: DB Hardening

1. Add indexes:
   1. `(folder_path, artist)`
   2. `(folder_path, album)`
   3. keep existing `(folder_path)` and evaluate `(folder_path, title)` consistency
2. Wrap scan upserts in a transaction (or chunked transactions) for faster rescans.
3. Optional follow-up: evaluate FTS5 for very large search datasets.

Exit criteria:

1. Rescan write path benefits from transaction batching.
2. Query plan is index-backed for common sort/search access patterns.

## Risks And Guardrails

1. Risk: Refactor of track identity may regress next/prev behavior.
   1. Guardrail: cover playback transitions with manual test cases before merge.
2. Risk: Search/filter recomputation may still spike on every keystroke.
   1. Guardrail: debounce + index-list transforms only (avoid cloning track structs).
3. Risk: DB migration/index creation cost on existing installs.
   1. Guardrail: `CREATE INDEX IF NOT EXISTS` and first-run timing check.

## Validation Checklist

1. Library opens with 21k+ tracks and remains interactive.
2. Playback progress updates without app-wide rerender churn.
3. Search filters title/artist/album correctly and quickly.
4. Sort headers toggle and display indicators correctly.
5. Active track highlight is correct under search/sort changes.
6. Rescan path remains correct and is measurably faster after transaction batching.

## Rollout Order

1. Merge Phase 1 independently (critical performance fix).
2. Merge Phase 2 + Phase 3 together if stable, otherwise split.
3. Merge Phase 4 DB hardening with migration notes.
