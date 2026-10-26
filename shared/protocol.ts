import type { Pack, RoomSettings, RoomState, RoomStatus } from './types';

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

export type ClientMessage = ClientAction & { seq: number };

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

export type ServerMessage =
  | { type: 'state'; state: RoomState; you: string; ack?: number }
  | { type: 'error'; code: RoomErrorCode; message: string; seq?: number }
  | { type: 'toast'; message: string };

export function isClientMessage(v: unknown): v is ClientMessage {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return typeof m['type'] === 'string' && typeof m['seq'] === 'number';
}
