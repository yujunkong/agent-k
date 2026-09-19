/**
 * Artifact types — UI-only surface (ART-002).
 * Runtime store lives in @agent-k/core (`ArtifactStore`); the webview gallery
 * consumes host-provided artifacts via `ui.artifacts.open`.
 */

export type ArtifactType = 'screenshot' | 'demo' | 'diff' | 'text';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  description: string;
  data: string; // base64 for images, markdown for text
  filePath: string;
  timestamp: number;
  tags: string[];
}
