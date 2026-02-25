/**
 * CLI formatters — chalk-based output for tables, markdown, and colored text.
 * No business logic — pure formatting.
 */
export declare function success(msg: string): void;
export declare function error(msg: string): void;
export declare function warn(msg: string): void;
export declare function info(msg: string): void;
export declare function header(title: string): void;
export declare function section(title: string): void;
export declare function listItem(label: string, value?: string, indent?: number): void;
export declare function formatPath(p: string): string;
/**
 * Format a date with timezone for display.
 * Output: "Mon, Feb 25, 2:30 PM CT"
 */
export declare function formatSlotTime(date: Date): string;
//# sourceMappingURL=formatters.d.ts.map