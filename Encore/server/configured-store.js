import { createD1Client, createD1ModerationClient } from './d1-client.js';
import { createNeonStore } from './neon-store.js';
import { createModerationStore } from './moderation.js';

export function usesD1(config) {
  const backend = config.ENCORE_VIDEO_STORE || 'neon';
  if (backend !== 'neon' && backend !== 'd1') throw new Error('Invalid ENCORE_VIDEO_STORE');
  return backend === 'd1';
}

export function createConfiguredStore(config) {
  return usesD1(config)
    ? createD1Client(config.ENCORE_D1_URL, config.ENCORE_D1_TOKEN)
    : createNeonStore(config.DATABASE_URL);
}

export function createConfiguredModerationStore(config) {
  return usesD1(config)
    ? createD1ModerationClient(config.ENCORE_D1_URL, config.ENCORE_D1_ADMIN_TOKEN)
    : createModerationStore(config.DATABASE_URL);
}

export function rateLimitSaltFor(config) {
  if (config.ENCORE_RATE_LIMIT_SALT) return config.ENCORE_RATE_LIMIT_SALT;
  if (usesD1(config)) throw new Error('ENCORE_RATE_LIMIT_SALT is required for D1');
  return config.DATABASE_URL;
}
