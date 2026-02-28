# SpecGuard

Verify your frontend code against your API spec -- without rewriting anything.

SpecGuard statically analyzes your TypeScript frontend code, finds every `fetch()` call, and compares the response types you assert against your OpenAPI specification. It catches contract mismatches before they hit production.

## Why

Existing tools either require rewriting your API client (openapi-typescript, Kubb), only work at runtime in tests (chai-openapi-response-validator), or only diff spec versions (openapi-diff). SpecGuard works with your existing code as-is.

## Install

```bash
npm install @johnmion/specguard --save-dev
```

## Quick Start

```bash
# Generate a starter config
npx @johnmion/specguard init

# Edit specguard.config.ts to point at your spec and source files

# Run the scan
npx @johnmion/specguard scan
```

## Getting Your OpenAPI Spec

SpecGuard needs an OpenAPI 3.x spec file on disk. How you get it depends on your setup:

**Your backend already generates one.** Most API frameworks can export an OpenAPI spec. Check your framework docs:
- FastAPI: `GET /openapi.json` or `python -c "from app.main import app; import json; print(json.dumps(app.openapi()))" > openapi.json`
- Django REST: `./manage.py generateschema > openapi.yaml`
- Express (with swagger-jsdoc): built into your existing swagger setup
- NestJS: `GET /api-json` from the Swagger module
- Rails (with rswag): `rake rswag:specs:swaggerize`
- Spring Boot: `GET /v3/api-docs`

Fetch it once and commit it, or add a script to pull it fresh:

```bash
# Example: pull from a running backend
curl http://localhost:8000/openapi.json -o openapi.json
npx @johnmion/specguard scan
```

**Your backend doesn't generate one.** Write one by hand. Start minimal -- just the endpoints your frontend actually calls. Even a partial spec catches real bugs. A spec covering 5 endpoints is more useful than no spec at all.

```yaml
# openapi.yaml
openapi: "3.0.3"
info:
  title: My API
  version: "1.0"
paths:
  /api/users:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/User"
components:
  schemas:
    User:
      type: object
      required: [id, name, email]
      properties:
        id: { type: integer }
        name: { type: string }
        email: { type: string }
```

**Monorepo with a shared spec.** Point at it directly:

```ts
defineConfig({
  specs: [{ path: '../backend/openapi.json' }],
});
```

**Multiple microservices.** List all the specs:

```ts
defineConfig({
  specs: [
    { path: './specs/users-api.yaml' },
    { path: './specs/billing-api.yaml' },
  ],
});
```

## What It Catches

Given an OpenAPI spec that defines `User` as `{id, name, email, createdAt, bio?}` and frontend code like:

```ts
interface User {
  id: number;
  name: string;
  email: string;
  phone: string;  // not in the spec
  // createdAt missing -- spec requires it
}

async function getUser(id: number): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  return await res.json() as User;
}
```

SpecGuard reports:

```
src/api.ts
  :5  ERROR  missing-in-spec      Property "phone" exists in frontend type (User) but not in spec
  :5  WARN   missing-in-frontend  Required property "createdAt" from spec is not in frontend type (User)
```

### Mismatch Kinds

| Kind | Description |
|------|-------------|
| `missing-in-spec` | Frontend expects a field the spec doesn't define |
| `missing-in-frontend` | Spec requires a field the frontend type doesn't have |
| `type-mismatch` | Different types (e.g. frontend says `string`, spec says `number`) |
| `required-mismatch` | Frontend treats an optional spec field as always present |
| `method-mismatch` | Frontend uses GET but spec defines POST (or vice versa) |
| `deprecated` | Endpoint is marked deprecated in the spec |
| `unmatched-endpoint` | URL doesn't match any spec endpoint |
| `extra-in-spec` | Spec has optional fields the frontend doesn't use |

## Configuration

SpecGuard uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), so config can live in `specguard.config.ts`, `.specguardrc`, `specguard.config.js`, or the `"specguard"` key in `package.json`.

```ts
// specguard.config.ts
import { defineConfig } from '@johnmion/specguard';

export default defineConfig({
  // Path(s) to your OpenAPI spec
  specs: [{ path: './openapi.json' }],

  // Source files to scan
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['**/*.test.*', '**/*.d.ts'],

  // Prefix stripped from URLs before matching against spec paths
  baseUrl: '/api',

  // Severity per mismatch kind: 'error' | 'warn' | 'info' | 'off'
  rules: {
    'missing-in-spec': 'error',
    'type-mismatch': 'error',
    'missing-in-frontend': 'warn',
    'deprecated': 'warn',
    'extra-in-spec': 'off',
  },

  // Custom fetch wrappers (see below)
  wrappers: [],

  // Map frontend type names to spec schema names (for clearer messages)
  typeMappings: {
    'WorkspaceType': 'WorkspaceRead',
  },

  // Spec parse caching (enabled by default, stores in node_modules/.cache/specguard/)
  cache: { enabled: true },

  // Path to tsconfig for type resolution
  tsconfig: './tsconfig.json',
});
```

### Custom Fetch Wrappers

If your codebase uses a wrapper around `fetch`:

```ts
// Your code
const user = await authFetch('/api/users/1', { method: 'GET' }) as User;
```

Tell SpecGuard how to parse it:

```ts
defineConfig({
  wrappers: [{
    name: 'authFetch',
    urlArg: 0,              // URL is the first argument
    methodFrom: 'arg1.method', // method is in the second arg's .method property
    defaultMethod: 'GET',    // assume GET if method isn't specified
  }],
});
```

## CLI

```
specguard scan [options]       Scan frontend code against API spec
specguard init                 Generate a starter config file

Options:
  --spec <path>                Override spec path
  --include <glob>             Override include glob
  --output terminal|json       Output format (default: terminal)
  --fail-on error|warn|info    Exit code 1 if issues at this severity
  --verbose                    Show analysis steps
```

### Pre-commit Hook

The fastest feedback loop. Catch contract drift before it leaves your machine.

**With [lint-staged](https://github.com/lint-staged/lint-staged)** (recommended -- only scans changed files):

```bash
npm install --save-dev husky lint-staged
npx husky init
```

`.lintstagedrc.json`:
```json
{
  "*.{ts,tsx}": "specguard scan --fail-on error"
}
```

`.husky/pre-commit`:
```bash
npx lint-staged
```

**With husky directly** (scans everything, simpler setup):

```bash
# .husky/pre-commit
npx @johnmion/specguard scan --fail-on error
```

**With [lefthook](https://github.com/evilmartians/lefthook):**

```yaml
# lefthook.yml
pre-commit:
  commands:
    specguard:
      run: npx @johnmion/specguard scan --fail-on error
```

The `--fail-on error` flag is key -- it sets exit code 1 when errors exist, which blocks the commit. Use `--fail-on warn` if you want stricter enforcement.

### CI Usage

```bash
# Fail the build if any errors exist
npx @johnmion/specguard scan --fail-on error

# JSON output for downstream processing
npx @johnmion/specguard scan --output json > specguard-report.json
```

**GitHub Actions example:**

```yaml
# .github/workflows/specguard.yml
name: API Contract Check
on: [pull_request]
jobs:
  specguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx @johnmion/specguard scan --fail-on error
```

## Programmatic API

```ts
import { scan, loadConfig } from '@johnmion/specguard';

const result = await scan({ cwd: '/path/to/project' });

console.log(result.stats);
// { filesScanned: 12, callSitesFound: 34, endpointsMatched: 30, errors: 3, warnings: 5, infos: 0 }

for (const m of result.mismatches) {
  console.log(`${m.callSite.file}:${m.callSite.line} [${m.severity}] ${m.message}`);
}
```

You can also pass config directly:

```ts
import { scan } from '@johnmion/specguard';

const result = await scan({
  config: {
    specs: [{ path: './openapi.yaml' }],
    include: ['src/**/*.ts'],
    exclude: [],
    baseUrl: '',
    wrappers: [],
    typeMappings: {},
    rules: { 'missing-in-spec': 'error' },
    cache: { enabled: false },
    output: 'terminal',
    tsconfig: './tsconfig.json',
  },
});
```

## How It Works

1. **Parse spec** -- Dereferences your OpenAPI document and normalizes every schema into an internal type representation
2. **Load project** -- Creates a TypeScript project via ts-morph with full type checker support
3. **Scan call sites** -- Walks source files, finds `fetch()` calls and configured wrappers, extracts URLs and HTTP methods
4. **Trace response types** -- Follows the variable from `fetch()` to `.json()`, finds `as SomeType` assertions or `: Type` variable annotations, resolves them through the TypeScript type checker
5. **Match endpoints** -- Maps each URL to a spec path template using segment-by-segment matching (`/api/users/123` matches `/api/users/{id}`)
6. **Compare shapes** -- Recursively walks properties, produces mismatches for missing fields, type mismatches, and requiredness disagreements
7. **Report** -- Groups findings by file, colors by severity

## Supported Patterns

### fetch()

```ts
// String literal URLs
const res = await fetch('/api/users');

// Template literal URLs with parameter name hinting
const res = await fetch(`/api/users/${userId}`);

// URL string concatenation
const res = await fetch(BASE_URL + '/users');

// Method from options object
const res = await fetch('/api/users', { method: 'POST' });

// Query parameters
const res = await fetch('/api/users?page=1&limit=10');

// Type assertions on .json()
const data = await res.json() as User;

// Variable type annotations
const user: User = await res.json();
const { id }: User = await res.json();

// Request body validation
const res = await fetch('/api/users', {
  method: 'POST',
  body: JSON.stringify(userData),
});
```

### axios

```ts
// Basic methods
const res = await axios.get('/users');
const res = await axios.post('/users', userData);

// Generic type arguments for response types
const res = await axios.get<User>('/users/1');

// Instances with baseURL
const api = axios.create({ baseURL: '/api' });
const res = await api.get('/users');
```

## Using with AI Coding Agents

SpecGuard is most valuable as a guardrail for AI agents writing frontend code. Agents are fast but they hallucinate API shapes -- they'll confidently write `user.phone` when the API doesn't have a `phone` field, or use GET where the spec says POST. SpecGuard catches these immediately.

### Claude Code / Cursor / Aider

Add SpecGuard to your project instructions so the agent runs it after writing API-touching code. Put this in your `CLAUDE.md`, `.cursorrules`, or equivalent:

```markdown
After modifying any file that calls fetch() or an API wrapper, run:
  npx @johnmion/specguard scan --fail-on error
Fix any errors before considering the task complete.
```

This turns SpecGuard into a tight feedback loop: the agent writes code, runs the scan, sees mismatches, and fixes them -- all within a single task cycle.

### As a post-generation check

For agents that support tool use or shell commands, wire SpecGuard into the verification step:

```ts
// In your agent orchestration
const result = await scan({ cwd: projectDir });
if (result.stats.errors > 0) {
  // Feed mismatches back to the agent as context
  const feedback = result.mismatches
    .filter(m => m.severity === 'error')
    .map(m => `${m.callSite.file}:${m.callSite.line} -- ${m.message}`)
    .join('\n');
  // Agent can now fix the issues with precise file:line references
}
```

### Why this matters for agents

Without SpecGuard, an agent producing frontend code has no way to verify it matches the real API contract. Type checking passes (the frontend types are internally consistent), tests pass (they mock the API), and the agent reports success. The mismatch only surfaces at runtime in production. SpecGuard closes that gap at the point where it's cheapest to fix -- during code generation.

## Current Limitations

- No built-in support for ky, got, or other HTTP clients (fetch, axios, and custom wrappers are supported)
- OpenAPI 3.x only (no Swagger 2.0)
- Enum validation detects literal unions but does not enforce exhaustiveness on the frontend side

## License

MIT
