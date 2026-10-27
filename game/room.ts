import type { ClientAction, ClientMessage } from '../shared/protocol';
import type { RoomErrorCode } from '../shared/protocol';
import type { GameState, Pack, Player, RoomPlayer, RoomSettings, RoomState } from '../shared/types';
import { MAX_NAME_LENGTH, MAX_ROOM_PLAYERS } from '../shared/types';
import { addBingoPlayer, callBingo, createBingoGame, endBingoGame, everyoneHasWon, setMark, type BingoError } from './bingo';
import { canPlayBingo, canPlaySpotIt, drawItems } from './pack';
import type { Rng } from './rng';
import {
  addSpotItPlayer,
  approveClaim,
  claim,
  createSpotItGame,
  endSpotItGame,
  reassign,
  unclaim,
  type SpotItError,
} from './spotit';

/**
 * Pure room rules. The Durable Object and the client's offline replay both run
 * these, so a queued tap shows the same result locally that the server will
 * produce (or the server rejects it and the next snapshot corrects the UI).
 */

export type RoomError = RoomErrorCode | SpotItError | BingoError;

export interface RoomResult {
  room: RoomState;
  error?: { code: RoomError; message: string };
}

/**
 * Everyone a round's game has listed, including people who left. Caps the
 * roster so join-and-leave loops cannot grow a round without limit.
 */
const MAX_GAME_PLAYERS = MAX_ROOM_PLAYERS * 2;

const ok = (room: RoomState): RoomResult => ({ room });
const fail = (room: RoomState, code: RoomError, message: string): RoomResult => ({ room, error: { code, message } });

export function createRoom(opts: {
  code: string;
  host: Player;
  settings: RoomSettings;
  pack: Pack;
  now: number;
}): RoomState {
  return {
    code: opts.code,
    status: 'lobby',
    hostId: opts.host.id,
    players: [{ ...opts.host, connected: true, joinedAt: opts.now }],
    settings: opts.settings,
    pack: opts.pack,
    game: null,
    round: 0,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

export function findPlayer(room: RoomState, playerId: string): RoomPlayer | undefined {
  return room.players.find((p) => p.id === playerId);
}

export function isHost(room: RoomState, playerId: string): boolean {
  return room.hostId === playerId;
}

/**
 * Add a player. A player already in the room is just marked connected and
 * keeps their name; anyone else needs a name.
 */
export function joinRoom(room: RoomState, player: Player, now: number, rng: Rng): RoomResult {
  if (room.status === 'closed') return fail(room, 'room-closed', 'This trip has ended.');
  const existing = findPlayer(room, player.id);
  if (existing) return ok(setConnected(room, player.id, true, now));
  const name = player.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return fail(room, 'not-joined', 'Pick a name first.');
  if (room.players.length >= MAX_ROOM_PLAYERS) return fail(room, 'room-full', 'This trip is full.');
  // Someone who left mid-round keeps their name on the scoreboard, so it stays taken until the round is over.
  const taken = [...room.players, ...(room.game?.players ?? [])].some(
    (p) => p.id !== player.id && p.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) return fail(room, 'name-taken', `Someone here is already called ${name}. Pick another name.`);
  const returning = room.game?.players.some((p) => p.id === player.id) ?? false;
  // Only a join during play grows the round's roster; between rounds there is nothing to cap.
  if (!returning && room.status === 'playing' && room.game && room.game.players.length >= MAX_GAME_PLAYERS) {
    return fail(room, 'room-full', 'This trip is full.');
  }
  const roomPlayer: RoomPlayer = { id: player.id, name, connected: true, joinedAt: now };
  let game = room.game;
  if (game && returning) {
    // Back during the same round: their card or claims are waiting.
    game = setLeft(game, player.id, false, name);
  } else if (game && room.status === 'playing') {
    const gamePlayer: Player = { id: player.id, name };
    game =
      game.mode === 'spotit'
        ? addSpotItPlayer(game, gamePlayer)
        : addBingoPlayer(game, gamePlayer, room.pack.items, rng);
  }
  return ok({ ...room, players: [...room.players, roomPlayer], game, updatedAt: now });
}

/** Mark a game player as having left the trip, or as back (optionally under a new name). */
function setLeft(game: GameState, playerId: string, left: boolean, name?: string): GameState {
  const players = game.players.map((p) => {
    if (p.id !== playerId) return p;
    const { left: _was, ...rest } = p;
    return { ...rest, ...(name ? { name } : {}), ...(left ? { left: true } : {}) };
  });
  return { ...game, players };
}

export function setConnected(room: RoomState, playerId: string, connected: boolean, now: number): RoomState {
  const players = room.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  return { ...room, players, updatedAt: now };
}

function newGame(room: RoomState, rng: Rng): GameState | RoomError {
  const players: Player[] = room.players.map((p) => ({ id: p.id, name: p.name }));
  if (room.settings.mode === 'spotit') {
    if (!canPlaySpotIt(room.pack)) return 'not-enough-items';
    return createSpotItGame(players, drawItems(room.pack.items, room.settings.listLength, rng));
  }
  if (!canPlayBingo(room.pack)) return 'not-enough-items';
  return createBingoGame(players, room.pack.items, room.settings.pattern, rng);
}

function startRound(room: RoomState, now: number, rng: Rng): RoomResult {
  const game = newGame(room, rng);
  if (typeof game === 'string') {
    return fail(room, game, 'This list is too short for that mode.');
  }
  return ok({ ...room, status: 'playing', game, round: room.round + 1, updatedAt: now });
}

function finishIfGameEnded(room: RoomState, now: number): RoomState {
  if (room.game && room.game.status === 'ended' && room.status === 'playing') {
    return { ...room, status: 'ended', updatedAt: now };
  }
  return room;
}

function claimerName(room: RoomState, itemId: string): string {
  const g = room.game;
  if (!g || g.mode !== 'spotit') return 'Someone';
  const c = g.claims[itemId];
  // The game's roster, not the room's: someone who left mid-round still holds their claims.
  return (c && g.players.find((p) => p.id === c.playerId)?.name) ?? 'Someone';
}

/** Apply one client action on behalf of a player who is already in the room. */
export function applyAction(
  room: RoomState,
  playerId: string,
  action: ClientAction & Pick<ClientMessage, 'round'>,
  now: number,
  rng: Rng,
): RoomResult {
  if (room.status === 'closed') return fail(room, 'room-closed', 'This trip has ended.');
  if (!findPlayer(room, playerId)) return fail(room, 'not-joined', 'Join the trip first.');
  const host = isHost(room, playerId);
  const hostOnly = (): RoomResult | null => (host ? null : fail(room, 'not-host', 'Only the host can do that.'));
  const game = room.game;
  const staleRound = action.round !== undefined && action.round !== room.round;

  switch (action.type) {
    case 'join':
      return ok(room);

    case 'start': {
      const denied = hostOnly();
      if (denied) return denied;
      if (room.status !== 'lobby' && room.status !== 'ended') return fail(room, 'bad-status', 'The game is already running.');
      return startRound(room, now, rng);
    }

    case 'settings': {
      const denied = hostOnly();
      if (denied) return denied;
      if (room.status !== 'lobby') return fail(room, 'bad-status', 'Settings can only change before the game starts.');
      return ok({ ...room, settings: action.settings, pack: action.pack ?? room.pack, updatedAt: now });
    }

    case 'newRound': {
      const denied = hostOnly();
      if (denied) return denied;
      if (room.status !== 'ended' && room.status !== 'playing') return fail(room, 'bad-status', 'No game to replay yet.');
      return startRound({ ...room, settings: action.settings, pack: action.pack ?? room.pack }, now, rng);
    }

    case 'end': {
      const denied = hostOnly();
      if (denied) return denied;
      if (room.status !== 'playing' || !game) return fail(room, 'bad-status', 'No game is running.');
      const ended = game.mode === 'spotit' ? endSpotItGame(game, now) : endBingoGame(game, now);
      return ok({ ...room, status: 'ended', game: ended, updatedAt: now });
    }

    case 'close': {
      const denied = hostOnly();
      if (denied) return denied;
      return ok({ ...room, status: 'closed', updatedAt: now });
    }

    case 'leave': {
      if (host) return ok({ ...room, status: 'closed', updatedAt: now });
      const players = room.players.filter((p) => p.id !== playerId);
      if (!game || !game.players.some((p) => p.id === playerId)) return ok({ ...room, players, updatedAt: now });
      // Their score stands for the rest of the round; they just stop holding it up.
      let nextGame = setLeft(game, playerId, true);
      let status = room.status;
      if (nextGame.mode === 'bingo' && nextGame.status === 'playing' && everyoneHasWon(nextGame)) {
        nextGame = endBingoGame(nextGame, now);
        status = 'ended';
      }
      return ok({ ...room, players, game: nextGame, status, updatedAt: now });
    }

    case 'claim':
    case 'unclaim':
    case 'reassign':
    case 'approve': {
      if (room.status !== 'playing' || !game) return fail(room, 'bad-status', 'No game is running.');
      if (staleRound) return fail(room, 'bad-status', 'That round is over.');
      if (game.mode !== 'spotit') return fail(room, 'wrong-mode', 'That is not a Called It game.');
      if (action.type !== 'claim') {
        const denied = hostOnly();
        if (denied) return denied;
      }
      if (action.type === 'reassign' && game.players.find((p) => p.id === action.playerId)?.left) {
        return fail(room, 'unknown-player', 'They have left the trip.');
      }
      const r =
        action.type === 'claim'
          ? claim(game, action.itemId, playerId, now, room.settings.approvals === 'host' && !host)
          : action.type === 'unclaim'
            ? unclaim(game, action.itemId)
            : action.type === 'reassign'
              ? reassign(game, action.itemId, action.playerId, now)
              : approveClaim(game, action.itemId, now);
      if (!r.ok) {
        const message = r.error === 'already-claimed' ? `${claimerName(room, action.itemId)} got it` : 'That did not work.';
        return fail(room, r.error, message);
      }
      return ok(finishIfGameEnded({ ...room, game: r.state, updatedAt: now }, now));
    }

    case 'mark':
    case 'unmark':
    case 'bingo': {
      if (room.status !== 'playing' || !game) return fail(room, 'bad-status', 'No game is running.');
      if (staleRound) return fail(room, 'bad-status', 'That round is over.');
      if (game.mode !== 'bingo') return fail(room, 'wrong-mode', 'That is not a Bingo game.');
      const r =
        action.type === 'bingo'
          ? callBingo(game, playerId, now)
          : setMark(game, playerId, action.cell, action.type === 'mark');
      if (!r.ok) {
        const message = r.error === 'pattern-not-met' ? 'Not quite yet' : 'That did not work.';
        return fail(room, r.error, message);
      }
      return ok(finishIfGameEnded({ ...room, game: r.state, updatedAt: now }, now));
    }

    default:
      return fail(room, 'bad-message', 'Could not read that message.');
  }
}
