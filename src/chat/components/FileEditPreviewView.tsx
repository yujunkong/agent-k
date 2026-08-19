import React from 'react';
import type { FileEditPreview } from '../types';
import { isInlineEditPreview } from '../inlineEditReview';
import { FileEditCard } from './FileEditCard';
import { InlineEditDiff } from './InlineEditDiff';

export interface FileEditPreviewViewProps {
  file: FileEditPreview;
  expanded?: boolean;
  embedded?: boolean;
  onOpenFile?: (path: string) => void;
  onAccept?: (file: FileEditPreview) => void;
  onReject?: (file: FileEditPreview) => void;
}

/** Single render point: Inline Edit chrome vs generic FileEditCard. */
export function FileEditPreviewView({
  file,
  expanded,
  embedded = false,
  onOpenFile,
  onAccept,
  onReject
}: FileEditPreviewViewProps) {
  if (isInlineEditPreview(file)) {
    return (
      <InlineEditDiff
        file={file}
        expanded={expanded}
        embedded={embedded}
        onOpenFile={onOpenFile}
        onAccept={onAccept}
        onReject={onReject}
      />
    );
  }
  return (
    <FileEditCard
      path={file.path}
      absPath={file.absPath}
      additions={file.additions}
      deletions={file.deletions}
      lines={file.lines || []}
      onOpenFile={onOpenFile}
      expanded={expanded}
      embedded={embedded}
    />
  );
}
