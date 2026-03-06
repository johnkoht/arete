/**
 * arete view — launch backend server and open workspace in browser
 */
import { spawn, exec } from 'child_process';
import { createServer } from 'net';
import { existsSync } from 'fs';
import { join } from 'path';
import { createServices, getPackageRoot } from '@arete/core';
import { error, info } from '../formatters.js';
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
// ─── Core Implementation (injectable for tests) ───────────────────────────────
export async function runView(opts, deps = {}) {
    const { spawnFn = spawn, openBrowserFn = defaultOpenBrowser, fetchFn = fetch, isPortAvailableFn = isPortAvailable, } = deps;
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
    // 3. Spawn backend server
    const packageRoot = getPackageRoot();
    const backendDist = join(packageRoot, 'packages/apps/backend/dist/index.js');
    const backendSrc = join(packageRoot, 'packages/apps/backend/src/index.ts');
    const useTs = !existsSync(backendDist);
    const [cmd, args] = useTs ? ['tsx', [backendSrc]] : ['node', [backendDist]];
    const child = spawnFn(cmd, args, {
        env: { ...process.env, ARETE_WORKSPACE: root, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr?.pipe(process.stderr);
    // 4. SIGINT handler — clean up child process
    process.on('SIGINT', () => {
        child.kill('SIGTERM');
        process.exit(0);
    });
    // 5. Wait for server to be ready (max 5s)
    const ready = await waitForServer(port, fetchFn);
    if (!ready) {
        child.kill('SIGTERM');
        emitError(opts.json, `Server did not start within 5 seconds on port ${port}`);
        process.exit(1);
    }
    // 6. Open browser
    const url = `http://localhost:${port}`;
    try {
        await openBrowserFn(url);
    }
    catch {
        // Non-fatal — user can open manually
    }
    // 7. Print ready message
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