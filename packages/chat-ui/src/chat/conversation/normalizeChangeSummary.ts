import type { ChangeSummaryItem } from '../components/ChangeSummary';

export type ConversationFileEdit = {
  path?: string;
  filePath?: string;
  additions?: number;
  additionsCount?: number;
  deletions?: number;
  deletionsCount?: number;
  added?: number;
  removed?: number;
};

/** Convert host/file-edit data into the compact summary model used by the UI. */
export function normalizeChangeSummary(files: ConversationFileEdit[] = []): ChangeSummaryItem[] {
  return files
    .map((file) => ({
      path: file.path ?? file.filePath ?? '',
      additions: file.additions ?? file.additionsCount ?? file.added ?? 0,
      deletions: file.deletions ?? file.deletionsCount ?? file.removed ?? 0,
    }))
    .filter((file) => file.path.length > 0);
}
