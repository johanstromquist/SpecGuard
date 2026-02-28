import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { scan } from '../../src/core/pipeline.js';

const fixtureDir = path.resolve(__dirname, '../fixtures/simple-fetch');

const baseConfig = {
  specs: [{ path: './openapi.yaml' }],
  include: ['src/**/*.ts'],
  exclude: [],
  baseUrl: '',
  wrappers: [],
  typeMappings: {},
  rules: {
    'missing-in-spec': 'error' as const,
    'missing-in-frontend': 'warn' as const,
    'type-mismatch': 'error' as const,
    'extra-in-spec': 'off' as const,
    'required-mismatch': 'warn' as const,
    'method-mismatch': 'error' as const,
    'deprecated': 'warn' as const,
    'unmatched-endpoint': 'warn' as const,
  },
  cache: { enabled: false },
  output: 'terminal' as const,
  tsconfig: './tsconfig.json',
};

describe('simple-fetch integration', () => {
  it('finds expected mismatches', async () => {
    const result = await scan({ config: baseConfig, cwd: fixtureDir });

    // Should find call sites
    expect(result.stats.callSitesFound).toBe(4);

    // Should match endpoints
    expect(result.stats.endpointsMatched).toBe(4);

    // phone is in frontend User but not in spec (array and single cases)
    expect(result.mismatches.some(
      (m) => m.kind === 'missing-in-spec' && m.path?.endsWith('phone'),
    )).toBe(true);

    // createdAt is required in spec but missing from frontend User
    expect(result.mismatches.some(
      (m) => m.kind === 'missing-in-frontend' && m.path?.endsWith('createdAt'),
    )).toBe(true);

    // deprecated endpoint should trigger a warning
    expect(result.mismatches.some(
      (m) => m.kind === 'deprecated',
    )).toBe(true);

    // Should have errors
    expect(result.stats.errors).toBeGreaterThan(0);

    // Should have warnings
    expect(result.stats.warnings).toBeGreaterThan(0);
  });

  it('produces valid JSON output', async () => {
    const result = await scan({ config: baseConfig, cwd: fixtureDir });

    const json = JSON.stringify(result);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(result).toHaveProperty('mismatches');
    expect(result).toHaveProperty('stats');
    expect(Array.isArray(result.mismatches)).toBe(true);
  });

  it('respects rules configuration', async () => {
    const result = await scan({
      config: {
        ...baseConfig,
        rules: {
          ...baseConfig.rules,
          'missing-in-spec': 'off',
          'missing-in-frontend': 'off',
        },
      },
      cwd: fixtureDir,
    });

    // Should not contain missing-in-spec or missing-in-frontend
    expect(result.mismatches.every(
      (m) => m.kind !== 'missing-in-spec' && m.kind !== 'missing-in-frontend',
    )).toBe(true);
  });
});
