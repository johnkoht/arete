/**
 * CLI formatters — chalk-based output for tables, markdown, and colored text.
 * No business logic — pure formatting.
 */

import chalk from 'chalk';

export function success(msg: string): void {
  console.log(chalk.green('✓'), msg);
}

export function error(msg: string): void {
  console.error(chalk.red('✗'), msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('⚠'), msg);
}

export function info(msg: string): void {
  console.log(chalk.blue('ℹ'), msg);
}

export function header(title: string): void {
  console.log('');
  console.log(chalk.bold(title));
  console.log(chalk.dim('─'.repeat(Math.min(title.length, 60))));
  console.log('');
}

export function section(title: string): void {
  console.log(chalk.bold(`  ${title}`));
  console.log(chalk.dim('  ' + '─'.repeat(40)));
}

export function listItem(label: string, value?: string, indent = 0): void {
  const pad = '  '.repeat(indent);
  if (value !== undefined) {
    console.log(`${pad}  ${chalk.dim(label + ':')} ${value}`);
  } else {
    console.log(`${pad}  ${chalk.dim('•')} ${label}`);
  }
}

export function formatPath(p: string): string {
  const home = process.env.HOME || '~';
  if (p.startsWith(home)) {
    return '~' + p.slice(home.length);
  }
  return p;
}

/**
 * Format a date with timezone for display.
 * Output: "Mon, Feb 25, 2:30 PM CT"
 */
export function formatSlotTime(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return formatter.format(date);
}
