#!/usr/bin/env node
import yargs, { type Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { scanCommand } from './commands/scan.js';
import { initCommand } from './commands/init.js';

yargs(hideBin(process.argv))
  .command(
    'scan',
    'Scan frontend code against API spec',
    (y: Argv) =>
      y
        .option('spec', { type: 'string', describe: 'Override spec path' })
        .option('include', { type: 'string', describe: 'Override include glob' })
        .option('output', {
          choices: ['terminal', 'json'] as const,
          describe: 'Output format',
        })
        .option('fail-on', {
          choices: ['error', 'warn', 'info'] as const,
          describe: 'Exit code 1 if issues at this severity',
        })
        .option('verbose', { type: 'boolean', describe: 'Show analysis steps' }),
    scanCommand,
  )
  .command(
    'init',
    'Generate a starter config file',
    (y: Argv) => y,
    initCommand,
  )
  .demandCommand(1, 'Please specify a command')
  .strict()
  .help()
  .parse();
