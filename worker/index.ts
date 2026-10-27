import type { CreateRoomRequest, CreateRoomResponse } from '../shared/protocol';
import { CLOSE_NOT_FOUND } from '../shared/protocol';
import { MAX_NAME_LENGTH } from '../shared/types';
import { isRecord, isRoomPack, isRoomSettings } from '../shared/validate';
import { generateRoomCode, isValidRoomCode } from '../game/codes';
import { closedSocket } from './closed-socket';
import type { Env, RateLimiter } from './env';
import { RoomDO } from './room-do';

export { RoomDO };

const MAX_BODY_BYTES = 128 * 1024;
const CODE_ATTEMPTS = 8;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function isCreateRequest(v: unknown): v is CreateRoomRequest {
  return (
    isRecord(v) &&
    typeof v['token'] === 'string' &&
    v['token'].length >= 16 &&
    v['token'].length <= 64 &&
    typeof v['name'] === 'string' &&
    v['name'].trim().length > 0 &&
    v['name'].length <= MAX_NAME_LENGTH &&
    isRoomSettings(v['settings']) &&
    isRoomPack(v['pack'])
  );
}

async function allowed(limiter: RateLimiter | undefined, request: Request): Promise<boolean> {
  if (!limiter) return true;
  const { success } = await limiter.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
  return success;
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  if (!(await allowed(env.CREATE_ROOM_LIMITER, request))) {
    return json({ error: 'Too many trips started. Try again in a minute.' }, 429);
  }
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return json({ error: 'Request too large.' }, 413);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }
  if (!isCreateRequest(body)) return json({ error: 'Invalid room request.' }, 400);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode(Math.random);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch('https://room/create', {
      method: 'POST',
      body: JSON.stringify({ ...body, code }),
      headers: { 'content-type': 'application/json' },
    });
    if (res.status === 201) {
      const out: CreateRoomResponse = { code };
      return json(out, 201);
    }
    if (res.status !== 409) return res;
  }
  return json({ error: 'Could not find a free room code. Try again.' }, 503);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      return createRoom(request, env);
    }
    const match = /^\/api\/rooms\/([A-Za-z]{4})(\/ws)?$/.exec(url.pathname);
    if (match) {
      // There are only 24^4 codes; without a limit a script could find live rooms in minutes.
      if (!(await allowed(env.ROOM_LOOKUP_LIMITER, request))) {
        return json({ error: 'Too many requests. Try again in a minute.' }, 429);
      }
      const code = match[1]!.toUpperCase();
      const stub = isValidRoomCode(code) ? env.ROOMS.get(env.ROOMS.idFromName(code)) : null;
      if (match[2]) {
        if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
          return json({ error: 'Expected a WebSocket upgrade.' }, 426);
        }
        // A socket the browser can read the close code of, not a failed handshake it would retry.
        if (!stub) return closedSocket(CLOSE_NOT_FOUND, 'No such trip.');
        return stub.fetch(new Request(`https://room/ws${url.search}`, request));
      }
      if (!stub) return json({ error: 'No such trip.' }, 404);
      if (request.method === 'GET') return stub.fetch('https://room/info');
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
