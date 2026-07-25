# Diff Review

## Overview
Diff Review provides visual diff review before applying changes. Users can approve/reject individual hunks or entire files.

## UI Components
- **File Tree**: Shows files with +/- change counts
- **Diff View**: Unified or Side-by-side modes
- **Checkbox**: Per-file and per-hunk selection

## Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Apply all approved changes |
| `Ctrl+Shift+Enter` | Apply only selected hunks |
| `Escape` | Cancel diff review |
| `n` / `p` | Next / Previous hunk |

## Checkbox Sync
- Check/uncheck file → all hunks in file follow
- Check/uncheck hunk → file checkbox updates if all hunks match
- `getSelectedFiles()` / `getSelectedHunks()` for state query

## Apply Flow
1. User reviews diff hunks
2. Selects desired hunks/files
3. `ApplySelected` creates checkpoint
4. Applies selected hunks via WorkspaceEdit
5. Reports errors per hunk

## Undo
- `PendingStore` maintains undo stack
- `Undo by checkpoint ID`, `Undo last`, or `Undo by label`
- Checkpoint restore on undo
