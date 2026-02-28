import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { DEFAULT_RULES, defineConfig, resolveRules } from '../../src/core/config.js';

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
});
