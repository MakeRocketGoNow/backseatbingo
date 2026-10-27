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
  | { type: 'join'; name: string }
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
      return typeof v['name'] === 'string';
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
