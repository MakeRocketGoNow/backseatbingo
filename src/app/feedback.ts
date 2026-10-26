import { settingsStore } from './store/settings';

// Sound is off by default (the driver is nearby). A single short tone from an
// oscillator keeps us free of audio assets.
let ctx: AudioContext | null = null;

export function playClaimSound() {
  if (!settingsStore.read().sound) return;
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // no audio available
  }
}

export function haptic(pattern: number | number[] = 30) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}

export function claimFeedback() {
  haptic(30);
  playClaimSound();
}

export function winFeedback() {
  haptic([40, 60, 40, 60, 80]);
  playClaimSound();
}
