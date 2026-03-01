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

  it('prefers method-matching endpoint when path has multiple methods', () => {
    const result = matchPath(makeUrl('/api/users'), endpoints, 'POST');
    expect(result?.method).toBe('POST');
    expect(result?.pathTemplate).toBe('/api/users');
  });

  it('falls back to first path match when method does not match any', () => {
    const result = matchPath(makeUrl('/api/users'), endpoints, 'DELETE');
    expect(result?.pathTemplate).toBe('/api/users');
  });

  it('matches correct method on parameterized paths', () => {
    const multiMethodEndpoints = [
      makeEndpoint('GET', '/api/items/{id}'),
      makeEndpoint('PUT', '/api/items/{id}'),
      makeEndpoint('DELETE', '/api/items/{id}'),
    ];
    expect(matchPath(makeUrl('/api/items/99'), multiMethodEndpoints, 'PUT')?.method).toBe('PUT');
    expect(matchPath(makeUrl('/api/items/99'), multiMethodEndpoints, 'DELETE')?.method).toBe('DELETE');
    expect(matchPath(makeUrl('/api/items/99'), multiMethodEndpoints, 'GET')?.method).toBe('GET');
  });
});
