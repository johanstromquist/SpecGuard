import { describe, it, expect } from 'vitest';
import { Project, ScriptTarget, ModuleKind, SyntaxKind } from 'ts-morph';
import { analyzeUrl } from '../../src/scanner/url-analyzer.js';
import { matchEndpoint } from '../../src/matcher/endpoint-matcher.js';
import type { CallSite, SpecEndpoint, Severity } from '../../src/core/types.js';
import { DEFAULT_RULES } from '../../src/core/config.js';

function getFirstArgUrl(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
    },
  });

  const sourceFile = project.createSourceFile('test.ts', code);
  const call = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
  const arg = call.getArguments()[0];
  return analyzeUrl(arg);
}

describe('query parameter extraction', () => {
  it('extracts query params from URL string', () => {
    const result = getFirstArgUrl(`fetch('/users?page=1&limit=10')`);
    expect(result.resolved).toBe('/users');
    expect(result.queryParams).toEqual({ page: '1', limit: '10' });
  });

  it('extracts query params without values', () => {
    const result = getFirstArgUrl(`fetch('/users?active')`);
    expect(result.queryParams).toEqual({ active: true });
  });

  it('no queryParams when URL has no query string', () => {
    const result = getFirstArgUrl(`fetch('/users')`);
    expect(result.queryParams).toBeUndefined();
  });
});

describe('query parameter validation', () => {
  const rules = DEFAULT_RULES as Record<string, Severity>;

  const endpoint: SpecEndpoint = {
    id: 'GET /users',
    method: 'GET',
    pathTemplate: '/users',
    params: [
      { name: 'page', in: 'query', required: true, shape: { kind: 'number' } },
      { name: 'limit', in: 'query', required: false, shape: { kind: 'number' } },
    ],
    responses: { '200': { kind: 'array' } },
    deprecated: false,
  };

  const plugin = {
    name: 'test',
    supportedExtensions: ['.yaml'],
    parse: async () => [endpoint],
    matchUrl: () => endpoint,
  };

  it('reports missing required query param', () => {
    const callSite: CallSite = {
      file: 'test.ts',
      line: 1,
      method: 'GET',
      url: { segments: [{ value: 'users', dynamic: false }], resolved: '/users', queryParams: {} },
      callee: 'fetch',
    };

    const { mismatches } = matchEndpoint(callSite, [endpoint], plugin, '', rules);
    expect(mismatches.some((m) =>
      m.kind === 'missing-in-frontend' && m.path === 'query.page',
    )).toBe(true);
  });

  it('reports unknown query param', () => {
    const callSite: CallSite = {
      file: 'test.ts',
      line: 1,
      method: 'GET',
      url: {
        segments: [{ value: 'users', dynamic: false }],
        resolved: '/users',
        queryParams: { page: '1', unknown: 'true' },
      },
      callee: 'fetch',
    };

    const { mismatches } = matchEndpoint(callSite, [endpoint], plugin, '', rules);
    expect(mismatches.some((m) =>
      m.kind === 'missing-in-spec' && m.path === 'query.unknown',
    )).toBe(true);
  });
});
