/**
 * FileStorageAdapter — file system implementation of StorageAdapter.
 * Uses fs-extra for all file operations.
 */
import type { ListOptions, StorageAdapter } from './adapter.js';
export declare class FileStorageAdapter implements StorageAdapter {
    read(path: string): Promise<string | null>;
    /**
     * Atomic write: writes to a temp file in the same directory, then renames
     * into place. On POSIX filesystems `rename(2)` is atomic within a filesystem,
     * so a reader either sees the old content or the new content, never a
     * truncated partial write.
     *
     * Same-directory temp is critical — a rename across filesystems would fall
     * back to copy+unlink and lose atomicity.
     */
    write(path: string, content: string): Promise<void>;
    writeIfChanged(path: string, content: string): Promise<'unchanged' | 'updated'>;
    /**
     * Atomically append content to the file. `fs.appendFile` uses the
     * default `'a'` flag → POSIX `O_APPEND`. The kernel guarantees
     * atomicity for writes up to PIPE_BUF (~4KB Linux, ~512B macOS); a
     * single log-event line is always well under that.
     *
     * Creates parent dirs if missing, file if missing. Safe under
     * concurrent appenders — no read-modify-write race.
     */
    append(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    delete(path: string): Promise<void>;
    list(dir: string, options?: ListOptions): Promise<string[]>;
    listSubdirectories(dir: string): Promise<string[]>;
    mkdir(dir: string): Promise<void>;
    getModified(path: string): Promise<Date | null>;
    copy(src: string, dest: string, _options?: {
        recursive?: boolean;
    }): Promise<void>;
}
//# sourceMappingURL=file.d.ts.map