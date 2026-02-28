import fs from 'node:fs';
import path from 'node:path';

const STARTER_CONFIG = `import { defineConfig } from 'specguard';

export default defineConfig({
  specs: [{ path: './openapi.json' }],
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['**/*.test.*', '**/*.d.ts'],
  baseUrl: '/api',
  rules: {
    'missing-in-spec': 'error',
    'type-mismatch': 'error',
    'missing-in-frontend': 'warn',
    'deprecated': 'warn',
    'extra-in-spec': 'off',
  },
  tsconfig: './tsconfig.json',
});
`;

export function initCommand(): void {
  const configPath = path.resolve(process.cwd(), 'specguard.config.ts');

  try {
    fs.writeFileSync(configPath, STARTER_CONFIG, { encoding: 'utf-8', flag: 'wx' });
    console.log(`Created ${configPath}`);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
      console.log(`Config file already exists: ${configPath}`);
      return;
    }
    throw err;
  }
}
