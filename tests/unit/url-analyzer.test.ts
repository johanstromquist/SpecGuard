import { describe, it, expect } from 'vitest';
import { Project, ScriptTarget, ModuleKind, SyntaxKind } from 'ts-morph';
import { analyzeUrl } from '../../src/scanner/url-analyzer.js';

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

describe('url-analyzer binary expressions', () => {
  it("resolves '/api' + '/users' to /api/users", () => {
    const result = getFirstArgUrl(`fetch('/api' + '/users')`);
    expect(result.resolved).toBe('/api/users');
  });

  it('resolves BASE_URL + \'/users\' via identifier', () => {
    const result = getFirstArgUrl(`
      const BASE_URL = '/api';
      fetch(BASE_URL + '/users');
    `);
    expect(result.resolved).toBe('/api/users');
  });

  it('resolves multi-part concatenation', () => {
    const result = getFirstArgUrl(`
      const BASE = '/api';
      fetch(BASE + '/users' + '/list');
    `);
    expect(result.resolved).toBe('/api/users/list');
  });

  it('returns null for unresolvable operand', () => {
    const result = getFirstArgUrl(`
      declare const dynamic: string;
      fetch(dynamic + '/users');
    `);
    expect(result.resolved).toBeNull();
  });
});

describe('url-analyzer multi-param templates', () => {
  it('resolves each dynamic segment to its own param name', () => {
    const result = getFirstArgUrl(`
      const userId = '1';
      const postId = '2';
      fetch(\`/users/\${userId}/posts/\${postId}\`);
    `);
    expect(result.resolved).toBe('/users/{userId}/posts/{postId}');
  });
});
