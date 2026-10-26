# Working in this repo

This repo is intended to be open source. Keep personal and proprietary material out of tracked files, commit messages and docs:

- Real content packs go in `packs/private/` (gitignored). `packs/family.json` is sample content only.
- The product plan with business details lives in `docs/private/` (gitignored). `docs/DESIGN.md` is the public version; add product decisions to its decisions log.
- No names, contact details, payment links or domains in code, comments or commit messages.

Conventions: TypeScript strict, game rules only in `game/` with Vitest tests, shared types in `shared/`, plain CSS, no new dependencies without a reason. See `docs/DESIGN.md`.
