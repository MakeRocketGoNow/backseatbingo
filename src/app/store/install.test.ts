import { describe, expect, it } from 'vitest';
import { offerKind } from './install';

const base = { dismissed: false, standalone: false, canPrompt: false, iosSafari: false };

describe('offerKind', () => {
  it("offers the browser's prompt when there is one", () => {
    expect(offerKind({ ...base, canPrompt: true })).toBe('prompt');
  });

  it('gives iOS Safari the menu hint, since it has no prompt', () => {
    expect(offerKind({ ...base, iosSafari: true })).toBe('ios-hint');
  });

  it('offers nothing once the host has said no', () => {
    expect(offerKind({ ...base, dismissed: true, canPrompt: true })).toBeNull();
    expect(offerKind({ ...base, dismissed: true, iosSafari: true })).toBeNull();
  });

  it('offers nothing when already running from the home screen', () => {
    expect(offerKind({ ...base, standalone: true, canPrompt: true })).toBeNull();
    expect(offerKind({ ...base, standalone: true, iosSafari: true })).toBeNull();
  });

  it('offers nothing in a browser that can neither prompt nor be told how', () => {
    expect(offerKind(base)).toBeNull();
  });
});
