import { cosmiconfig } from 'cosmiconfig';
import { TypeScriptLoader } from 'cosmiconfig-typescript-loader';
import { z } from 'zod';
import type { MismatchKind, Severity } from './types.js';

const wrapperSchema = z.object({
  name: z.string(),
  urlArg: z.number().default(0),
  methodFrom: z.string().optional(),
  defaultMethod: z.string().default('GET'),
});

const rulesSchema = z.record(
  z.enum([
    'missing-in-spec',
    'missing-in-frontend',
    'type-mismatch',
    'extra-in-spec',
    'required-mismatch',
    'method-mismatch',
    'deprecated',
    'unmatched-endpoint',
  ]),
  z.enum(['error', 'warn', 'info', 'off']),
);

const configSchema = z.object({
  specs: z
    .array(z.object({ path: z.string() }))
    .min(1, 'At least one spec is required'),
  include: z.array(z.string()).default(['src/**/*.ts', 'src/**/*.tsx']),
  exclude: z.array(z.string()).default(['**/*.test.*', '**/*.d.ts']),
  baseUrl: z.string().default(''),
  wrappers: z.array(wrapperSchema).default([]),
  typeMappings: z.record(z.string(), z.string()).default({}),
  rules: rulesSchema.default({}),
  cache: z
    .object({ enabled: z.boolean().default(true) })
    .default({ enabled: true }),
  output: z.enum(['terminal', 'json']).default('terminal'),
  tsconfig: z.string().default('./tsconfig.json'),
});

export type SpecGuardConfig = z.infer<typeof configSchema>;
export type WrapperConfig = z.infer<typeof wrapperSchema>;

export const DEFAULT_RULES: Record<MismatchKind, Severity> = {
  'missing-in-spec': 'error',
  'missing-in-frontend': 'warn',
  'type-mismatch': 'error',
  'extra-in-spec': 'off',
  'required-mismatch': 'warn',
  'method-mismatch': 'error',
  'deprecated': 'warn',
  'unmatched-endpoint': 'warn',
};

export function defineConfig(config: z.input<typeof configSchema>): z.input<typeof configSchema> {
  return config;
}

export async function loadConfig(
  overrides?: Partial<z.input<typeof configSchema>>,
): Promise<SpecGuardConfig> {
  const explorer = cosmiconfig('specguard', {
    loaders: {
      '.ts': TypeScriptLoader(),
    },
  });

  const result = await explorer.search();
  const raw = result?.config ?? {};
  const merged = { ...raw, ...overrides };
  const parsed = configSchema.parse(merged);

  return parsed as SpecGuardConfig;
}

export function resolveRules(
  userRules: Partial<Record<MismatchKind, Severity>>,
): Record<MismatchKind, Severity> {
  return { ...DEFAULT_RULES, ...userRules };
}
