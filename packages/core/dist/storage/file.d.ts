/**
 * FileStorageAdapter — file system implementation of StorageAdapter.
 * Uses fs-extra for all file operations.
 */
import type { ListOptions, StorageAdapter } from './adapter.js';
export declare class FileStorageAdapter implements StorageAdapter {
    read(path: string): Promise<string | null>;
    write(path: string, content: string): Promise<void>;
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