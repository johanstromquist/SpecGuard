import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getCached, setCache } from '../../src/spec/cache.js';
import type { SpecEndpoint } from '../../src/core/types.js';

const dummyEndpoints: SpecEndpoint[] = [
  {
    id: 'GET /users',
    method: 'GET',
    pathTemplate: '/users',
    params: [],
    responses: { '200': { kind: 'array', elementType: { kind: 'string' } } },
    deprecated: false,
  },
];

let tmpDir: string;
let specPath: string;
let cacheDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'specguard-cache-'));
  specPath = path.join(tmpDir, 'openapi.yaml');
  cacheDir = path.join(tmpDir, '.cache');
  await writeFile(specPath, 'openapi: "3.0.0"\ninfo:\n  title: Test\n  version: "1.0"');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('spec cache', () => {
  it('returns null endpoints on cache miss', async () => {
    const result = await getCached(specPath, cacheDir);
    expect(result.endpoints).toBeNull();
    expect(result.contentHash).toBeNull();
  });

  it('returns stored endpoints on cache hit', async () => {
    await setCache(specPath, cacheDir, dummyEndpoints);
    const result = await getCached(specPath, cacheDir);
    expect(result.endpoints).toEqual(dummyEndpoints);
    expect(result.contentHash).toBeTypeOf('string');
  });

  it('invalidates cache when file content changes', async () => {
    await setCache(specPath, cacheDir, dummyEndpoints);
    await writeFile(specPath, 'openapi: "3.0.0"\ninfo:\n  title: Changed\n  version: "2.0"');
    const result = await getCached(specPath, cacheDir);
    expect(result.endpoints).toBeNull();
    expect(result.contentHash).toBeTypeOf('string');
  });
});
