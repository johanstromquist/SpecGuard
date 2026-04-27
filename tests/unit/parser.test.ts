import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openApiPlugin } from '../../src/spec/plugins/openapi/parser.js';

const fixturePath = path.resolve(__dirname, '../fixtures/simple-fetch/openapi.yaml');

describe('OpenAPI parser', () => {
  it('parses endpoints from spec', async () => {
    const endpoints = await openApiPlugin.parse(fixturePath);

    expect(endpoints.length).toBeGreaterThanOrEqual(4);

    const listUsers = endpoints.find((e) => e.id === 'GET /api/users');
    expect(listUsers).toBeDefined();
    expect(listUsers!.method).toBe('GET');
    expect(listUsers!.responses['200']).toBeDefined();
    expect(listUsers!.responses['200'].kind).toBe('array');

    const getUser = endpoints.find((e) => e.id === 'GET /api/users/{id}');
    expect(getUser).toBeDefined();
    expect(getUser!.params.length).toBeGreaterThanOrEqual(1);
    expect(getUser!.params[0].name).toBe('id');

    const createUser = endpoints.find((e) => e.id === 'POST /api/users');
    expect(createUser).toBeDefined();
    expect(createUser!.requestBody).toBeDefined();
    expect(createUser!.requestBody!.kind).toBe('object');
  });

  it('marks deprecated endpoints', async () => {
    const endpoints = await openApiPlugin.parse(fixturePath);
    const deprecated = endpoints.find((e) => e.id === 'GET /api/deprecated');
    expect(deprecated).toBeDefined();
    expect(deprecated!.deprecated).toBe(true);
  });

  it('rejects remote references by default', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'specguard-openapi-'));
    const remoteRefPath = path.join(tempDir, 'remote-ref.yaml');

    try {
      await writeFile(
        remoteRefPath,
        [
          'openapi: "3.0.3"',
          'info:',
          '  title: Remote Ref',
          '  version: "1.0"',
          'paths:',
          '  /remote:',
          '    get:',
          '      responses:',
          '        "200":',
          '          description: ok',
          '          content:',
          '            application/json:',
          '              schema:',
          '                $ref: "https://example.invalid/schema.json"',
          '',
        ].join('\n'),
      );

      await expect(openApiPlugin.parse(remoteRefPath)).rejects.toThrow();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
