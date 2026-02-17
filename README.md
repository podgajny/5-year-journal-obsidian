# Five-Year Journal (Obsidian Plugin)

`Five-Year Journal` adds a sidebar view in Obsidian that helps you compare your current journal context with entries from previous years.

## What it does

- Adds a custom right-sidebar view: **Five-Year Journal**.
- Works for notes tagged with exact `#journal`.
- Uses `created` from frontmatter as the journal date source.
- Matches entries by **ISO week number** (not exact day), which increases useful results.
- Shows sections for:
  - `This year` (when the active note is from a different year)
  - `1 year ago`
  - `2 years ago`
  - `3 years ago`
  - `4 years ago`
- Historical sections (`1-4 years ago`) are resolved relative to the current calendar year.
- Shows all matching notes per section without collapsing.
- Each result is clickable and opens the note.
- Shows a richer multi-line preview snippet for each result.

## Rules and assumptions

- Journal note = note tagged with exact `#journal`.
- Date source = `created` frontmatter field.
- Accepted `created` formats:
  - `YYYY-MM-DD`
  - ISO datetime strings (e.g. `YYYY-MM-DDTHH:mm:ssZ`)
- If `created` is missing or invalid, the note is ignored in historical results.
- If the active note is `#journal` but has no valid `created`, the view shows:
  - `This journal note has no valid 'created' date in frontmatter.`
- If active note is not `#journal`, the panel stays empty.

## Example frontmatter

```yaml
---
created: 2026-01-09
tags:
  - journal
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
```

- Source: `main.ts`, `styles.css`
- Build output: `main.js`

## Refresh behavior

The view re-renders on:

- active file change
- vault events: `changed`, `create`, `delete`, `rename`
- metadata cache `changed`

## Keep this README up to date

When adding/changing features, update:

- **What it does**
- **Rules and assumptions**
- **Installation/Development** (if workflow changed)
- Add a short note here under a new section:

### Change notes

- `0.1.1`: Fixed historical year section targeting to be relative to current year and removed show-more collapsing.
- `0.1.0`: Initial public version with week-based matching, current-year context section, and richer previews.
