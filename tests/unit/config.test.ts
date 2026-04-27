import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DEFAULT_RULES, defineConfig, loadConfig, resolveRules } from '../../src/core/config.js';

describe('config', () => {
  it('defineConfig returns input unchanged', () => {
    const input = {
      specs: [{ path: './api.json' }],
      include: ['src/**/*.ts'],
    };
    expect(defineConfig(input)).toBe(input);
  });

  it('DEFAULT_RULES has all mismatch kinds', () => {
    const expectedKinds = [
      'missing-in-spec',
      'missing-in-frontend',
      'type-mismatch',
      'extra-in-spec',
      'required-mismatch',
      'method-mismatch',
      'deprecated',
      'unmatched-endpoint',
    ];
    for (const kind of expectedKinds) {
      expect(DEFAULT_RULES).toHaveProperty(kind);
    }
  });

  it('resolveRules merges user rules with defaults', () => {
    const result = resolveRules({ 'extra-in-spec': 'error' });
    expect(result['extra-in-spec']).toBe('error');
    expect(result['missing-in-spec']).toBe('error'); // default
  });

  it('uses non-executable config discovery in CI by default', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'specguard-config-'));
    const oldCwd = process.cwd();
    const oldCI = process.env.CI;
    const oldAllow = process.env.SPECGUARD_ALLOW_EXECUTABLE_CONFIG;

    try {
      await writeFile(
        path.join(tempDir, 'specguard.config.ts'),
        'throw new Error("executable config should not run");\n',
      );
      await writeFile(
        path.join(tempDir, 'specguard.config.json'),
        JSON.stringify({ specs: [{ path: './openapi.json' }], include: ['src/**/*.ts'] }),
      );

      process.chdir(tempDir);
      process.env.CI = 'true';
      delete process.env.SPECGUARD_ALLOW_EXECUTABLE_CONFIG;

      const config = await loadConfig();
      expect(config.specs).toEqual([{ path: './openapi.json' }]);
    } finally {
      process.chdir(oldCwd);
      if (oldCI === undefined) delete process.env.CI;
      else process.env.CI = oldCI;
      if (oldAllow === undefined) delete process.env.SPECGUARD_ALLOW_EXECUTABLE_CONFIG;
      else process.env.SPECGUARD_ALLOW_EXECUTABLE_CONFIG = oldAllow;
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
