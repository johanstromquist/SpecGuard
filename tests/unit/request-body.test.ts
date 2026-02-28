import { describe, it, expect } from 'vitest';
import { Project, ScriptTarget, ModuleKind } from 'ts-morph';
import { scanCallSites } from '../../src/scanner/call-site-scanner.js';

function createProject(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
      strict: true,
    },
  });

  project.createSourceFile(
    'types.ts',
    `export interface CreateUserInput { name: string; email: string; }`,
  );

  const sourceFile = project.createSourceFile('test.ts', code);
  return { project, sourceFile };
}

describe('extractRequestBody', () => {
  it('extracts body from JSON.stringify({ name, email })', () => {
    const { sourceFile } = createProject(`
      async function createUser() {
        const res = await fetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({ name: 'test', email: 'test@test.com' }),
        });
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].requestBody).toBeDefined();
    expect(sites[0].requestBody?.kind).toBe('object');
    expect(sites[0].requestBody?.properties?.name).toBeDefined();
    expect(sites[0].requestBody?.properties?.email).toBeDefined();
  });

  it('extracts body from JSON.stringify(typedVar)', () => {
    const { sourceFile } = createProject(`
      import { CreateUserInput } from './types';
      async function createUser(input: CreateUserInput) {
        const res = await fetch('/api/users', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].requestBody).toBeDefined();
    expect(sites[0].requestBody?.kind).toBe('object');
    expect(sites[0].requestBody?.properties?.name).toBeDefined();
  });

  it('returns undefined when no body', () => {
    const { sourceFile } = createProject(`
      async function getUsers() {
        const res = await fetch('/api/users');
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].requestBody).toBeUndefined();
  });
});
