# Patch Format

## Search-Replace Hunk Format
Each hunk consists of `oldText` (exact match) and `newText` (replacement).

```typescript
interface SearchReplaceHunk {
  oldText: string;    // Exact text to find (unique occurrence)
  newText: string;    // Replacement text
}
```

## Fuzzy Matching
- Dice coefficient for whitespace-tolerant matching
- Token-level comparison when exact match fails
- Falls back to exact match first

## Validation Rules
1. **Uniqueness**: `oldText` must match exactly 1 occurrence in file
2. **No overlap**: Hunks must not overlap in application order
3. **Bottom-up merge**: Apply from last hunk to first to preserve line numbers

## Merge Algorithm
1. Sort hunks by position (bottom-up: last line first)
2. Validate each hunk before applying
3. Apply search-replace per hunk
4. Return modified content

## Error Handling
- `NOT_FOUND`: oldText does not appear in file (count = 0)
- `AMBIGUOUS_MATCH`: oldText appears 2+ times (count > 1)
- `OVERLAP`: Hunks overlap in application
