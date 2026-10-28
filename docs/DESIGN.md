# Backseat Bingo: design notes

The game design and technical conventions behind the app. Product decisions are recorded in the decisions log at the end.

## Modes

- **Called It** (internal name `spotit`, the primary mode). Everyone sees the same list of things to spot, and every player can cross off every item, once each. A call is one sighting: for a short claim window (`CLAIM_WINDOW_MS`, ten seconds) after one player calls an item it is greyed for everyone else and shows who called it, then it is open again for the players who do not have it yet. First to cross off the whole list wins; if the host ends the game first, the most items wins, ties shared. Listed first in Setup, selected by default, and the default on "play again". The label "Spot It" is never used in the UI; it is a trademarked card game.
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
3. **PWA polish.** Manifest, service worker, install prompt for the host, offline fallback to local mode, tip line.
4. **Android.** TWA package and store listing.
5. **iOS.** Capacitor shell with haptics, share sheet, keep-awake.

## Rooms

The host creates a room (`POST /api/rooms`, rate limited per IP) sending the full pack, so the Worker knows nothing about packs and custom lists reach guests as part of room state. Room lookups and socket upgrades are rate limited per IP too, because four-letter codes are few enough to guess. Each device has a random token in localStorage; the Durable Object maps tokens to player ids and never sends the map to clients. Clients always send `join` after connecting; a known token makes that a reconnect, so there is no separate reconnect path. `join` always carries sequence number 0, so its acknowledgement never covers queued taps. A socket for a room that does not exist (closed while a phone slept, or expired) is accepted and closed at once with code 4002, because a refused handshake looks to the browser like lost signal and the client would retry forever. The socket URL carries the client's protocol version as `v`; one older than the server's minimum is closed the same way with code 4003, and the app asks the player to reload (switching to the waiting service worker first, since a plain reload would serve the same cached build). No `v` counts as version 1.

The DO broadcasts the whole room after every change. Each client message carries a sequence number; the server acknowledges it on the sender's next snapshot or rejects it with an error that names the sequence. The client keeps unacknowledged taps in a queue, replays them through `game/room.ts` on top of the latest snapshot so the UI responds instantly even offline, and drops them once acknowledged or rejected. `join` also carries a random session id per connection object; the room remembers the highest sequence number it applied for each device and session, and answers a resend at or below it with a fresh acknowledgement instead of applying it twice (a socket can die after the room applies a tap but before the ack arrives). Game taps carry the round they were made in; the room rejects a tap from an earlier round, and the client stops replaying them when a new round arrives, so a tap queued offline never lands on the next round's list or card. Only game actions are replayed (claim, unclaim, reassign, approve, mark, unmark, bingo); round and membership changes wait for the server.

Host approvals is a room setting: "auto" claims on tap and the host can undo; "host approves" makes guest claims pending (they still start the claim window and hold the item for that guest) until the host approves or rejects. The host's own claims never wait.

## Offline and install

The service worker is hand-written (`sw/`) and emitted by a small Vite plugin rather than a PWA plugin: the bundle is a handful of files and the rules are three lines (precache the shell and hashed assets, serve navigations from the cached shell, never cache `/api/`). A new build waits instead of taking over, because a page mid-game must keep the assets it was built with; the app offers a reload. Home says when there is no signal and points at local play. Install is offered to the host only, on the room winner screen, once a trip has gone well; Chrome's prompt where it exists, a Share menu pointer on iOS Safari, nothing once installed or declined.

## Decisions log

- **2026-10-28, Called It rules.** Items no longer lock after one claim; every player can cross off every item, with a ten-second claim window per call so two phones cannot claim one sighting. Playtesting showed lock-out burns the game out early: once the fastest player has most of the list, the others have nothing left to look for, and a car game has to last the trip. This replaced the old rule rather than becoming a third mode, because the difference is a rule and not a game shape, Setup gets no new option, and there is no installed base yet. The window is fixed, not a setting. It is judged on the room's clock (claim times are the server's, the client compares with its own clock when it replays queued taps), so a phone whose clock is seconds off sees the window open a little early or late; the server's answer still wins. Undo, reassign and approve now act on one player's call, so the protocol version rose to 2 with a minimum of 2.

- **2026-10-26, deploys.** Every green push to `main` goes live; there is no release step. Same-repository PRs get a throwaway preview Worker with its own rooms and rate limits, deleted when the PR closes. Production's tip link comes from a CI secret, and the tip line stays hidden until that secret is set.

- **2026-10-26, protocol version.** The installed app serves its cached build until someone taps Reload, so a phone can meet a newer server. The version is checked when the socket opens, not in `join`, because a change to `join` itself would fail message validation before a version inside it could be read. The server compares against a minimum rather than an exact version: a bump of the minimum sends every open trip on an older build to a reload (a deploy reconnects every socket), so it is raised only for changes that break older clients. This is the one case where an update interrupts a game, because the alternative is a game that silently stops working.

- **2026-10-26, Phase 3 scope.** No PWA plugin; the worker is a few lines and the plugin that emits it is smaller than the configuration one would need. Updates never interrupt a game. The tip link is a build-time variable left empty in the repo, so the public source never carries the real link and a build without it shows no tip line, and the same mechanism hides the line in the iOS build.

- **2026-10-26, Phase 2 scope.** No renaming mid-game. Host approvals ship in Phase 2 with "auto" as the default.
- **2026-10-26, new rounds.** "Play again" in a room starts the next round immediately with the host's chosen settings rather than returning everyone to the lobby; latecomers can still join mid-game. The lobby exists for the first gathering only.
- **2026-10-26, host leaving.** The host leaving closes the room for everyone. Guests leaving are removed from the trip. A guest who leaves mid-round stays in that round's game marked as left: their claims, card and score stand, their name stays taken, and they drop out of the reassign picker and the "everyone has bingo" check (so leaving can end a Bingo round). Rejoining during the round gives everything back; the next round starts without them, and their token then rejoins as a new player. Most people who leave a moving car's game did not mean to, so leaving should cost them nothing and hand nobody else their points. A round lists at most twice the room size, counting people who left.
- **2026-10-26, local testing of rooms.** Two players on one machine use two origins (the Vite dev server and the Worker's own port) so each gets its own player token.

- **2026-10-26, Called It on a single device.** Local mode is a real multi-player game, not a checklist. Setup takes 1 to 8 player names. Tapping an unclaimed chip opens a "Who called it?" picker with one button per player; with a single player the tap claims directly. The same names drive Bingo pass-and-play, capped at 4 cards.
- **2026-10-26, host undo.** No confirmation dialog. Tapping a claimed chip opens a sheet naming the claimer with Undo and "Give it to someone else" (reassign). Reaching Undo already takes two deliberate taps.
- **2026-10-26, host approvals.** A room setting for Phase 2, not Phase 1: "auto" (tap claims, host can undo) or "host approves" (tap creates a pending claim the host accepts or rejects). `Claim.status` already allows `'pending'` so the game module needs no reshaping. On one device the host is the one tapping, so there is nothing to approve.
- **2026-10-26, routing.** TanStack Router from the start so every screen has a URL and `/j/<CODE>` is just another route. The route exists now as a placeholder page. TanStack Query handles pack loading and the custom-list store and will carry the create-room call; WebSocket room state will not go through Query.
- **2026-10-26, Home label.** "Play solo" became "Play on this phone", since local mode supports several named players.
- **2026-10-26, resume.** An in-progress local game is persisted to localStorage and Home offers "Resume" so a reload or a phone sleep does not lose the board. Ended games are kept until the next game starts.
- **2026-10-26, "play again".** Returns to Setup with the pack and player names remembered and the mode reset to Called It.
- **2026-10-26, sample content.** `packs/family.json` holds sample items. Real lists live in `packs/private/`.
- **2026-10-26, list size in rooms.** A room takes lists of up to 150 items of up to 100 characters (it was 500 of 200). Every update a room sends carries the list, and a long Called It game copies all of it, so at the old cap one update could be 100-250 KB on car signal. Real lists are far smaller. We kept sending the full snapshot rather than dropping the list during play, because the cap alone bounds the worst case.
- **2026-10-27, brand.** Nunito is the typeface, self-hosted so it works offline. The accent is a deep violet (a light lavender in dark mode) and wins are lime; because lime is pale, win surfaces carry a darker `--win-border` so their edge still reaches 3:1 on white. The logo is a highway shield holding a B drawn as a road with a dashed centre line, with a speech bubble and an exclamation mark for the call. Every text pairing meets WCAG AA (4.5:1) and every fill or border that marks state meets 3:1, in both light and dark mode. A marked bingo square uses its own `--mark` tokens instead of the accent.
