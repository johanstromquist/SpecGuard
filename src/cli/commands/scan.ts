import type { Severity } from '../../core/types.js';
import { scan } from '../../core/pipeline.js';
import { formatTerminal, formatJson } from '../../reporter/formatter.js';

interface ScanArgs {
  spec?: string;
  include?: string;
  output?: 'terminal' | 'json';
  'fail-on'?: 'error' | 'warn' | 'info';
  verbose?: boolean;
}

const severityLevel: Record<Severity, number> = {
  error: 3,
  warn: 2,
  info: 1,
  off: 0,
};

export async function scanCommand(args: ScanArgs): Promise<void> {
  const overrides: Record<string, unknown> = {};

  if (args.spec) {
    overrides.specs = [{ path: args.spec }];
  }
  if (args.include) {
    overrides.include = [args.include];
  }
  if (args.output) {
    overrides.output = args.output;
  }

  try {
    const result = await scan({ configOverrides: overrides });

    const output =
      args.output === 'json' ? formatJson(result) : formatTerminal(result);

    console.log(output);

    // Set exit code based on --fail-on
    if (args['fail-on']) {
      const threshold = severityLevel[args['fail-on']];
      const hasIssues = result.mismatches.some(
        (m) => severityLevel[m.severity] >= threshold,
      );
      if (hasIssues) {
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(
      'Error:',
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  }
}
