/**
 * Central integration registry.
 *
 * All integration definitions live here. Commands query this registry
 * instead of maintaining their own local copies.
 *
 * To add a new integration:
 * 1. Create src/integrations/<name>/config.ts and index.ts
 * 2. Add it to INTEGRATIONS below with its capabilities
 * 3. If it supports pull/seed, add entries to PULLABLE / SEEDABLE
 */

import type { IntegrationDefinition, ScriptableIntegration } from '../types.js';

/**
 * All known integrations and their metadata.
 * Used by `arete integration list/add/configure/remove`.
 */
export const INTEGRATIONS: Record<string, IntegrationDefinition> = {
  fathom: {
    name: 'fathom',
    displayName: 'Fathom',
    description: 'Meeting recording and transcription',
    implements: ['meeting-recordings'],
    auth: {
      type: 'api_key',
      envVar: 'FATHOM_API_KEY',
      configKey: 'api_key',
      instructions: 'Get your API key from https://fathom.video/settings/api'
    },
    status: 'available'
  },
  granola: {
    name: 'granola',
    displayName: 'Granola',
    description: 'AI meeting notes',
    implements: ['meeting-recordings'],
    auth: {
      type: 'api_key',
      envVar: 'GRANOLA_API_KEY'
    },
    status: 'planned'
  },
  'google-calendar': {
    name: 'google-calendar',
    displayName: 'Google Calendar',
    description: 'Calendar integration',
    implements: ['calendar'],
    auth: {
      type: 'oauth'
    },
    status: 'planned'
  },
  calendar: {
    name: 'calendar',
    displayName: 'macOS Calendar',
    description: 'macOS Calendar integration via ical-buddy',
    implements: ['calendar'],
    auth: {
      type: 'api_key', // Not really, but needed for type
      instructions: 'Requires ical-buddy: brew install ical-buddy'
    },
    status: 'available'
  },
  notion: {
    name: 'notion',
    displayName: 'Notion',
    description: 'Notes and documentation',
    implements: ['notes'],
    auth: {
      type: 'api_key',
      envVar: 'NOTION_API_KEY'
    },
    status: 'planned'
  }
};

/**
 * Integrations that support the `pull` command.
 */
export const PULLABLE_INTEGRATIONS: Record<string, ScriptableIntegration> = {
  fathom: {
    name: 'fathom',
    displayName: 'Fathom',
    description: 'Fetch recent meeting recordings',
    defaultDays: 7,
    script: 'fathom', // native Node (src/integrations/fathom/)
    command: 'fetch'
  }
};

/**
 * Integrations that support the `seed` command.
 */
export const SEEDABLE_INTEGRATIONS: Record<string, ScriptableIntegration> = {
  fathom: {
    name: 'fathom',
    displayName: 'Fathom',
    description: 'Import meeting recordings and transcripts',
    defaultDays: 60,
    maxDays: 365,
    script: 'fathom', // native Node (src/integrations/fathom/)
    command: 'fetch'
  }
};

/**
 * Look up an integration by name. Returns undefined if not found.
 */
export function getIntegration(name: string): IntegrationDefinition | undefined {
  return INTEGRATIONS[name];
}

/**
 * Get all integrations matching a capability (e.g. 'meeting-recordings').
 */
export function getIntegrationsByCapability(capability: string): IntegrationDefinition[] {
  return Object.values(INTEGRATIONS).filter(int =>
    int.implements.includes(capability)
  );
}

/**
 * Get all available (non-planned) integrations.
 */
export function getAvailableIntegrations(): IntegrationDefinition[] {
  return Object.values(INTEGRATIONS).filter(int => int.status === 'available');
}
