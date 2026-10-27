import type { Pack, RoomSettings } from './types';

// Shape checks for data that crosses the network into a room. The Worker runs
// them on `POST /api/rooms` and the room runs them on every WebSocket message,
// so a hand-written client cannot store what the app itself would never send.

export const MAX_PACK_ITEMS = 500;

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const optionalString = (v: unknown, max: number): boolean => v === undefined || (typeof v === 'string' && v.length <= max);

export function isRoomSettings(v: unknown): v is RoomSettings {
  return (
    isRecord(v) &&
    (v['mode'] === 'spotit' || v['mode'] === 'bingo') &&
    (v['listLength'] === 'quick' || v['listLength'] === 'normal' || v['listLength'] === 'long') &&
    (v['pattern'] === 'line' || v['pattern'] === 'corners' || v['pattern'] === 'x' || v['pattern'] === 'blackout') &&
    (v['approvals'] === 'auto' || v['approvals'] === 'host')
  );
}

export function isRoomPack(v: unknown): v is Pack {
  return (
    isRecord(v) &&
    typeof v['id'] === 'string' &&
    v['id'].length <= 80 &&
    typeof v['name'] === 'string' &&
    v['name'].length > 0 &&
    v['name'].length <= 60 &&
    typeof v['description'] === 'string' &&
    v['description'].length <= 500 &&
    typeof v['free'] === 'boolean' &&
    typeof v['minAge'] === 'number' &&
    (v['custom'] === undefined || typeof v['custom'] === 'boolean') &&
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
        i['text'].length <= 200 &&
        optionalString(i['emoji'], 16) &&
        optionalString(i['region'], 60) &&
        (i['rarity'] === undefined || i['rarity'] === 'common' || i['rarity'] === 'uncommon' || i['rarity'] === 'rare'),
    ) &&
    // Claims are keyed by item id, so two items sharing one would be claimed together.
    new Set(v['items'].map((i: { id: string }) => i.id)).size === v['items'].length
  );
}
