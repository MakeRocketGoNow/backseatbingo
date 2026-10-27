import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateRoomRequest } from '@shared/protocol';
import { ApiError, createRoom, getRoomInfo, OFFLINE_MESSAGE } from './api';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api requests', () => {
  it('turns a failed fetch into the offline message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await getRoomInfo('ABCD').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: OFFLINE_MESSAGE, status: 0 });
  });

  it('keeps the server error and status for an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'Too many trips.' }, 429)));
    const err = await createRoom({} as CreateRoomRequest).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'Too many trips.', status: 429 });
  });

  it('falls back to its own message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })));
    await expect(getRoomInfo('ABCD')).rejects.toMatchObject({ message: 'Could not look up that trip.', status: 500 });
  });

  it('reads a missing room as null, not an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'No such room.' }, 404)));
    await expect(getRoomInfo('ABCD')).resolves.toBeNull();
  });
});
