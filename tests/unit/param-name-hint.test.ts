import { describe, it, expect } from 'vitest';
import { Project, ScriptTarget, ModuleKind, SyntaxKind } from 'ts-morph';
import { analyzeUrl } from '../../src/scanner/url-analyzer.js';
import { matchPath } from '../../src/spec/plugins/openapi/path-matcher.js';
import type { SpecEndpoint } from '../../src/core/types.js';

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

describe('path parameter name hinting', () => {
  it('extracts paramName from template literal identifier', () => {
    const result = getFirstArgUrl('const userId = 1; fetch(`/users/${userId}`)');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1].dynamic).toBe(true);
    expect(result.segments[1].paramName).toBe('userId');
  });

  it('does not set paramName for non-identifier expressions', () => {
    const result = getFirstArgUrl('fetch(`/users/${1 + 2}`)');
    expect(result.segments[1].dynamic).toBe(true);
    expect(result.segments[1].paramName).toBeUndefined();
  });

  it('resolved path includes paramName', () => {
    const result = getFirstArgUrl('const userId = 1; fetch(`/users/${userId}`)');
    expect(result.resolved).toBe('/users/{userId}');
  });
});

describe('param name matching score', () => {
  const userEndpoint: SpecEndpoint = {
    id: 'GET /users/{id}',
    method: 'GET',
    pathTemplate: '/users/{id}',
    params: [{ name: 'id', in: 'path', required: true, shape: { kind: 'number' } }],
    responses: {},
    deprecated: false,
  };

  const orderEndpoint: SpecEndpoint = {
    id: 'GET /orders/{id}',
    method: 'GET',
    pathTemplate: '/orders/{id}',
    params: [{ name: 'id', in: 'path', required: true, shape: { kind: 'number' } }],
    responses: {},
    deprecated: false,
  };

  it('matches path with paramName in resolved URL', () => {
    const url = getFirstArgUrl('const id = 1; fetch(`/users/${id}`)');
    const matched = matchPath(url, [userEndpoint, orderEndpoint]);
    expect(matched).toBe(userEndpoint);
  });
});
