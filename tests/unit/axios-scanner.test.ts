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

  // Minimal axios type stub
  project.createSourceFile(
    'node_modules/axios/index.d.ts',
    `
    interface AxiosInstance {
      get<T = any>(url: string): Promise<{ data: T }>;
      post<T = any>(url: string, data?: any): Promise<{ data: T }>;
      put<T = any>(url: string, data?: any): Promise<{ data: T }>;
      patch<T = any>(url: string, data?: any): Promise<{ data: T }>;
      delete<T = any>(url: string): Promise<{ data: T }>;
    }
    interface AxiosStatic extends AxiosInstance {
      create(config?: { baseURL?: string }): AxiosInstance;
    }
    declare const axios: AxiosStatic;
    export default axios;
    `,
  );

  project.createSourceFile(
    'types.ts',
    `export interface User { id: number; name: string; }`,
  );

  const sourceFile = project.createSourceFile('test.ts', code);
  return { project, sourceFile };
}

describe('axios scanner', () => {
  it('detects axios.get(\'/users\')', () => {
    const { sourceFile } = createProject(`
      import axios from 'axios';
      async function getUsers() {
        const res = await axios.get('/users');
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].method).toBe('GET');
    expect(sites[0].url.resolved).toBe('/users');
    expect(sites[0].callee).toBe('axios');
  });

  it('detects axios.post(\'/users\', data) with body type', () => {
    const { sourceFile } = createProject(`
      import axios from 'axios';
      async function createUser() {
        const data = { name: 'test', email: 'test@test.com' };
        const res = await axios.post('/users', data);
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].method).toBe('POST');
    expect(sites[0].requestBody).toBeDefined();
    expect(sites[0].requestBody?.kind).toBe('object');
  });

  it('extracts generic type argument: axios.get<User>(\'/users\')', () => {
    const { sourceFile } = createProject(`
      import axios from 'axios';
      import { User } from './types';
      async function getUsers() {
        const res = await axios.get<User>('/users');
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].responseType).toBeDefined();
    expect(sites[0].responseType?.kind).toBe('object');
    expect(sites[0].responseType?.properties?.id).toBeDefined();
  });

  it('handles axios.create({ baseURL }) instances', () => {
    const { sourceFile } = createProject(`
      import axios from 'axios';
      const api = axios.create({ baseURL: '/api' });
      async function getUsers() {
        const res = await api.get('/users');
      }
    `);

    const sites = scanCallSites([sourceFile], { wrappers: [] });
    expect(sites).toHaveLength(1);
    expect(sites[0].url.resolved).toBe('/api/users');
    expect(sites[0].method).toBe('GET');
  });
});
