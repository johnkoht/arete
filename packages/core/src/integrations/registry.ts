/**
 * Integration registry — definitions for list/configure.
 */

import type { IntegrationDefinition } from '../models/index.js';

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
      instructions: 'Get your API key from https://fathom.video/settings/api',
    },
    status: 'available',
  },
  'apple-calendar': {
    name: 'apple-calendar',
    displayName: 'Apple Calendar',
    description: 'macOS Calendar integration via ical-buddy',
    implements: ['calendar'],
    auth: { type: 'none' },
    status: 'available',
  },
};
