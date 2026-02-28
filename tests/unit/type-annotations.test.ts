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
    `export interface User { id: number; name: string; email: string; }`,
  );

  const sourceFile = project.createSourceFile('test.ts', code);
  return { project, sourceFile };
}

describe('variable type annotations', () => {
  it('extracts type from const user: User = await res.json()', () => {
    const { sourceFile } = createProject(`
      import { User } from './types';
      async function getUser() {
        const res = await fetch('/api/users/1');
        const user: User = await res.json();
        return user;
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].responseType).toBeDefined();
    expect(sites[0].responseType?.kind).toBe('object');
    expect(sites[0].responseType?.properties?.id).toBeDefined();
    expect(sites[0].responseType?.properties?.name).toBeDefined();
  });

  it('extracts type from destructured const { id }: User = await res.json()', () => {
    const { sourceFile } = createProject(`
      import { User } from './types';
      async function getUser() {
        const res = await fetch('/api/users/1');
        const { id }: User = await res.json();
        return id;
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].responseType).toBeDefined();
    expect(sites[0].responseType?.kind).toBe('object');
  });

  it('returns undefined when no annotation and no assertion', () => {
    const { sourceFile } = createProject(`
      async function getUser() {
        const res = await fetch('/api/users/1');
        const user = await res.json();
        return user;
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].responseType).toBeUndefined();
  });

  it('existing as User pattern still works', () => {
    const { sourceFile } = createProject(`
      import { User } from './types';
      async function getUser() {
        const res = await fetch('/api/users/1');
        return await res.json() as User;
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].responseType).toBeDefined();
    expect(sites[0].responseType?.kind).toBe('object');
    expect(sites[0].responseType?.properties?.id).toBeDefined();
  });
});
