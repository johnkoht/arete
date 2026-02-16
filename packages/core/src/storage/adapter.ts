/**
 * Storage adapter interface for file system operations.
 *
 * Allows services to abstract over the file system for testability
 * and alternative backends (e.g., virtual file system).
 */

export interface ListOptions {
  recursive?: boolean;
  extensions?: string[];
}

export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(dir: string, options?: ListOptions): Promise<string[]>;
  /** List immediate subdirectories (full paths), excluding names starting with . or _ */
  listSubdirectories(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
  getModified(path: string): Promise<Date | null>;
  /** Copy file or directory from src to dest. Optional - FileStorageAdapter implements it. */
  copy?(src: string, dest: string, options?: { recursive?: boolean }): Promise<void>;
}
