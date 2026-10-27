import type { RoomDO } from './room-do';

/** Rate Limiting binding. Declared here so the Worker compiles without the exact upstream type. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  ASSETS: Fetcher;
  CREATE_ROOM_LIMITER?: RateLimiter;
  ROOM_LOOKUP_LIMITER?: RateLimiter;
}
