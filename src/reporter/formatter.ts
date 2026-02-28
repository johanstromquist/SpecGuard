import chalk from 'chalk';
import type { ScanResult, Mismatch, Severity } from '../core/types.js';

const severityColors: Record<Severity, (s: string) => string> = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.blue,
  off: (s) => s,
};

const severityLabels: Record<Severity, string> = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  off: '',
};

export function formatTerminal(result: ScanResult): string {
  if (result.mismatches.length === 0) {
    return chalk.green('No mismatches found.');
  }

  const lines: string[] = [];

  // Group by file
  const byFile = new Map<string, Mismatch[]>();
  for (const m of result.mismatches) {
    const file = m.callSite.file;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(m);
  }

  for (const [file, mismatches] of byFile) {
    lines.push('');
    lines.push(chalk.underline(file));

    for (const m of mismatches) {
      const color = severityColors[m.severity];
      const label = severityLabels[m.severity];
      const location = chalk.gray(`:${m.callSite.line}`);
      lines.push(
        `  ${location}  ${color(label.padEnd(5))}  ${chalk.dim(m.kind)}  ${m.message}`,
      );
    }
  }

  lines.push('');
  lines.push(
    `${chalk.red(`${result.stats.errors} error${result.stats.errors !== 1 ? 's' : ''}`)}  ` +
    `${chalk.yellow(`${result.stats.warnings} warning${result.stats.warnings !== 1 ? 's' : ''}`)}  ` +
    `${chalk.blue(`${result.stats.infos} info`)}`,
  );
  lines.push(
    chalk.dim(
      `${result.stats.filesScanned} files scanned, ${result.stats.callSitesFound} call sites, ${result.stats.endpointsMatched} matched`,
    ),
  );

  return lines.join('\n');
}

export function formatJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
