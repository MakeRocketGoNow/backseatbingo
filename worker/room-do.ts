import { DurableObject } from 'cloudflare:workers';
import type { ClientMessage, CreateRoomRequest, RoomErrorCode, RoomInfoResponse, ServerMessage } from '../shared/protocol';
import { CLOSE_LEFT, CLOSE_NOT_FOUND, CLOSE_ROOM_CLOSED, isClientMessage } from '../shared/protocol';
import type { RoomState } from '../shared/types';
import { applyAction, createRoom, joinRoom, setConnected } from '../game/room';
import { closedSocket } from './closed-socket';
import type { Env } from './env';

/**
 * One Durable Object per room. It stores the whole room under one key, keeps
 * WebSockets through hibernation, and deletes itself 24 hours after the last
 * message. All rules live in game/room.ts; this class only parses, checks the
 * caller's identity, persists and broadcasts.
 */

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'room';

interface Stored {
  room: RoomState;
  /** Device token to player id. Never sent to clients. */
  tokens: Record<string, string>;
}

interface Attachment {
  token: string;
}

function newPlayerId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export class RoomDO extends DurableObject<Env> {
  private cache: Stored | null | undefined;

  private async load(): Promise<Stored | null> {
    if (this.cache === undefined) {
      this.cache = (await this.ctx.storage.get<Stored>(STORAGE_KEY)) ?? null;
    }
    return this.cache;
  }

  private async save(stored: Stored): Promise<void> {
    this.cache = stored;
    await this.ctx.storage.put(STORAGE_KEY, stored);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  private async destroy(): Promise<void> {
    this.cache = null;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(CLOSE_ROOM_CLOSED, 'Room closed');
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/create':
        return this.handleCreate(request);
      case '/info':
        return this.handleInfo();
      case '/ws':
        return this.handleUpgrade(url);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleCreate(request: Request): Promise<Response> {
    const existing = await this.load();
    if (existing && existing.room.status !== 'closed') {
      return new Response('Code in use', { status: 409 });
    }
    const body = (await request.json()) as CreateRoomRequest & { code: string };
    const hostId = newPlayerId();
    const room = createRoom({
      code: body.code,
      host: { id: hostId, name: body.name.trim() },
      settings: body.settings,
      pack: body.pack,
      now: Date.now(),
    });
    // The host is not connected until their socket arrives.
    const stored: Stored = { room: setConnected(room, hostId, false, room.createdAt), tokens: { [body.token]: hostId } };
    await this.save(stored);
    return new Response(null, { status: 201 });
  }

  private async handleInfo(): Promise<Response> {
    const stored = await this.load();
    if (!stored || stored.room.status === 'closed') {
      return Response.json({ error: 'No such trip.' }, { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    const info: RoomInfoResponse = {
      code: stored.room.code,
      status: stored.room.status,
      players: stored.room.players.length,
    };
    return Response.json(info, { headers: { 'cache-control': 'no-store' } });
  }

  private async handleUpgrade(url: URL): Promise<Response> {
    const stored = await this.load();
    if (!stored || stored.room.status === 'closed') return closedSocket(CLOSE_NOT_FOUND, 'No such trip.');
    const token = url.searchParams.get('token') ?? '';
    if (token.length < 16 || token.length > 64) return new Response('Bad token.', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { token };
    server.serializeAttachment(attachment);

    const playerId = stored.tokens[token];
    if (playerId && stored.room.players.some((p) => p.id === playerId)) {
      const next: Stored = { ...stored, room: setConnected(stored.room, playerId, true, Date.now()) };
      await this.save(next);
      this.broadcast(next);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket is gone; close handler will tidy up
    }
  }

  private broadcast(stored: Stored, sender?: WebSocket, ack?: number): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      const you = att ? stored.tokens[att.token] : undefined;
      if (!you) continue;
      const msg: ServerMessage = { type: 'state', state: stored.room, you };
      if (ws === sender && ack !== undefined) msg.ack = ack;
      this.send(ws, msg);
    }
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      this.send(ws, { type: 'error', code: 'bad-message', message: 'Could not read that message.' });
      return;
    }
    if (!isClientMessage(parsed)) {
      this.send(ws, { type: 'error', code: 'bad-message', message: 'Could not read that message.' });
      return;
    }
    const msg: ClientMessage = parsed;
    const att = ws.deserializeAttachment() as Attachment | null;
    const stored = await this.load();
    if (!att || !stored || stored.room.status === 'closed') {
      this.send(ws, { type: 'error', code: 'room-closed', message: 'This trip has ended.', seq: msg.seq });
      return;
    }
    const now = Date.now();
    let playerId = stored.tokens[att.token];

    if (msg.type === 'join') {
      // The rules decide who may join; this only gives a new device an id.
      const tokens = { ...stored.tokens };
      if (!playerId) {
        playerId = newPlayerId();
        tokens[att.token] = playerId;
      }
      const result = joinRoom(stored.room, { id: playerId, name: msg.name }, now, Math.random);
      if (result.error) {
        this.send(ws, { type: 'error', code: toErrorCode(result.error.code), message: result.error.message, seq: msg.seq });
        return;
      }
      const next: Stored = { room: result.room, tokens };
      await this.save(next);
      this.broadcast(next, ws, msg.seq);
      return;
    }

    if (!playerId) {
      this.send(ws, { type: 'error', code: 'not-joined', message: 'Join the trip first.', seq: msg.seq });
      return;
    }

    const result = applyAction(stored.room, playerId, msg, now, Math.random);
    if (result.error) {
      this.send(ws, {
        type: 'error',
        code: toErrorCode(result.error.code),
        message: result.error.message,
        seq: msg.seq,
      });
      return;
    }
    const next: Stored = { room: result.room, tokens: stored.tokens };
    await this.save(next);
    this.broadcast(next, ws, msg.seq);

    if (next.room.status === 'closed') {
      await this.destroy();
      return;
    }
    if (msg.type === 'leave') {
      try {
        ws.close(CLOSE_LEFT, 'Left');
      } catch {
        // ignore
      }
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.markDisconnected(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.markDisconnected(ws);
  }

  private async markDisconnected(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    const stored = await this.load();
    if (!att || !stored || stored.room.status === 'closed') return;
    const playerId = stored.tokens[att.token];
    if (!playerId) return;
    // Another tab on the same device may still be open.
    const stillOpen = this.ctx
      .getWebSockets()
      .some((other) => other !== ws && (other.deserializeAttachment() as Attachment | null)?.token === att.token);
    if (stillOpen) return;
    const next: Stored = { ...stored, room: setConnected(stored.room, playerId, false, Date.now()) };
    await this.save(next);
    this.broadcast(next);
  }

  override async alarm(): Promise<void> {
    await this.destroy();
  }
}

const WIRE_CODES: ReadonlySet<string> = new Set<RoomErrorCode>([
  'bad-message',
  'not-joined',
  'not-host',
  'bad-status',
  'room-full',
  'room-closed',
  'name-taken',
  'wrong-mode',
  'not-enough-items',
  'rejected',
]);

/** Game-level error codes fold into `rejected` on the wire; the message carries the detail. */
function toErrorCode(code: string): RoomErrorCode {
  return WIRE_CODES.has(code) ? (code as RoomErrorCode) : 'rejected';
}
