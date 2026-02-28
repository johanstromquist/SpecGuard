import { describe, it, expect } from 'vitest';
import { matchPath } from '../../src/spec/plugins/openapi/path-matcher.js';
import type { SpecEndpoint, UrlPattern } from '../../src/core/types.js';

function makeEndpoint(method: string, pathTemplate: string): SpecEndpoint {
  return {
    id: `${method} ${pathTemplate}`,
    method,
    pathTemplate,
    params: [],
    responses: {},
    deprecated: false,
  };
}

function makeUrl(resolved: string): UrlPattern {
  return {
    segments: resolved.split('/').filter(Boolean).map((s) => ({ value: s, dynamic: false })),
    resolved,
  };
}

describe('matchPath', () => {
  const endpoints = [
    makeEndpoint('GET', '/api/users'),
    makeEndpoint('GET', '/api/users/{id}'),
    makeEndpoint('POST', '/api/users'),
    makeEndpoint('GET', '/api/posts/{postId}/comments'),
  ];

  it('matches exact literal paths', () => {
    const result = matchPath(makeUrl('/api/users'), endpoints);
    expect(result?.pathTemplate).toBe('/api/users');
  });

  it('matches parameterized paths', () => {
    const result = matchPath(makeUrl('/api/users/123'), endpoints);
    expect(result?.pathTemplate).toBe('/api/users/{id}');
  });

  it('prefers exact matches over parameterized', () => {
    // /api/users should match the literal, not the parameterized
    const result = matchPath(makeUrl('/api/users'), endpoints);
    expect(result?.pathTemplate).toBe('/api/users');
  });

  it('matches nested parameterized paths', () => {
    const result = matchPath(makeUrl('/api/posts/42/comments'), endpoints);
    expect(result?.pathTemplate).toBe('/api/posts/{postId}/comments');
  });

  it('returns null for no match', () => {
    const result = matchPath(makeUrl('/api/unknown'), endpoints);
    expect(result).toBeNull();
  });

  it('returns null for unresolvable URLs', () => {
    const result = matchPath({ segments: [], resolved: null }, endpoints);
    expect(result).toBeNull();
  });

  it('rejects segment count mismatch', () => {
    const result = matchPath(makeUrl('/api/users/123/posts'), endpoints);
    expect(result).toBeNull();
  });
});
