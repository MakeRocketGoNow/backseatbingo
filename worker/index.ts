import type { CreateRoomRequest, CreateRoomResponse } from '../shared/protocol';
import { CLOSE_NOT_FOUND } from '../shared/protocol';
import type { Pack, RoomSettings } from '../shared/types';
import { generateRoomCode, isValidRoomCode } from '../game/codes';
import { closedSocket } from './closed-socket';
import type { Env } from './env';
import { RoomDO } from './room-do';

export { RoomDO };

const MAX_BODY_BYTES = 128 * 1024;
const MAX_PACK_ITEMS = 500;
const MAX_NAME = 20;
const CODE_ATTEMPTS = 8;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isSettings(v: unknown): v is RoomSettings {
  return (
    isRecord(v) &&
    (v['mode'] === 'spotit' || v['mode'] === 'bingo') &&
    (v['listLength'] === 'quick' || v['listLength'] === 'normal' || v['listLength'] === 'long') &&
    (v['pattern'] === 'line' || v['pattern'] === 'corners' || v['pattern'] === 'x' || v['pattern'] === 'blackout') &&
    (v['approvals'] === 'auto' || v['approvals'] === 'host')
  );
}

function isPack(v: unknown): v is Pack {
  return (
    isRecord(v) &&
    typeof v['id'] === 'string' &&
    typeof v['name'] === 'string' &&
    v['name'].length > 0 &&
    v['name'].length <= 60 &&
    typeof v['description'] === 'string' &&
    typeof v['free'] === 'boolean' &&
    typeof v['minAge'] === 'number' &&
    Array.isArray(v['items']) &&
    v['items'].length > 0 &&
    v['items'].length <= MAX_PACK_ITEMS &&
    v['items'].every(
      (i: unknown) =>
        isRecord(i) &&
        typeof i['id'] === 'string' &&
        i['id'].length > 0 &&
        i['id'].length <= 80 &&
        typeof i['text'] === 'string' &&
        i['text'].length > 0 &&
        i['text'].length <= 200,
    )
  );
}

function isCreateRequest(v: unknown): v is CreateRoomRequest {
  return (
    isRecord(v) &&
    typeof v['token'] === 'string' &&
    v['token'].length >= 16 &&
    v['token'].length <= 64 &&
    typeof v['name'] === 'string' &&
    v['name'].trim().length > 0 &&
    v['name'].length <= MAX_NAME &&
    isSettings(v['settings']) &&
    isPack(v['pack'])
  );
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.CREATE_ROOM_LIMITER) {
    const { success } = await env.CREATE_ROOM_LIMITER.limit({ key: ip });
    if (!success) return json({ error: 'Too many trips started. Try again in a minute.' }, 429);
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
