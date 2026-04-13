import type { AppConfig } from '@shelvarr/types';

let _config: AppConfig | null = null;

/**
 * Initialize the service config. Must be called before using any service.
 */
export function initServiceConfig(config: AppConfig): void {
  _config = config;
}

/**
 * Get the current service config.
 */
export function getServiceConfig(): AppConfig {
  if (!_config) {
    throw new Error('Service config not initialized. Call initServiceConfig() first.');
  }
  return _config;
}
