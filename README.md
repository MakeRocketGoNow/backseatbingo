# Backseat Bingo

A free game for family car trips. Spot things out the window, call them first.

Two modes:

- **Called It**: one shared list, the first person to tap an item claims it. Most claims wins.
- **Bingo**: everyone gets a random 5x5 card. First to complete the pattern wins.

Play on one phone (named players pass it around) or start a trip: the host gets a 4-letter code and a QR link, everyone else joins from their own phone in any browser. See [docs/DESIGN.md](docs/DESIGN.md) for the design notes and decisions log.

## Develop

```bash
pnpm install
pnpm dev         # client on http://localhost:5173
pnpm api         # Worker + Durable Object on http://localhost:8787 (rooms)
```

Vite proxies `/api` to the Worker, so rooms work from the dev server. `pnpm api` serves the last `pnpm build` output as static assets, so run a build once before starting it. To act as a second player on the same machine, open the Worker's own origin, `http://localhost:8787`, which has separate browser storage and therefore a separate player token.

```bash
pnpm test                      # Vitest, game and room rules
pnpm typecheck                 # tsc strict, client and Worker
pnpm build                     # typecheck + Vite production build
node scripts/smoke-room.mjs    # end-to-end room flow against pnpm api
```

CI runs the tests and the build (which includes the typecheck) on every pull request and on pushes to `main`.

## Progressive web app

The production build is installable and opens offline. `vite.config.ts` emits `sw.js` from `sw/sw.ts` with the bundle's file list baked in; the worker precaches the shell and assets, serves every navigation from the cached shell, and never touches `/api/`. A new deploy installs in the background and the app offers "A new version is ready. Reload" rather than swapping assets under a game in progress.

The Vite dev server never registers the worker. To try it, build and open the Worker's origin (`pnpm api`) or `pnpm preview`; if a stale worker ever gets in the way there, unregister it from the browser's devtools. Icons are generated from the SVGs in `public/icons/` by `scripts/icons.sh` (needs `rsvg-convert`).

The winner screen's tip line reads its link from `VITE_TIP_URL`. `.env` holds a placeholder; put the real link in `.env.local`, which is gitignored. An empty value hides the line.

## Deploy

Every push to `main` that passes the checks deploys from the same workflow. It needs two repository secrets, `CLOUDFLARE_API_TOKEN` (an API token with the Workers Scripts edit permission) and `CLOUDFLARE_ACCOUNT_ID`, and reads the tip link from an optional `VITE_TIP_URL` secret; with that one unset the tip line is hidden rather than built with the placeholder. The job uses the `production` environment, so protection rules such as a required reviewer can be added there.

Pull requests can get a preview of their own: set the `CLOUDFLARE_WORKERS_SUBDOMAIN` repository variable to the account's workers.dev subdomain (the part before `.workers.dev`) and `.github/workflows/previews.yml` deploys each PR as its own Worker, `backseatbingo-pr-<number>`, comments the URL on the PR, and deletes the Worker when the PR closes. A preview has rooms of its own, since Durable Objects belong to the Worker that declares them, and its own rate-limit counters from the `preview` env in `wrangler.jsonc`, so it never touches production. Until the variable is set, the preview jobs skip themselves.

To deploy by hand instead:

```bash
pnpm exec wrangler login       # once
pnpm deploy                    # build, then wrangler deploy
```

The Worker serves the static client and the `/api/*` routes from one deployment. Rooms are Durable Objects with WebSocket hibernation and delete themselves 24 hours after the last message.

## Layout

- `game/` pure game rules, no React or Cloudflare imports, unit tested. Both the local store and the room Durable Object call these.
- `shared/` types used by the client and the Worker.
- `packs/` content packs as JSON. `family.json` is sample content; real lists go in the gitignored `packs/private/` and override a committed pack with the same id. Every pack is free in v1; `isPackUnlocked()` in `game/pack.ts` is the entitlement stub.
- `src/app/` React client: `screens/`, `components/` (boards shared by local and room play, and room controls used on more than one screen), `store/` (local game, room connection, packs via TanStack Query, settings), `router.tsx`.
- `worker/` Cloudflare Worker entry and the room Durable Object. Rules are not here; they are in `game/room.ts`. `stored.ts` holds the room's pure token bookkeeping, unit tested like `game/`.
- `scripts/` the room smoke test.

## License

Backseat Bingo is source-available under the [Elastic License 2.0](LICENSE.md) (`Elastic-2.0`). You can use it, modify it and redistribute the source; you cannot offer it to others as a hosted or managed service.
