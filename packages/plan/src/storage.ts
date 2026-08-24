/**
 * PLAN-006 — Plan document storage under `.agentk/plans/`.
 * Host supplies read/write; this module only shapes paths + JSON round-trip.
 */

import type { PlanDocument } from './session/schema';
import * as path from 'path';

export function planStorageDir(repoRoot: string): string {
  return path.join(repoRoot, '.agentk', 'plans');
}

export function planDocumentPath(repoRoot: string, planId: string): string {
  const safe = planId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(planStorageDir(repoRoot), `${safe}.json`);
}

export function serializePlanDocument(doc: PlanDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parsePlanDocument(raw: string): PlanDocument {
  const parsed = JSON.parse(raw) as PlanDocument;
  if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.tasks)) {
    throw new Error('Invalid PlanDocument JSON');
  }
  return parsed;
}

export type PlanFs = {
  mkdir: (dir: string) => Promise<void> | void;
  writeFile: (filePath: string, contents: string) => Promise<void> | void;
  readFile: (filePath: string) => Promise<string> | string;
};

/** Persist structured plan JSON (card SoT on disk). */
export async function persistPlanDocument(
  fs: PlanFs,
  repoRoot: string,
  doc: PlanDocument,
): Promise<string> {
  const dir = planStorageDir(repoRoot);
  await fs.mkdir(dir);
  const filePath = planDocumentPath(repoRoot, doc.id);
  await fs.writeFile(filePath, serializePlanDocument(doc));
  return filePath;
}

export async function loadPlanDocument(
  fs: PlanFs,
  repoRoot: string,
  planId: string,
): Promise<PlanDocument> {
  const raw = await fs.readFile(planDocumentPath(repoRoot, planId));
  return parsePlanDocument(raw);
}
