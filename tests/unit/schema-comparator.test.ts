import { describe, it, expect } from 'vitest';
import { compareShapes, type CompareContext } from '../../src/matcher/schema-comparator.js';
import type { TypeShape, CallSite, SpecEndpoint, Severity } from '../../src/core/types.js';
import { DEFAULT_RULES } from '../../src/core/config.js';

const dummyCallSite: CallSite = {
  file: 'test.ts',
  line: 1,
  method: 'GET',
  url: { segments: [], resolved: '/test' },
  callee: 'fetch',
};

const dummyEndpoint: SpecEndpoint = {
  id: 'GET /test',
  method: 'GET',
  pathTemplate: '/test',
  params: [],
  responses: {},
  deprecated: false,
};

const rules = DEFAULT_RULES as Record<string, Severity>;

const ctx: CompareContext = {
  callSite: dummyCallSite,
  endpoint: dummyEndpoint,
  rules,
};

describe('compareShapes', () => {
  it('reports missing-in-spec for extra frontend properties', () => {
    const frontend: TypeShape = {
      kind: 'object',
      properties: {
        id: { shape: { kind: 'number' }, required: true },
        phone: { shape: { kind: 'string' }, required: true },
      },
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {
        id: { shape: { kind: 'number' }, required: true },
      },
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches.some((m) => m.kind === 'missing-in-spec' && m.path === 'phone')).toBe(true);
  });

  it('reports missing-in-frontend for required spec properties', () => {
    const frontend: TypeShape = {
      kind: 'object',
      properties: {
        id: { shape: { kind: 'number' }, required: true },
      },
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {
        id: { shape: { kind: 'number' }, required: true },
        createdAt: { shape: { kind: 'string' }, required: true },
      },
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches.some((m) => m.kind === 'missing-in-frontend' && m.path === 'createdAt')).toBe(true);
  });

  it('reports type-mismatch for different kinds', () => {
    const frontend: TypeShape = {
      kind: 'object',
      properties: {
        count: { shape: { kind: 'string' }, required: true },
      },
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {
        count: { shape: { kind: 'number' }, required: true },
      },
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches.some((m) => m.kind === 'type-mismatch' && m.path === 'count')).toBe(true);
  });

  it('reports required-mismatch', () => {
    const frontend: TypeShape = {
      kind: 'object',
      properties: {
        name: { shape: { kind: 'string' }, required: true },
      },
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {
        name: { shape: { kind: 'string' }, required: false },
      },
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches.some((m) => m.kind === 'required-mismatch')).toBe(true);
  });

  it('reports extra-in-spec when enabled', () => {
    const frontend: TypeShape = {
      kind: 'object',
      properties: {},
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {
        optional: { shape: { kind: 'string' }, required: false },
      },
    };

    const rulesWithExtra = { ...rules, 'extra-in-spec': 'info' as Severity };
    const mismatches = compareShapes(frontend, spec, { ...ctx, rules: rulesWithExtra });
    expect(mismatches.some((m) => m.kind === 'extra-in-spec')).toBe(true);
  });

  it('skips extra-in-spec when off (default)', () => {
    const frontend: TypeShape = {
      kind: 'object',
      properties: {},
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {
        optional: { shape: { kind: 'string' }, required: false },
      },
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches.some((m) => m.kind === 'extra-in-spec')).toBe(false);
  });

  it('recursively compares nested objects', () => {
    const frontend: TypeShape = {
      kind: 'object',
      properties: {
        address: {
          shape: {
            kind: 'object',
            properties: {
              zip: { shape: { kind: 'number' }, required: true },
            },
          },
          required: true,
        },
      },
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {
        address: {
          shape: {
            kind: 'object',
            properties: {
              zip: { shape: { kind: 'string' }, required: true },
            },
          },
          required: true,
        },
      },
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches.some((m) => m.kind === 'type-mismatch' && m.path === 'address.zip')).toBe(true);
  });

  it('compares array element types', () => {
    const frontend: TypeShape = {
      kind: 'array',
      elementType: { kind: 'string' },
    };
    const spec: TypeShape = {
      kind: 'array',
      elementType: { kind: 'number' },
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches.some((m) => m.kind === 'type-mismatch')).toBe(true);
  });

  it('skips comparison when either side is any', () => {
    const frontend: TypeShape = { kind: 'any' };
    const spec: TypeShape = { kind: 'object', properties: { id: { shape: { kind: 'number' }, required: true } } };
    expect(compareShapes(frontend, spec, ctx)).toEqual([]);
  });

  it('includes mapping context in messages when typeMappings provided', () => {
    const frontend: TypeShape = {
      kind: 'object',
      typeName: 'WorkspaceType',
      properties: {
        phone: { shape: { kind: 'string' }, required: true },
      },
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {},
    };

    const mappings = { WorkspaceType: 'WorkspaceRead' };
    const mismatches = compareShapes(frontend, spec, { ...ctx, typeMappings: mappings });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('(WorkspaceType, mapped to WorkspaceRead)');
  });

  it('does not include mapping info when no typeMappings', () => {
    const frontend: TypeShape = {
      kind: 'object',
      typeName: 'WorkspaceType',
      properties: {
        phone: { shape: { kind: 'string' }, required: true },
      },
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {},
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('WorkspaceType');
    expect(mismatches[0].message).not.toContain('mapped to');
  });

  it('does not report type-mismatch for frontend string vs spec enum union', () => {
    const frontend: TypeShape = {
      kind: 'object',
      properties: {
        status: { shape: { kind: 'string' }, required: true },
      },
    };
    const spec: TypeShape = {
      kind: 'object',
      properties: {
        status: {
          shape: {
            kind: 'union',
            members: [
              { kind: 'string', literalValue: 'active' },
              { kind: 'string', literalValue: 'inactive' },
            ],
          },
          required: true,
        },
      },
    };

    const mismatches = compareShapes(frontend, spec, ctx);
    expect(mismatches.filter((m) => m.kind === 'type-mismatch')).toHaveLength(0);
  });
});
