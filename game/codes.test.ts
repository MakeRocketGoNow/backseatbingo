import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateRoomCode, isValidRoomCode, normalizeRoomCode } from './codes';
import { seededRng } from './rng';

describe('room codes', () => {
  it('are four letters from the unambiguous alphabet', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(4);
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[IO01]/);
    }
    expect(CODE_ALPHABET).toHaveLength(24);
  });

  it('validates strictly', () => {
    expect(isValidRoomCode('ABCD')).toBe(true);
    expect(isValidRoomCode('abcd')).toBe(false);
    expect(isValidRoomCode('ABCI')).toBe(false);
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
  });

  it('normalizes typed input', () => {
    expect(normalizeRoomCode(' ab-cd ')).toBe('ABCD');
    expect(normalizeRoomCode('abcdef')).toBe('ABCD');
    expect(normalizeRoomCode('0')).toBe('Q');
    expect(normalizeRoomCode('1')).toBe('J');
  });
});
