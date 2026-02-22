import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { parseProfileFrontmatter } from '../../src/commands/onboard.js';

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
      'onboard --json --name "Jane Doe" --email "jane@acme.com" --company "Acme Corp"',
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
      'onboard --json --name "Bob" --email "bob@example.com" --company "Example" --website "https://example.io"',
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
      'onboard --json --name "Test" --email "test@foo.org" --company "Foo" --website "www.foo.org/about"',
      tempDir
    );

    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    // Should extract foo.org, not www.foo.org
    assert.ok(output.profile.domains.includes('foo.org'));
  });

  it('reruns with existing profile — updates values', async () => {
    await createMinimalWorkspace(tempDir);

    // First run
    runCli(
      'onboard --json --name "Jane Doe" --email "jane@acme.com" --company "Acme Corp"',
      tempDir
    );

    // Rerun with updated values
    const result = runCli(
      'onboard --json --name "Jane Smith" --email "jane@newco.com" --company "NewCo"',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    assert.equal(output.profile.name, 'Jane Smith');
    assert.equal(output.profile.email, 'jane@newco.com');
    assert.equal(output.profile.company, 'NewCo');

    // Verify profile file was updated
    const profileContent = await readFile(join(tempDir, 'context', 'profile.md'), 'utf8');
    assert.ok(profileContent.includes('Jane Smith'));
    assert.ok(profileContent.includes('jane@newco.com'));
    assert.ok(profileContent.includes('NewCo'));
    assert.ok(!profileContent.includes('Acme Corp'));
  });

  it('reruns with existing profile — preserves created timestamp', async () => {
    await createMinimalWorkspace(tempDir);

    // First run
    runCli(
      'onboard --json --name "Jane" --email "jane@acme.com" --company "Acme"',
      tempDir
    );

    // Read the created timestamp from first run
    const firstProfile = await readFile(join(tempDir, 'context', 'profile.md'), 'utf8');
    const createdMatch = firstProfile.match(/created: (.+)/);
    assert.ok(createdMatch, 'First profile should have created timestamp');
    const originalCreated = createdMatch[1];

    // Small delay to ensure different timestamp if regenerated
    await new Promise(resolve => setTimeout(resolve, 50));

    // Rerun with CLI flags (uses existing profile's created)
    runCli(
      'onboard --json --name "Jane Updated" --email "jane@acme.com" --company "Acme"',
      tempDir
    );

    const secondProfile = await readFile(join(tempDir, 'context', 'profile.md'), 'utf8');
    const secondMatch = secondProfile.match(/created: (.+)/);
    assert.ok(secondMatch, 'Second profile should have created timestamp');
    assert.equal(secondMatch[1], originalCreated, 'created timestamp should be preserved on rerun');
  });

  it('JSON mode with existing profile does not bail early', async () => {
    await createMinimalWorkspace(tempDir);

    // Create a profile with real values (not template placeholders)
    const existingProfile = `---
name: Existing User
email: user@example.com
company: Example Inc
# website: (not provided)
created: 2026-01-01T00:00:00.000Z
---

# Profile
`;
    await writeFile(join(tempDir, 'context', 'profile.md'), existingProfile);

    // JSON mode with flags should succeed (not bail early)
    const result = runCli(
      'onboard --json --name "Updated User" --email "updated@example.com" --company "New Inc"',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    assert.equal(output.profile.name, 'Updated User');
  });

  it('handles corrupted profile gracefully via CLI flags', async () => {
    await createMinimalWorkspace(tempDir);

    // Write a corrupted profile
    await writeFile(join(tempDir, 'context', 'profile.md'), 'not yaml at all {{{');

    // CLI flags should still work — corrupted profile treated as first run
    const result = runCli(
      'onboard --json --name "New User" --email "new@test.com" --company "TestCo"',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    assert.equal(output.profile.name, 'New User');
  });

  it('profile without website preserves comment format', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --name "Test" --email "test@co.com" --company "Co"',
      tempDir
    );

    assert.equal(result.status, 0);
    const profileContent = await readFile(join(tempDir, 'context', 'profile.md'), 'utf8');
    assert.ok(profileContent.includes('# website: (not provided)'));
  });
});

describe('parseProfileFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const content = `---
name: Jane Doe
email: jane@acme.com
company: Acme Corp
website: https://acme.com
created: 2026-01-01T00:00:00.000Z
---

# Profile
`;
    const result = parseProfileFrontmatter(content);
    assert.equal(result.name, 'Jane Doe');
    assert.equal(result.email, 'jane@acme.com');
    assert.equal(result.company, 'Acme Corp');
    assert.equal(result.website, 'https://acme.com');
    assert.equal(result.created, '2026-01-01T00:00:00.000Z');
  });

  it('returns empty object for no frontmatter', () => {
    const result = parseProfileFrontmatter('Just some content');
    assert.deepEqual(result, {});
  });

  it('returns empty object for malformed YAML', () => {
    const content = `---
{ bad yaml: [
---
`;
    const result = parseProfileFrontmatter(content);
    assert.deepEqual(result, {});
  });

  it('handles partial profile (some fields missing)', () => {
    const content = `---
name: Jane
email: jane@acme.com
---

# Profile
`;
    const result = parseProfileFrontmatter(content);
    assert.equal(result.name, 'Jane');
    assert.equal(result.email, 'jane@acme.com');
    assert.equal(result.company, undefined);
    assert.equal(result.website, undefined);
    assert.equal(result.created, undefined);
  });

  it('treats commented website as undefined', () => {
    const content = `---
name: Jane
email: jane@acme.com
company: Acme
# website: (not provided)
created: 2026-01-01T00:00:00.000Z
---
`;
    const result = parseProfileFrontmatter(content);
    assert.equal(result.website, undefined);
  });

  it('handles non-string field values gracefully', () => {
    const content = `---
name: 123
email: true
company: null
---
`;
    const result = parseProfileFrontmatter(content);
    // Non-string values should be undefined
    assert.equal(result.name, undefined);
    assert.equal(result.email, undefined);
    assert.equal(result.company, undefined);
  });
});

describe('onboard integration phase', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'arete-onboard-integ-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('--skip-integrations skips integration phase', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --name "Jane" --email "jane@acme.com" --company "Acme" --skip-integrations',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    assert.ok(output.integrations, 'Should include integrations in output');
    assert.equal(output.integrations.calendar.configured, false);
    assert.equal(output.integrations.calendar.skipped, true);
    assert.equal(output.integrations.fathom.configured, false);
    assert.equal(output.integrations.fathom.skipped, true);
    assert.equal(output.integrations.krisp.configured, false);
    assert.equal(output.integrations.krisp.skipped, true);
  });

  it('--fathom-key writes key to credentials.yaml and marks active', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --name "Jane" --email "jane@acme.com" --company "Acme" --skip-integrations --fathom-key "test-api-key-123"',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true);
    assert.equal(output.integrations.fathom.configured, true);

    // Verify credentials file
    const credContent = await readFile(join(tempDir, '.credentials', 'credentials.yaml'), 'utf8');
    const creds = parseYaml(credContent) as Record<string, Record<string, string>>;
    assert.equal(creds.fathom.api_key, 'test-api-key-123');

    // Verify integration marked active in arete.yaml
    const areteContent = await readFile(join(tempDir, 'arete.yaml'), 'utf8');
    const areteConfig = parseYaml(areteContent) as Record<string, Record<string, Record<string, string>>>;
    assert.equal(areteConfig.integrations?.fathom?.status, 'active');
  });

  it('--fathom-key preserves existing credentials (read-modify-write)', async () => {
    await createMinimalWorkspace(tempDir);

    // Pre-existing krisp credentials
    await mkdir(join(tempDir, '.credentials'), { recursive: true });
    await writeFile(
      join(tempDir, '.credentials', 'credentials.yaml'),
      'krisp:\n  client_id: existing-id\n  client_secret: existing-secret\n'
    );

    const result = runCli(
      'onboard --json --name "Jane" --email "jane@acme.com" --company "Acme" --skip-integrations --fathom-key "my-fathom-key"',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);

    const credContent = await readFile(join(tempDir, '.credentials', 'credentials.yaml'), 'utf8');
    const creds = parseYaml(credContent) as Record<string, Record<string, string>>;
    // Fathom key was added
    assert.equal(creds.fathom.api_key, 'my-fathom-key');
    // Krisp credentials preserved
    assert.equal(creds.krisp.client_id, 'existing-id');
    assert.equal(creds.krisp.client_secret, 'existing-secret');
  });

  it('--calendar configures calendar integration without prompt', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --name "Jane" --email "jane@acme.com" --company "Acme" --skip-integrations --calendar --calendars "Work,Personal"',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.integrations.calendar.configured, true);
    assert.deepEqual(output.integrations.calendar.calendars, ['Work', 'Personal']);

    // Verify arete.yaml
    const areteContent = await readFile(join(tempDir, 'arete.yaml'), 'utf8');
    const areteConfig = parseYaml(areteContent) as Record<string, Record<string, unknown>>;
    assert.equal(areteConfig.integrations?.calendar?.provider, 'macos');
    assert.equal(areteConfig.integrations?.calendar?.status, 'active');
    assert.deepEqual(areteConfig.integrations?.calendar?.calendars, ['Work', 'Personal']);
  });

  it('--calendar without --calendars configures with empty array (all)', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --name "Jane" --email "jane@acme.com" --company "Acme" --skip-integrations --calendar',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.integrations.calendar.configured, true);
    assert.deepEqual(output.integrations.calendar.calendars, []);
  });

  it('--json mode includes integrations in output', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --name "Jane" --email "jane@acme.com" --company "Acme" --skip-integrations',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.ok(output.integrations, 'JSON output must include integrations');
    assert.ok('calendar' in output.integrations);
    assert.ok('fathom' in output.integrations);
    assert.ok('krisp' in output.integrations);
  });

  it('combines --fathom-key and --calendar flags', async () => {
    await createMinimalWorkspace(tempDir);

    const result = runCli(
      'onboard --json --name "Jane" --email "jane@acme.com" --company "Acme" --skip-integrations --fathom-key "key123" --calendar --calendars "Home"',
      tempDir
    );

    assert.equal(result.status, 0, `Failed with: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.integrations.fathom.configured, true);
    assert.equal(output.integrations.calendar.configured, true);
    assert.deepEqual(output.integrations.calendar.calendars, ['Home']);
    // Krisp still skipped (no flag for non-interactive krisp)
    assert.equal(output.integrations.krisp.configured, false);
  });
});
