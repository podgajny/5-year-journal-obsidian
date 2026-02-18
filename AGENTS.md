# AGENTS.md

## Purpose
This plugin adds a right-sidebar view in Obsidian that shows notes from the same ISO week across previous years.
Matching notes are selected by configurable frontmatter filters and date field.

## Architecture Map
- `main.ts`
  - Obsidian plugin entrypoint.
  - Registers the custom view and settings tab.
  - Handles refresh lifecycle and cache invalidation triggers.
- `journal-core.ts`
  - Pure core logic (no Obsidian UI dependencies).
  - Owns indexed lookup (`year -> week -> entries`), preview caching, date parsing, concurrency helper.
- `plugin-settings.ts`
  - Settings schema/defaults/normalization.
  - Filter matching helpers and rebuild decision helper (`shouldRebuildIndex`).
- `styles.css`
  - Sidebar view styling.
- `test/journal-core.test.ts`
  - Unit tests for indexing/preview/date helpers/concurrency.
- `test/plugin-settings.test.ts`
  - Unit tests for settings normalization/filter matching/rebuild criteria.

## Runtime Flow
1. `onload()` in `main.ts` loads saved settings and initializes `JournalQueryService`.
2. View renders for active file.
3. Service checks if active note matches configured filter.
4. Service resolves active note date via configured `dateField`.
5. Core index returns matching notes for each target year and same ISO week.
6. Preview snippets are read with limited concurrency and cached.

## Settings Flow
1. User edits draft values in settings tab.
2. User clicks `Save settings`.
3. Plugin normalizes settings and persists via `saveData`.
4. Index cache is invalidated only if index-relevant fields changed:
   - `filterField`
   - `filterValues`
   - `filterMatchMode`
   - `dateField`
5. View refreshes.

## Property Catalog Flow (Settings UI)
1. Settings tab scans vault metadata/frontmatter to discover available properties.
2. `Filter property` and `Date property` use discovered options.
3. `Filter values` uses value suggestions for selected property.
4. `Refresh properties` reruns discovery on demand.

## Key Invariants
- Index rebuild is lazy (performed on next query after invalidation).
- Non-index settings (e.g. preview limits, years back) do not trigger index rebuild.
- Filter matching supports primitive frontmatter values and arrays.
- `tags` is treated as a special field with hash normalization.
- Preview extraction is guarded by `previewMaxBytes`; oversized files return no preview.

## Common Change Playbooks
- Add new filter behavior:
  - Update matching helpers in `plugin-settings.ts`.
  - Add tests in `test/plugin-settings.test.ts`.
  - If index membership changes, ensure `shouldRebuildIndex` reflects it.
- Change date parsing:
  - Update `parseIsoLikeDate` in `journal-core.ts`.
  - Add tests in `test/journal-core.test.ts`.
- Change rendering behavior:
  - Update `FiveYearJournalView` in `main.ts`.
  - Keep render-cancellation guards (`renderId`) intact.

## Build and Test
- Build: `npm run build`
- Test: `npm test`
- CI: `.github/workflows/ci.yml` runs install, test, and build on `push`/`pull_request`.

## Release Notes Discipline
When behavior or settings change:
1. Update `README.md` sections:
   - `What it does`
   - `Rules and assumptions`
   - `Configuration` (if affected)
   - `Change notes`
2. Bump versions consistently:
   - `manifest.json`
   - `package.json`
   - `versions.json`
