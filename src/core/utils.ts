/**
 * Shared utilities
 */

import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface OutputOptions {
  json?: boolean;
}

/**
 * Output helper - handles both human and JSON output
 */
export function output(data: unknown, options: OutputOptions = {}): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    // Pretty print for humans
    console.log(data);
  }
}

/**
 * Print a success message
 */
export function success(message: string): void {
  console.log(chalk.green('✓') + ' ' + message);
}

/**
 * Print an error message
 */
export function error(message: string): void {
  console.log(chalk.red('✗') + ' ' + message);
}

/**
 * Print a warning message
 */
export function warn(message: string): void {
  console.log(chalk.yellow('⚠') + ' ' + message);
}

/**
 * Print an info message
 */
export function info(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

/**
 * Print a header
 */
export function header(title: string): void {
  console.log('');
  console.log(chalk.bold(title));
  console.log('');
}

/**
 * Print a section
 */
export function section(title: string): void {
  console.log('');
  console.log(chalk.dim('─'.repeat(40)));
  console.log(chalk.bold(title));
  console.log(chalk.dim('─'.repeat(40)));
}

/**
 * Print a list item
 */
export function listItem(label: string, value?: string, indent: number = 0): void {
  const padding = '  '.repeat(indent);
  if (value !== undefined) {
    console.log(`${padding}${chalk.dim('•')} ${label}: ${chalk.cyan(value)}`);
  } else {
    console.log(`${padding}${chalk.dim('•')} ${label}`);
  }
}

/**
 * Format a path for display (relative to cwd if possible)
 */
export function formatPath(fullPath: string): string {
  const cwd = process.cwd();
  if (fullPath.startsWith(cwd)) {
    return '.' + fullPath.slice(cwd.length);
  }
  return fullPath;
}

/**
 * Get the build version from package.json
 */
export function getBuildVersion(): string {
  const packageJsonPath = join(__dirname, '../../package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

export default {
  output,
  success,
  error,
  warn,
  info,
  header,
  section,
  listItem,
  formatPath,
  getBuildVersion
};
