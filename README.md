# Backseat Bingo

A free game for family car trips. Spot things out the window, call them first.

Two modes:

- **Called It**: one shared list, the first person to tap an item claims it. Most claims wins.
- **Bingo**: everyone gets a random 5x5 card. First to complete the pattern wins.

Phase 1 (this build) plays on a single phone: named players pass it around. Rooms with everyone on their own device come in Phase 2. See [docs/DESIGN.md](docs/DESIGN.md) for the design notes and decisions log.

## Develop

```bash
pnpm install
pnpm dev
```

```bash
pnpm test        # Vitest, game rules
pnpm typecheck   # tsc strict
pnpm build       # typecheck + Vite production build
```

## Layout

- `game/` pure game rules, no React or Cloudflare imports, unit tested. Both the local store and the future room Durable Object call these.
- `shared/` types used by the client and the Worker.
- `packs/` content packs as JSON. `family.json` is sample content; real lists go in the gitignored `packs/private/` and override a committed pack with the same id. Every pack is free in v1; `isPackUnlocked()` in `game/pack.ts` is the entitlement stub.
- `src/app/` React client: `screens/`, `components/`, `store/` (local game, packs via TanStack Query, settings), `router.tsx`.
