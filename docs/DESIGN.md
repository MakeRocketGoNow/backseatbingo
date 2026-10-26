# Backseat Bingo: design notes

The game design and technical conventions behind the app. Product decisions are recorded in the decisions log at the end.

## Modes

- **Called It** (internal name `spotit`, the primary mode). Everyone sees the same list of things to spot. The first person to see an item and tap it claims it, and claimed items lock for everyone else. Most claims when the list is exhausted, or when the host ends the game, wins. Listed first in Setup, selected by default, and the default on "play again". The label "Spot It" is never used in the UI; it is a trademarked card game.
- **Bingo** (secondary). Each player gets a randomized 5x5 card drawn from the pack with a free center square. Tap to mark. First to complete the chosen pattern (any line, four corners, X, blackout) wins.

Items are deliberately specific ("a red barn", "a billboard for a personal injury lawyer"), not generic ("a car").

## Stack

- **Frontend:** React + TypeScript + Vite, built as a PWA. Mobile-first and small, because it runs on old tablets and hand-me-down phones. TanStack Router for screens and deep links, TanStack Query for pack loading and local stores.
- **Backend (Phase 2):** Cloudflare Workers + Durable Objects, one DO per room, WebSocket hibernation so idle rooms cost nothing. Full-snapshot broadcasting; rooms are small and state is a few KB, so no event sourcing or diff sync.
- **Stores:** Android via Trusted Web Activity, iOS via a Capacitor wrapper, both later phases. Guests never need the app; the join link opens the PWA in any browser.

## Content packs

Packs are JSON data from day one, in `packs/`. `id` is a stable slug and `text` is display copy. Every pack is free in v1; `isPackUnlocked(packId)` in `game/pack.ts` always returns true and is the one function billing would replace later.

Custom lists are packs the host creates on their device (name plus one line per item), stored in localStorage. In Phase 2 they ship to guests as part of room state.

Private packs go in `packs/private/` (gitignored) and override a committed pack with the same id.

Content guidelines: nothing that would push a store age rating above 12+, no drinking references, no partisan packs.

## Screens

Home, Setup, Lobby and Join (Phase 2), Called It game, Bingo game, Winner, Custom lists.

Design direction: big tap targets (a kid in a moving car), high contrast, readable in sunlight, no small text. Dark mode follows `prefers-color-scheme`. Sound is optional and off by default. Haptic feedback on claim where available.

## Conventions

- TypeScript strict, no `any`.
- Game rules live in the pure `game/` module with no React or Cloudflare imports, unit tested with Vitest. The local store and the room DO call the same functions.
- Shared types in `shared/`.
- Minimal dependencies: React, the two TanStack libraries, plain CSS. A QR library is fine when rooms arrive.
- Commit after each phase with a summary of what works and what does not.
- When a product decision is not covered here, ask rather than guess.

## Phases

1. **Local game.** Both modes on one device, pass-and-play Bingo, pack loading, custom lists. No backend.
2. **Rooms.** Worker + DO, lobby, join flow, reconnect, host controls.
3. **PWA polish.** Manifest, service worker, install prompt for the host, offline fallback to local mode.
4. **Android.** TWA package and store listing.
5. **iOS.** Capacitor shell with haptics, share sheet, keep-awake.

## Decisions log

- **2026-10-26, Called It on a single device.** Local mode is a real multi-player game, not a checklist. Setup takes 1 to 8 player names. Tapping an unclaimed chip opens a "Who called it?" picker with one button per player; with a single player the tap claims directly. The same names drive Bingo pass-and-play, capped at 4 cards.
- **2026-10-26, host undo.** No confirmation dialog. Tapping a claimed chip opens a sheet naming the claimer with Undo and "Give it to someone else" (reassign). Reaching Undo already takes two deliberate taps.
- **2026-10-26, host approvals.** A room setting for Phase 2, not Phase 1: "auto" (tap claims, host can undo) or "host approves" (tap creates a pending claim the host accepts or rejects). `Claim.status` already allows `'pending'` so the game module needs no reshaping. On one device the host is the one tapping, so there is nothing to approve.
- **2026-10-26, routing.** TanStack Router from the start so every screen has a URL and `/j/<CODE>` is just another route. The route exists now as a placeholder page. TanStack Query handles pack loading and the custom-list store and will carry the create-room call; WebSocket room state will not go through Query.
- **2026-10-26, Home label.** "Play solo" became "Play on this phone", since local mode supports several named players.
- **2026-10-26, resume.** An in-progress local game is persisted to localStorage and Home offers "Resume" so a reload or a phone sleep does not lose the board. Ended games are kept until the next game starts.
- **2026-10-26, "play again".** Returns to Setup with the pack and player names remembered and the mode reset to Called It.
- **2026-10-26, sample content.** `packs/family.json` holds sample items. Real lists live in `packs/private/`.
