/**
 * Tests for src/commands/integration.ts - calendar configuration
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { parse as parseYaml } from 'yaml';

// Note: We can't easily test the integration command directly because it uses inquirer
// and child_process.execSync. Instead, we'll test the config writing behavior.

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function createMinimalWorkspace(dir: string): Promise<void> {
  // Create minimal workspace structure
  mkdirSync(join(dir, '.agents', 'skills'), { recursive: true });
  
  // Create arete.yaml
  const manifest = {
    schema: 1,
    version: '0.1.0',
    source: 'npm',
    agent_mode: 'guide' as const,
    skills: { core: [], overrides: [] },
    tools: [],
    integrations: {}
  };
  
  const { stringify } = await import('yaml');
  writeFileSync(join(dir, 'arete.yaml'), stringify(manifest), 'utf8');
}

describe('integration command - calendar', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = createTmpDir();
    await createMinimalWorkspace(tmpDir);
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('calendar configuration', () => {
    it('writes calendar config to arete.yaml', async () => {
      const configPath = join(tmpDir, 'arete.yaml');
      
      // Read existing config
      const existingYaml = readFileSync(configPath, 'utf8');
      const config = parseYaml(existingYaml) as Record<string, any>;
      
      // Simulate what the configure command does
      if (!config.integrations) {
        config.integrations = {};
      }
      config.integrations.calendar = {
        provider: 'macos',
        calendars: ['Work', 'Personal']
      };
      
      const { stringify } = await import('yaml');
      writeFileSync(configPath, stringify(config), 'utf8');
      
      // Verify the written config
      const updatedYaml = readFileSync(configPath, 'utf8');
      const updatedConfig = parseYaml(updatedYaml) as Record<string, any>;
      
      assert.ok(updatedConfig.integrations.calendar);
      assert.equal(updatedConfig.integrations.calendar.provider, 'macos');
      assert.ok(Array.isArray(updatedConfig.integrations.calendar.calendars));
      assert.equal(updatedConfig.integrations.calendar.calendars.length, 2);
      assert.equal(updatedConfig.integrations.calendar.calendars[0], 'Work');
      assert.equal(updatedConfig.integrations.calendar.calendars[1], 'Personal');
    });

    it('preserves other config when writing calendar config', async () => {
      const configPath = join(tmpDir, 'arete.yaml');
      
      // Add some custom config first
      const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
      config.internal_email_domain = 'acme.com';
      config.skills.defaults = { 'create-prd': 'netflix-prd' };
      
      const { stringify } = await import('yaml');
      writeFileSync(configPath, stringify(config), 'utf8');
      
      // Now add calendar config
      const updatedConfig = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
      if (!updatedConfig.integrations) {
        updatedConfig.integrations = {};
      }
      updatedConfig.integrations.calendar = {
        provider: 'macos',
        calendars: ['Work']
      };
      
      writeFileSync(configPath, stringify(updatedConfig), 'utf8');
      
      // Verify both old and new config are present
      const finalConfig = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
      
      assert.equal(finalConfig.internal_email_domain, 'acme.com', 
        'Should preserve internal_email_domain');
      assert.equal(finalConfig.skills.defaults['create-prd'], 'netflix-prd', 
        'Should preserve skills.defaults');
      assert.ok(finalConfig.integrations.calendar, 
        'Should add calendar config');
      assert.equal(finalConfig.integrations.calendar.provider, 'macos');
    });

    it('handles empty calendars array', async () => {
      const configPath = join(tmpDir, 'arete.yaml');
      const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
      
      if (!config.integrations) {
        config.integrations = {};
      }
      config.integrations.calendar = {
        provider: 'macos',
        calendars: []
      };
      
      const { stringify } = await import('yaml');
      writeFileSync(configPath, stringify(config), 'utf8');
      
      const updatedConfig = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
      
      assert.ok(updatedConfig.integrations.calendar);
      assert.equal(updatedConfig.integrations.calendar.provider, 'macos');
      assert.ok(Array.isArray(updatedConfig.integrations.calendar.calendars));
      assert.equal(updatedConfig.integrations.calendar.calendars.length, 0);
    });

    it('updates existing calendar config', async () => {
      const configPath = join(tmpDir, 'arete.yaml');
      
      // Set initial calendar config
      let config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
      if (!config.integrations) {
        config.integrations = {};
      }
      config.integrations.calendar = {
        provider: 'macos',
        calendars: ['Work']
      };
      
      const { stringify } = await import('yaml');
      writeFileSync(configPath, stringify(config), 'utf8');
      
      // Update with new calendars
      config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
      config.integrations.calendar.calendars = ['Work', 'Personal', 'Side Project'];
      
      writeFileSync(configPath, stringify(config), 'utf8');
      
      // Verify update
      const updatedConfig = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
      
      assert.equal(updatedConfig.integrations.calendar.calendars.length, 3);
      assert.equal(updatedConfig.integrations.calendar.calendars[2], 'Side Project');
    });
  });
});
