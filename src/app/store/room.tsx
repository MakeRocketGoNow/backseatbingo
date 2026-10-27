import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { ClientAction, ClientMessage, ServerMessage } from '@shared/protocol';
import type { RoomState } from '@shared/types';
import { applyAction } from '@game/index';
import { roomSocketUrl } from '@app/api';
import { useToast } from '@app/components/Toast';
import { getPlayerToken } from './identity';

/**
 * The room store: one WebSocket to the room's Durable Object. The server
 * sends a full snapshot after every change. Taps are queued with a sequence
 * number, replayed locally through the same pure rules the server runs (so
 * the UI responds instantly, even offline), and dropped once the server
 * acknowledges or rejects them.
 */

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
export type CloseReason = 'host-closed' | 'left' | null;

export interface RoomSnapshot {
  connection: ConnectionStatus;
  /** Server state with unacknowledged local actions replayed on top. */
  room: RoomState | null;
  you: string | null;
  /** The server does not know this device; go pick a name. */
  needsName: boolean;
  closeReason: CloseReason;
}

/** Actions safe to replay locally. Round and membership changes wait for the server. */
const REPLAYABLE = new Set<ClientAction['type']>(['claim', 'unclaim', 'reassign', 'approve', 'mark', 'unmark', 'bingo']);
const MAX_BACKOFF_MS = 15_000;
const CLOSE_HOST_CLOSED = 4000;
const CLOSE_LEFT = 4001;

interface Callbacks {
  onToast: (message: string) => void;
}

export class RoomConnection {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending: ClientMessage[] = [];
  private attempt = 0;
  private timer: number | undefined;
  private stopped = false;
  private server: RoomState | null = null;
  private you: string | null = null;
  private listeners = new Set<() => void>();
  private snapshot: RoomSnapshot = { connection: 'connecting', room: null, you: null, needsName: false, closeReason: null };

  constructor(
    private readonly code: string,
    private readonly token: string,
    private name: string,
    private readonly callbacks: Callbacks,
  ) {}

  setName(name: string): void {
    this.name = name;
  }

  start(): void {
    this.stopped = false;
    window.addEventListener('online', this.wake);
    document.addEventListener('visibilitychange', this.wake);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    window.removeEventListener('online', this.wake);
    document.removeEventListener('visibilitychange', this.wake);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): RoomSnapshot => this.snapshot;

  send(action: ClientAction): void {
    const msg: ClientMessage = { ...action, seq: ++this.seq };
    if (REPLAYABLE.has(action.type)) this.pending.push(msg);
    this.raw(msg);
    this.publish({});
  }

  private wake = (): void => {
    if (this.stopped || this.ws || document.visibilityState === 'hidden') return;
    window.clearTimeout(this.timer);
    this.attempt = 0;
    this.connect();
  };

  private connect(): void {
    if (this.stopped || this.snapshot.closeReason) return;
    this.publish({ connection: this.attempt === 0 && !this.server ? 'connecting' : 'reconnecting' });
    const ws = new WebSocket(roomSocketUrl(this.code, this.token));
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.publish({ connection: 'open' });
      // A known token makes this a reconnect; the server ignores the name then.
      // The join takes seq 0, below every queued tap, so its ack cannot drop
      // taps the server has not seen yet.
      this.raw({ type: 'join', name: this.name, seq: 0 });
      for (const m of this.pending) this.raw(m);
    };
    ws.onmessage = (e: MessageEvent<string>) => {
      if (this.ws !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data) as ServerMessage;
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = (e: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (e.code === CLOSE_HOST_CLOSED) return this.publish({ connection: 'closed', closeReason: 'host-closed' });
      if (e.code === CLOSE_LEFT) return this.publish({ connection: 'closed', closeReason: 'left' });
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows and handles the retry
    };
  }

  private scheduleReconnect(): void {
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempt += 1;
    this.publish({ connection: 'reconnecting' });
    this.timer = window.setTimeout(() => this.connect(), delay);
  }

  private raw(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        // socket died between the check and the send; onclose will retry
      }
    }
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'state': {
        this.server = msg.state;
        this.you = msg.you;
        if (msg.ack !== undefined) {
          const ack = msg.ack;
          this.pending = this.pending.filter((p) => p.seq > ack);
        }
        if (msg.state.status === 'closed') {
          this.publish({ connection: 'closed', closeReason: 'host-closed', needsName: false });
        } else {
          this.publish({ needsName: false });
        }
        return;
      }
      case 'error': {
        if (msg.seq !== undefined) {
          const seq = msg.seq;
          this.pending = this.pending.filter((p) => p.seq !== seq);
        }
        if (msg.code === 'not-joined' || msg.code === 'name-taken' || msg.code === 'room-full') {
          this.publish({ needsName: true });
          if (msg.code !== 'not-joined') this.callbacks.onToast(msg.message);
          return;
        }
        if (msg.code === 'room-closed') {
          this.publish({ connection: 'closed', closeReason: 'host-closed' });
          return;
        }
        this.callbacks.onToast(msg.message);
        this.publish({});
        return;
      }
      case 'toast':
        this.callbacks.onToast(msg.message);
        return;
    }
  }

  private view(): RoomState | null {
    const base = this.server;
    const you = this.you;
    if (!base || !you) return base;
    const now = Date.now();
    return this.pending.reduce((room, m) => applyAction(room, you, m, now, Math.random).room, base);
  }

  private publish(patch: Partial<RoomSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, room: this.view(), you: this.you };
    this.listeners.forEach((l) => l());
  }
}

interface RoomApi extends RoomSnapshot {
  code: string;
  isHost: boolean;
  send: (action: ClientAction) => void;
}

const RoomContext = createContext<RoomApi | null>(null);

export function RoomProvider({ code, name, children }: { code: string; name: string; children: ReactNode }) {
  const toast = useToast();
  const toastRef = useRef(toast.show);
  toastRef.current = toast.show;

  const conn = useMemo(
    () => new RoomConnection(code, getPlayerToken(), name, { onToast: (m) => toastRef.current(m) }),
    // The connection lives as long as the code does; a name change just updates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code],
  );
  useEffect(() => conn.setName(name), [conn, name]);
  useEffect(() => {
    conn.start();
    return () => conn.stop();
  }, [conn]);

  const snap = useSyncExternalStore(conn.subscribe, conn.getSnapshot, conn.getSnapshot);
  const api = useMemo<RoomApi>(
    () => ({ ...snap, code, isHost: !!snap.room && snap.you === snap.room.hostId, send: (a) => conn.send(a) }),
    [snap, code, conn],
  );
  return <RoomContext.Provider value={api}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomApi {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used inside RoomProvider');
  return ctx;
}
