/**
 * IntegrationService — manages integration pull and configuration.
 */

import type { StorageAdapter } from '../storage/adapter.js';
import type {
  PullOptions,
  PullResult,
  IntegrationStatus,
  IntegrationConfig,
  AreteConfig,
} from '../models/index.js';

export class IntegrationService {
  constructor(
    private storage: StorageAdapter,
    private config: AreteConfig
  ) {}

  async pull(
    integration: string,
    options: PullOptions
  ): Promise<PullResult> {
    throw new Error('Not implemented');
  }

  async list(): Promise<IntegrationStatus[]> {
    throw new Error('Not implemented');
  }

  async configure(
    integration: string,
    config: IntegrationConfig
  ): Promise<void> {
    throw new Error('Not implemented');
  }
}
