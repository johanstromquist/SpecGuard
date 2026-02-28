import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { SpecEndpoint } from '../core/types.js';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function cacheFilePath(specPath: string, cacheDir: string): string {
  const key = hashContent(path.resolve(specPath));
  return path.join(cacheDir, `${key}.json`);
}

interface CacheEntry {
  contentHash: string;
  endpoints: SpecEndpoint[];
}

export interface CacheResult {
  endpoints: SpecEndpoint[] | null;
  contentHash: string | null;
}

export async function getCached(
  specPath: string,
  cacheDir: string,
): Promise<CacheResult> {
  try {
    const cachePath = cacheFilePath(specPath, cacheDir);
    const [cached, content] = await Promise.all([
      readFile(cachePath, 'utf-8').then((s) => JSON.parse(s) as CacheEntry),
      readFile(specPath, 'utf-8'),
    ]);
    const contentHash = hashContent(content);
    if (cached.contentHash === contentHash) {
      return { endpoints: cached.endpoints, contentHash };
    }
    return { endpoints: null, contentHash };
  } catch {
    return { endpoints: null, contentHash: null };
  }
}

export async function setCache(
  specPath: string,
  cacheDir: string,
  endpoints: SpecEndpoint[],
  contentHash?: string,
): Promise<void> {
  try {
    const hash = contentHash ?? hashContent(await readFile(specPath, 'utf-8'));
    const cachePath = cacheFilePath(specPath, cacheDir);
    await mkdir(cacheDir, { recursive: true });
    const entry: CacheEntry = { contentHash: hash, endpoints };
    await writeFile(cachePath, JSON.stringify(entry));
  } catch {
    // Cache write failure is non-fatal
  }
}
