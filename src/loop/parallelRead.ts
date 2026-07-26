/**
 * Shared helpers for batching / parallelizing read-only agent tools.
 */

export const PARALLEL_READ_TOOLS = new Set([
  'grep',
  'glob',
  'file_search',
  'list_dir',
  'read_file',
  'read_files',
  'codebase_search',
  'lsp_definition',
  'lsp_references',
  'read_lints'
]);

export function isParallelReadTool(name: string): boolean {
  return PARALLEL_READ_TOOLS.has(name);
}

/** Run async work with a concurrency cap; preserve input order in results. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}
