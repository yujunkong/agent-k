/**
 * Model Registry — 정규화된 모델명 + 제공 Provider 리스트.
 * Composer 는 이 목록을 하나로 보여주고, 실제 요청은 ModelResolver 가 고른다.
 */
import { isLocalBaseUrl } from './detectProviderType';
import { inferModelTags, type ModelTag } from './modelTags';
import { displayModelName, normalizeModelId } from './normalizeModelId';
import {
  connectionModelIds,
  getProviderConnections,
  type ProviderConnection
} from './ProviderConnections';

export interface UnifiedModelProvider {
  connectionId: string;
  connectionName: string;
  originalModelId: string;
  isLocal: boolean;
}

export interface UnifiedModel {
  canonicalId: string;
  displayName: string;
  originalIds: string[];
  tags: ModelTag[];
  providers: UnifiedModelProvider[];
}

function pickDisplayName(originals: string[]): string {
  const localFirst = originals[0] || '';
  return displayModelName(localFirst) || localFirst;
}

export function listUnifiedModels(): UnifiedModel[] {
  const connections = getProviderConnections();
  const buckets = new Map<string, {
    originals: string[];
    providers: UnifiedModelProvider[];
    local: boolean;
  }>();

  for (const conn of connections) {
    const local = isLocalBaseUrl(conn.baseUrl);
    for (const original of connectionModelIds(conn)) {
      const canonical = normalizeModelId(original);
      if (!canonical) continue;
      const bucket = buckets.get(canonical) || { originals: [], providers: [], local: false };
      if (!bucket.originals.includes(original)) bucket.originals.push(original);
      bucket.providers.push({
        connectionId: conn.id,
        connectionName: conn.name,
        originalModelId: original,
        isLocal: local
      });
      if (local) {
        bucket.local = true;
        // Local 원본을 display 우선으로 앞으로
        bucket.originals = [original, ...bucket.originals.filter((id) => id !== original)];
      }
      buckets.set(canonical, bucket);
    }
  }

  const models: UnifiedModel[] = [];
  for (const [canonicalId, bucket] of buckets) {
    const displayName = pickDisplayName(bucket.originals);
    models.push({
      canonicalId,
      displayName,
      originalIds: bucket.originals,
      tags: inferModelTags({ modelId: displayName, isLocalProvider: bucket.local }),
      providers: bucket.providers
    });
  }

  return models.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function findUnifiedModel(modelOrCanonical: string): UnifiedModel | undefined {
  const canon = normalizeModelId(modelOrCanonical);
  if (!canon) return undefined;
  return listUnifiedModels().find((m) => m.canonicalId === canon);
}

export function findConnectionsForModel(
  modelOrCanonical: string,
  connections = getProviderConnections()
): Array<{ connection: ProviderConnection; originalModelId: string }> {
  const canon = normalizeModelId(modelOrCanonical);
  const hits: Array<{ connection: ProviderConnection; originalModelId: string }> = [];
  for (const conn of connections) {
    const original = connectionModelIds(conn).find((id) => normalizeModelId(id) === canon);
    if (original) hits.push({ connection: conn, originalModelId: original });
  }
  return hits;
}
