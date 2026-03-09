/**
 * arete view — launch backend server and open workspace in browser
 */
import { spawn, spawnSync, exec } from 'child_process';
import { createServer } from 'net';
import { existsSync } from 'fs';
import { join } from 'path';
import { createServices, getPackageRoot } from '@arete/core';
import { error, info, warn } from '../formatters.js';
// ─── Helpers ─────────────────────────────────────────────────────────────────
export function isPortAvailable(port) {
    return new Promise(resolve => {
        const srv = createServer();
        srv.once('error', () => resolve(false));
        srv.once('listening', () => srv.close(() => resolve(true)));
        srv.listen(port, '127.0.0.1');
    });
}
function emitError(json, msg) {
    if (json) {
        console.log(JSON.stringify({ success: false, error: msg }));
    }
    else {
        error(msg);
    }
}
const defaultOpenBrowser = (url) => new Promise((resolve, reject) => {
    const cmd = process.platform === 'darwin'
        ? `open "${url}"`
        : process.platform === 'win32'
            ? `start "" "${url}"`
            : `xdg-open "${url}"`;
    exec(cmd, err => (err ? reject(err) : resolve()));
});
async function waitForServer(port, fetchFn) {
    for (let i = 0; i < 10; i++) {
        try {
            const res = await fetchFn(`http://localhost:${port}/health`);
            if (res.ok)
                return true;
        }
        catch {
            /* server not ready yet */
        }
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}
/**
 * Build the web app if dist doesn't exist.
 * Returns true if build succeeded or dist already exists, false on failure.
 */
export function ensureWebBuild(packageRoot, json, spawnSyncFn = spawnSync, existsSyncFn = existsSync) {
    const webDir = join(packageRoot, 'packages/apps/web');
    const webDist = join(webDir, 'dist/index.html');
    if (existsSyncFn(webDist)) {
        return true; // Already built
    }
    if (!json) {
        warn('Web UI not built. Building now (this may take a moment)...');
    }
    // Check if node_modules exists, run npm install if not
    const nodeModules = join(webDir, 'node_modules');
    if (!existsSyncFn(nodeModules)) {
        if (!json) {
            info('  Installing dependencies...');
        }
        const installResult = spawnSyncFn('npm', ['install'], {
            cwd: webDir,
            stdio: json ? 'pipe' : 'inherit',
        });
        if (installResult.status !== 0) {
            error('Failed to install web dependencies');
            return false;
        }
    }
    // Run npm run build
    if (!json) {
        info('  Building web app...');
    }
    const buildResult = spawnSyncFn('npm', ['run', 'build'], {
        cwd: webDir,
        stdio: json ? 'pipe' : 'inherit',
    });
    if (buildResult.status !== 0) {
        error('Failed to build web app');
        return false;
    }
    if (!json) {
        info('  Web app built successfully.\n');
    }
    return true;
}
// ─── Core Implementation (injectable for tests) ───────────────────────────────
export async function runView(opts, deps = {}) {
    const { spawnFn = spawn, spawnSyncFn = spawnSync, openBrowserFn = defaultOpenBrowser, fetchFn = fetch, isPortAvailableFn = isPortAvailable, existsSyncFn = existsSync, } = deps;
    // 1. Resolve workspace root
    const services = await createServices(process.cwd());
    const root = await services.workspace.findRoot();
    if (!root) {
        emitError(opts.json, 'Not in an Areté workspace');
        if (!opts.json) {
            info('Navigate to your workspace directory and try again.');
        }
        process.exit(1);
    }
    // 2. Resolve port
    const explicitPort = opts.port ?? process.env['PORT'];
    let port;
    if (explicitPort) {
        const p = parseInt(explicitPort, 10);
        if (isNaN(p) || p < 1 || p > 65535) {
            emitError(opts.json, `Invalid port: ${explicitPort}`);
            process.exit(1);
        }
        const available = await isPortAvailableFn(p);
        if (!available) {
            emitError(opts.json, `Port ${p} is already in use`);
            process.exit(1);
        }
        port = p;
    }
    else {
        const defaults = [3847, 3848, 3849];
        let found = null;
        for (const p of defaults) {
            if (await isPortAvailableFn(p)) {
                found = p;
                break;
            }
        }
        if (found === null) {
            emitError(opts.json, 'All default ports (3847, 3848, 3849) are busy. Use --port to specify one.');
            process.exit(1);
        }
        port = found;
    }
    // 3. Ensure web app is built
    const packageRoot = getPackageRoot();
    const webBuilt = ensureWebBuild(packageRoot, opts.json, spawnSyncFn, existsSyncFn);
    if (!webBuilt) {
        emitError(opts.json, 'Failed to build web app. Run manually: cd packages/apps/web && npm install && npm run build');
        process.exit(1);
    }
    // 4. Spawn backend server
    const backendDist = join(packageRoot, 'packages/apps/backend/dist/index.js');
    const backendSrc = join(packageRoot, 'packages/apps/backend/src/index.ts');
    const useTs = !existsSyncFn(backendDist);
    const [cmd, args] = useTs ? ['tsx', [backendSrc]] : ['node', [backendDist]];
    const child = spawnFn(cmd, args, {
        env: { ...process.env, ARETE_WORKSPACE: root, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr?.pipe(process.stderr);
    // 5. SIGINT handler — clean up child process
    process.on('SIGINT', () => {
        child.kill('SIGTERM');
        process.exit(0);
    });
    // 6. Wait for server to be ready (max 5s)
    const ready = await waitForServer(port, fetchFn);
    if (!ready) {
        child.kill('SIGTERM');
        emitError(opts.json, `Server did not start within 5 seconds on port ${port}`);
        process.exit(1);
    }
    // 7. Open browser
    const url = `http://localhost:${port}`;
    try {
        await openBrowserFn(url);
    }
    catch {
        // Non-fatal — user can open manually
    }
    // 8. Print ready message
    info(`\nAreté workspace open at ${url}`);
    info('Press Ctrl+C to stop.\n');
    // Keep the process alive
    setInterval(() => { }, 1000 * 60 * 60);
}
// ─── Command Registration ─────────────────────────────────────────────────────
export function registerViewCommand(program, deps = {}) {
    program
        .command('view')
        .description('Open the Areté workspace in the browser (meeting triage UI)')
        .option('--port <port>', 'Port to run the server on')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        await runView(opts, deps);
    });
}
//# sourceMappingURL=view.js.map