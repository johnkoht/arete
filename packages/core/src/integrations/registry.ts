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
  krisp: {
    name: 'krisp',
    displayName: 'Krisp',
    description: 'Meeting recording with AI summaries, transcripts, and action items',
    implements: ['meeting-recordings'],
    auth: { type: 'oauth' },
    status: 'available',
  },
  notion: {
    name: 'notion',
    displayName: 'Notion',
    description: 'Documentation and workspace pages',
    implements: ['documentation'],
    auth: {
      type: 'api_key',
      envVar: 'NOTION_API_KEY',
      configKey: 'api_key',
      instructions: 'Create an internal integration at notion.so/profile/integrations',
    },
    status: 'available',
  },
};
