import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const CLI_PATH = join(import.meta.dirname, '../../src/index.ts');

function runCli(args: string, cwd: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`npx tsx ${CLI_PATH} ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      status: error.status ?? 1,
    };
  }
}

async function createMinimalWorkspace(dir: string): Promise<void> {
  await mkdir(join(dir, 'context'), { recursive: true });
  await mkdir(join(dir, '.arete', 'memory'), { recursive: true });
  await mkdir(join(dir, '.cursor'), { recursive: true });
  const manifest = `schema: "1.0"\nide_target: cursor\n`;
  const fs = await import('node:fs/promises');
  await fs.writeFile(join(dir, 'arete.yaml'), manifest);
}

describe('onboard command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'arete-onboard-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('fails outside workspace', async () => {
    const result = runCli('onboard --json', tempDir);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout || result.stderr);
    assert.equal(output.success, false);
    assert.ok(output.error.includes('workspace'));
  });

  it('creates profile with CLI options', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --skip-qmd --name "Jane Doe" --email "jane@acme.com" --company "Acme Corp"',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    assert.equal(output.profile.name, 'Jane Doe');
    assert.equal(output.profile.email, 'jane@acme.com');
    assert.equal(output.profile.company, 'Acme Corp');
    assert.ok(output.profile.domains.includes('acme.com'));

    // Verify profile file was created
    const profileContent = await readFile(join(tempDir, 'context', 'profile.md'), 'utf8');
    assert.ok(profileContent.includes('Jane Doe'));
    assert.ok(profileContent.includes('jane@acme.com'));
    assert.ok(profileContent.includes('Acme Corp'));
  });

  it('creates domain hints from email and website', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --skip-qmd --name "Bob" --email "bob@example.com" --company "Example" --website "https://example.io"',
      tempDir
    );

    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.ok(output.profile.domains.includes('example.com'));
    assert.ok(output.profile.domains.includes('example.io'));

    // Verify domain hints file
    const hintsContent = await readFile(join(tempDir, 'context', 'domain-hints.md'), 'utf8');
    assert.ok(hintsContent.includes('example.com'));
    assert.ok(hintsContent.includes('example.io'));
  });

  it('requires all fields in JSON mode', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli('onboard --json --name "Only Name"', tempDir);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout || result.stderr);
    assert.equal(output.success, false);
    assert.ok(output.error.includes('requires'));
  });

  it('extracts domain from website URL correctly', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --skip-qmd --name "Test" --email "test@foo.org" --company "Foo" --website "www.foo.org/about"',
      tempDir
    );

    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    // Should extract foo.org, not www.foo.org
    assert.ok(output.profile.domains.includes('foo.org'));
  });

  it('JSON output includes ai field with skipped status when no key provided', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --skip-qmd --name "Test" --email "test@foo.org" --company "Foo"',
      tempDir
    );

    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    // AI is skipped because JSON mode can't prompt and no --api-key provided
    assert.ok('ai' in output, 'output should have ai field');
    assert.equal(output.ai.skipped, true);
    assert.equal(output.ai.configured, false);
  });

  it('--skip-ai flag skips AI configuration', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --skip-qmd --skip-ai --name "Test" --email "test@foo.org" --company "Foo"',
      tempDir
    );

    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    assert.ok('ai' in output);
    assert.equal(output.ai.skipped, true);
    assert.equal(output.ai.configured, false);
  });

  it('skips profile setup but includes ai field when profile exists', async () => {
    await createMinimalWorkspace(tempDir);
    
    // First run to create profile
    const first = runCli(
      'onboard --json --skip-qmd --name "Existing" --email "existing@test.com" --company "Test Co"',
      tempDir
    );
    assert.equal(first.status, 0);

    // Second run should skip profile but still have ai field
    const result = runCli(
      'onboard --json --skip-qmd --skip-ai',
      tempDir
    );

    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    // Profile should be marked as skipped
    assert.ok('profile' in output);
    assert.equal(output.profile.skipped, true);
    // AI config should be present
    assert.ok('ai' in output);
    assert.equal(output.ai.skipped, true);
  });
});
