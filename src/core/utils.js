/**
 * Shared utilities
 */

import chalk from 'chalk';

/**
 * Output helper - handles both human and JSON output
 */
export function output(data, options = {}) {
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
export function success(message) {
  console.log(chalk.green('✓') + ' ' + message);
}

/**
 * Print an error message
 */
export function error(message) {
  console.log(chalk.red('✗') + ' ' + message);
}

/**
 * Print a warning message
 */
export function warn(message) {
  console.log(chalk.yellow('⚠') + ' ' + message);
}

/**
 * Print an info message
 */
export function info(message) {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

/**
 * Print a header
 */
export function header(title) {
  console.log('');
  console.log(chalk.bold(title));
  console.log('');
}

/**
 * Print a section
 */
export function section(title) {
  console.log('');
  console.log(chalk.dim('─'.repeat(40)));
  console.log(chalk.bold(title));
  console.log(chalk.dim('─'.repeat(40)));
}

/**
 * Print a list item
 */
export function listItem(label, value, indent = 0) {
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
export function formatPath(fullPath) {
  const cwd = process.cwd();
  if (fullPath.startsWith(cwd)) {
    return '.' + fullPath.slice(cwd.length);
  }
  return fullPath;
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
  formatPath
};
