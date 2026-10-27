import type { Pack, RoomSettings, RoomState, RoomStatus } from './types';
import { BINGO_CELLS } from './types';
import { isRecord, isRoomPack, isRoomSettings } from './validate';

// HTTP

export interface CreateRoomRequest {
  /** The host's device token; it becomes the host's identity in the room. */
  token: string;
  name: string;
  settings: RoomSettings;
  pack: Pack;
}

export interface CreateRoomResponse {
  code: string;
}

export interface RoomInfoResponse {
  code: string;
  status: RoomStatus;
  players: number;
}

// WebSocket, client to server. Every message carries a client sequence number
// so the server can acknowledge it and the client can drop it from its
// offline queue.

export type ClientAction =
  /**
   * `session` is random per room connection (`seq` restarts with it). With `seq`, it lets the room recognise
   * a tap it already applied when the client resends it after losing the ack.
   */
  | { type: 'join'; name: string; session?: string }
  | { type: 'start' }
  | { type: 'claim'; itemId: string }
  | { type: 'unclaim'; itemId: string }
  | { type: 'reassign'; itemId: string; playerId: string }
  | { type: 'approve'; itemId: string }
  | { type: 'mark'; cell: number }
  | { type: 'unmark'; cell: number }
  | { type: 'bingo' }
  | { type: 'end' }
  | { type: 'newRound'; settings: RoomSettings; pack?: Pack }
  | { type: 'settings'; settings: RoomSettings; pack?: Pack }
  | { type: 'leave' }
  | { type: 'close' };

export type ClientMessage = ClientAction & {
  seq: number;
  /** The round a game tap was made in, so a tap queued offline cannot land on the next round's list or card. */
  round?: number;
};

export type RoomErrorCode =
  | 'bad-message'
  | 'not-joined'
  | 'not-host'
  | 'bad-status'
  | 'room-full'
  | 'room-closed'
  | 'name-taken'
  | 'wrong-mode'
  | 'not-enough-items'
  | 'rejected';

// Server to client.

/** WebSocket close codes the server uses to end a connection for good. */
export const CLOSE_ROOM_CLOSED = 4000;
export const CLOSE_LEFT = 4001;
/** No room with that code: it never existed, expired, or closed while this device was away. */
export const CLOSE_NOT_FOUND = 4002;
/** The app is older than the server supports; it has to reload into the current build. */
export const CLOSE_UPDATE_NEEDED = 4003;

// Versions. The client sends `PROTOCOL_VERSION` as `v` on the socket URL,
// which is the one part of the protocol that never changes shape. Bump
// `PROTOCOL_VERSION` for any change, and raise `MIN_PROTOCOL_VERSION` to it
// only when the change breaks older clients: every bump of the minimum sends
// open trips on older builds to a reload, so additive changes should not.

export const PROTOCOL_VERSION = 1;
export const MIN_PROTOCOL_VERSION = 1;

/** Whether the server still speaks to a client sending `v`. No `v` is version 1, from before versions were sent. */
export function isSupportedClient(v: string | null, min: number = MIN_PROTOCOL_VERSION): boolean {
  const version = v === null ? 1 : Number(v);
  return Number.isInteger(version) && version >= min;
}

export type ServerMessage =
  | { type: 'state'; state: RoomState; you: string; ack?: number }
  | { type: 'error'; code: RoomErrorCode; message: string; seq?: number }
  | { type: 'toast'; message: string };

/** Checks every field a client message carries; the room trusts nothing else about it. */
export function isClientMessage(v: unknown): v is ClientMessage {
  if (!isRecord(v) || !Number.isInteger(v['seq'])) return false;
  if (v['round'] !== undefined && !Number.isInteger(v['round'])) return false;
  switch (v['type'] as ClientAction['type']) {
    case 'join':
      return typeof v['name'] === 'string' && (v['session'] === undefined || (typeof v['session'] === 'string' && v['session'].length <= 64));
    case 'start':
    case 'bingo':
    case 'end':
    case 'leave':
    case 'close':
      return true;
    case 'claim':
    case 'unclaim':
    case 'approve':
      return typeof v['itemId'] === 'string';
    case 'reassign':
      return typeof v['itemId'] === 'string' && typeof v['playerId'] === 'string';
    case 'mark':
    case 'unmark':
      return Number.isInteger(v['cell']) && (v['cell'] as number) >= 0 && (v['cell'] as number) < BINGO_CELLS;
    case 'settings':
    case 'newRound':
      return isRoomSettings(v['settings']) && (v['pack'] === undefined || isRoomPack(v['pack']));
    default:
      return false;
  }
}
