import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ServerMessage } from '@shared/protocol';
import type { RoomState, SpotItState } from '@shared/types';
import { RoomConnection } from './room';

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: ClientMessage[] = [];
  pings = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string): void {
    if (data === 'ping') this.pings += 1;
    else this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(msg: ServerMessage | 'pong'): void {
    this.onmessage?.({ data: msg === 'pong' ? msg : JSON.stringify(msg) });
  }

  drop(code = 1006): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code });
  }
}

const last = (): FakeSocket => FakeSocket.all[FakeSocket.all.length - 1]!;

function room(): RoomState {
  const game: SpotItState = {
    mode: 'spotit',
    status: 'playing',
    players: [
      { id: 'h', name: 'Host' },
      { id: 'g', name: 'Kid' },
    ],
    items: [
      { id: 'cow', text: 'Cow' },
      { id: 'barn', text: 'Barn' },
    ],
    claims: {},
  };
  return {
    code: 'BCDF',
    status: 'playing',
    hostId: 'h',
    players: [
      { id: 'h', name: 'Host', connected: true, joinedAt: 0 },
      { id: 'g', name: 'Kid', connected: true, joinedAt: 1 },
    ],
    settings: { mode: 'spotit', listLength: 'quick', pattern: 'line', approvals: 'auto' },
    pack: { id: 'p', name: 'P', description: '', free: true, minAge: 0, items: game.items },
    game,
    round: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

function claimed(conn: RoomConnection, itemId: string): boolean {
  const g = conn.getSnapshot().room?.game;
  return g?.mode === 'spotit' && !!g.claims[itemId];
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { protocol: 'https:', host: 'example.test' });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function connected(): RoomConnection {
  const conn = new RoomConnection('BCDF', 'token-token-token-1', 'Kid', { onToast: vi.fn() });
  conn.start();
  last().open();
  last().receive({ type: 'state', state: room(), you: 'g', ack: 0 });
  return conn;
}

describe('RoomConnection', () => {
  it('drops a queued tap once the server acknowledges it', () => {
    const conn = connected();
    conn.send({ type: 'claim', itemId: 'cow' });
    expect(claimed(conn, 'cow')).toBe(true);
    const seq = last().sent.at(-1)!.seq;
    const next = room();
    if (next.game?.mode === 'spotit') next.game.claims['cow'] = { itemId: 'cow', playerId: 'g', at: 2, status: 'claimed' };
    last().receive({ type: 'state', state: next, you: 'g', ack: seq });
    expect(claimed(conn, 'cow')).toBe(true);
    // A later snapshot without the claim proves it is no longer replayed locally.
    last().receive({ type: 'state', state: room(), you: 'g' });
    expect(claimed(conn, 'cow')).toBe(false);
  });

  it('drops a queued tap the server rejects', () => {
    const conn = connected();
    conn.send({ type: 'claim', itemId: 'cow' });
    const seq = last().sent.at(-1)!.seq;
    last().receive({ type: 'error', code: 'rejected', message: 'Nope', seq });
    expect(claimed(conn, 'cow')).toBe(false);
  });

  it('keeps taps made offline queued through the reconnect join', () => {
    const conn = connected();
    last().drop();
    conn.send({ type: 'claim', itemId: 'cow' });
    expect(claimed(conn, 'cow')).toBe(true);

    vi.runOnlyPendingTimers();
    const ws = last();
    ws.open();
    const [join, replay] = ws.sent;
    expect(join).toMatchObject({ type: 'join' });
    expect(replay).toMatchObject({ type: 'claim', itemId: 'cow' });

    // The server acks the join before it has read the replayed claim.
    ws.receive({ type: 'state', state: room(), you: 'g', ack: join!.seq });
    expect(claimed(conn, 'cow')).toBe(true);

    // If the socket drops now, the claim is sent again on the next connection.
    ws.drop();
    vi.runOnlyPendingTimers();
    last().open();
    expect(last().sent.some((m) => m.type === 'claim' && m.seq === replay!.seq)).toBe(true);
  });
});

describe('RoomConnection across rounds', () => {
  it('stops replaying taps once a new round starts', () => {
    const conn = connected();
    last().drop();
    conn.send({ type: 'claim', itemId: 'cow' });
    expect(last().sent.length).toBe(1);
    vi.runOnlyPendingTimers();
    const ws = last();
    ws.open();
    expect(ws.sent.find((m) => m.type === 'claim')?.round).toBe(1);
    ws.receive({ type: 'state', state: { ...room(), round: 2 }, you: 'g', ack: 0 });
    expect(claimed(conn, 'cow')).toBe(false);
    ws.drop();
    vi.runOnlyPendingTimers();
    last().open();
    expect(last().sent.map((m) => m.type)).toEqual(['join']);
  });
});

describe('RoomConnection heartbeat', () => {
  it('pings a quiet socket and keeps it while it answers', () => {
    const conn = connected();
    vi.advanceTimersByTime(20_000);
    expect(last().pings).toBe(1);
    last().receive('pong');
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(conn.getSnapshot().connection).toBe('open');
  });

  it('abandons a socket that stops answering and reconnects', () => {
    const conn = connected();
    vi.advanceTimersByTime(25_000);
    expect(conn.getSnapshot().connection).toBe('reconnecting');
    vi.runOnlyPendingTimers();
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('gives up on a socket stuck connecting', () => {
    const conn = new RoomConnection('BCDF', 'token-token-token-1', 'Kid', { onToast: vi.fn() });
    conn.start();
    vi.advanceTimersByTime(10_000);
    expect(conn.getSnapshot().connection).toBe('reconnecting');
    vi.runOnlyPendingTimers();
    expect(FakeSocket.all).toHaveLength(2);
  });
});

describe('RoomConnection while offline', () => {
  it('tells the user a host action cannot be sent instead of dropping it', () => {
    const onToast = vi.fn();
    const conn = new RoomConnection('BCDF', 'token-token-token-1', 'Kid', { onToast });
    conn.start();
    last().open();
    last().drop();
    conn.send({ type: 'end' });
    expect(onToast).toHaveBeenCalledWith('Not connected. Try again when you have signal.');
    vi.runOnlyPendingTimers();
    last().open();
    expect(last().sent.map((m) => m.type)).toEqual(['join']);
  });
});

describe('RoomConnection when the room is gone', () => {
  it('stops retrying when the server says the room does not exist', () => {
    const conn = new RoomConnection('BCDF', 'token-token-token-1', 'Kid', { onToast: vi.fn() });
    conn.start();
    last().drop(4002);
    expect(conn.getSnapshot()).toMatchObject({ connection: 'closed', closeReason: 'not-found' });
    vi.runAllTimers();
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('keeps retrying when the socket just drops', () => {
    const conn = new RoomConnection('BCDF', 'token-token-token-1', 'Kid', { onToast: vi.fn() });
    conn.start();
    last().drop();
    expect(conn.getSnapshot().connection).toBe('reconnecting');
    vi.runOnlyPendingTimers();
    expect(FakeSocket.all).toHaveLength(2);
  });
});
