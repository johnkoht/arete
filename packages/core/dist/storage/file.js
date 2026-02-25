/**
 * FileStorageAdapter — file system implementation of StorageAdapter.
 * Uses fs-extra for all file operations.
 */
import fs from 'fs-extra';
import { join } from 'path';
export class FileStorageAdapter {
    async read(path) {
        try {
            const content = await fs.readFile(path, 'utf8');
            return content;
        }
        catch {
            return null;
        }
    }
    async write(path, content) {
        const dir = join(path, '..');
        await fs.ensureDir(dir);
        await fs.writeFile(path, content, 'utf8');
    }
    async exists(path) {
        return fs.pathExists(path);
    }
    async delete(path) {
        await fs.remove(path);
    }
    async list(dir, options) {
        const recursive = options?.recursive ?? false;
        const extensions = options?.extensions;
        try {
            const stat = await fs.stat(dir);
            if (stat.isFile()) {
                if (extensions?.length) {
                    const ext = extensions.some(e => dir.toLowerCase().endsWith(e.toLowerCase())) ? dir : null;
                    return ext ? [dir] : [];
                }
                return [dir];
            }
        }
        catch {
            return [];
        }
        const results = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = join(dir, e.name);
            if (e.isDirectory()) {
                if (recursive && !e.name.startsWith('.') && !e.name.startsWith('_')) {
                    results.push(...(await this.list(full, options)));
                }
            }
            else if (e.isFile()) {
                const matchExt = !extensions?.length || extensions.some(ext => full.toLowerCase().endsWith(ext.toLowerCase()));
                if (matchExt) {
                    results.push(full);
                }
            }
        }
        return results;
    }
    async listSubdirectories(dir) {
        try {
            const stat = await fs.stat(dir);
            if (!stat.isDirectory())
                return [];
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const subdirs = [];
            for (const e of entries) {
                if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')) {
                    subdirs.push(join(dir, e.name));
                }
            }
            return subdirs;
        }
        catch {
            return [];
        }
    }
    async mkdir(dir) {
        await fs.ensureDir(dir);
    }
    async getModified(path) {
        try {
            const stat = await fs.stat(path);
            return stat.mtime;
        }
        catch {
            return null;
        }
    }
    async copy(src, dest, _options) {
        await fs.copy(src, dest, { overwrite: false });
    }
}
//# sourceMappingURL=file.js.map