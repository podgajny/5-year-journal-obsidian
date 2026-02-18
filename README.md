# Five-Year Journal (Obsidian Plugin)

`Five-Year Journal` adds a sidebar view in Obsidian that helps you compare your current journal context with entries from previous years.

## What it does

- Adds a custom right-sidebar view: **Five-Year Journal**.
- Works with a configurable note filter based on any frontmatter property (including `tags`).
- Uses configurable date property from frontmatter (default: `created`) as the journal date source.
- Matches entries by **ISO week number** (not exact day), which increases useful results.
- Shows `This year` (optional) and configurable number of past-year sections.
- Shows all matching notes per section without collapsing.
- Each result is clickable and opens the note.
- Shows a richer multi-line preview snippet for each result.
- Uses an in-memory index (`year -> ISO week -> entries`) to avoid full-vault scans per section render.
- Caches preview snippets per file for faster re-renders.
- Loads preview snippets with limited concurrency to reduce UI blocking.

## Rules and assumptions

- Matching note = note where configured `filterField` matches configured `filterValues`.
- Date source = configured `dateField` frontmatter field.
- Accepted date formats in `dateField`:
  - `YYYY-MM-DD`
  - ISO datetime strings (e.g. `YYYY-MM-DDTHH:mm:ssZ`)
- If `dateField` is missing or invalid, the note is ignored in historical results.
- If active note does not match the configured filter, the panel stays empty.

## Configuration

Settings are available in Obsidian plugin settings:

- `Filter property` (`filterField`): selected from discovered properties in your vault (with `Refresh properties` button).
- `Filter values` (`filterValues`): comma-separated values with autocomplete suggestions for the selected property.
- `Filter match mode` (`filterMatchMode`): `any` or `all`.
- `Date property` (`dateField`): frontmatter date field (default: `created`).
- `Years back` (`yearsBack`): number of historical sections (default: `4`).
- `Show This year section` (`showThisYearSection`): on/off.
- `Preview max lines` and `Preview max characters`.

Changes in settings are applied when you click `Save settings`.

## Example frontmatter

```yaml
---
created: 2026-01-09
type: daily
tags:
  - reflection
---
```

## Installation (manual/dev)

1. Put this plugin folder in:
   - `<your-vault>/.obsidian/plugins/5-year-journal/`
2. Ensure it contains:
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. In Obsidian:
   - Enable Community Plugins
   - Enable **Five-Year Journal**

## Development

```bash
npm install
npm run build
npm test
```

- Source: `main.ts`, `styles.css`
- Build output: `main.js`

## Refresh behavior

The view re-renders on:

- active file change
- vault events: `changed`, `create`, `delete`, `rename`
- metadata cache `changed`

On vault/metadata updates, the plugin invalidates internal index/preview caches before the next render.

## Keep this README up to date

When adding/changing features, update:

- **What it does**
- **Rules and assumptions**
- **Installation/Development** (if workflow changed)
- Add a short note here under a new section:

### Change notes

- `0.1.4`: Added property picker from discovered vault frontmatter fields and value suggestions to reduce filter typos.
- `0.1.3`: Added configurable filter by any property, configurable date field/range/preview limits, and save-based settings flow.
- `0.1.2`: Performance refactor with indexed journal lookup, cached previews, and concurrent preview loading.
- `0.1.1`: Fixed historical year section targeting to be relative to current year and removed show-more collapsing.
- `0.1.0`: Initial public version with week-based matching, current-year context section, and richer previews.
