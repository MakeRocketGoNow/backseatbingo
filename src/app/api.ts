import type { CreateRoomRequest, CreateRoomResponse, RoomInfoResponse } from '@shared/protocol';
import { PROTOCOL_VERSION } from '@shared/protocol';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const OFFLINE_MESSAGE = 'No signal. Trips need a connection; playing on this phone works without one.';

/** `fetch` rejects with a bare TypeError when there is no network; say so in car terms. */
async function request(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === 'string') return data.error;
  } catch {
    // not JSON
  }
  return fallback;
}

export async function createRoom(req: CreateRoomRequest): Promise<CreateRoomResponse> {
  const res = await request('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(await errorMessage(res, 'Could not start a trip.'), res.status);
  return (await res.json()) as CreateRoomResponse;
}

/** Null when there is no such room. */
export async function getRoomInfo(code: string): Promise<RoomInfoResponse | null> {
  const res = await request(`/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(await errorMessage(res, 'Could not look up that trip.'), res.status);
  return (await res.json()) as RoomInfoResponse;
}

export function roomSocketUrl(code: string, token: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/rooms/${encodeURIComponent(code)}/ws?token=${encodeURIComponent(token)}&v=${PROTOCOL_VERSION}`;
}

export function joinLink(code: string): string {
  return `${location.origin}/j/${code}`;
}
