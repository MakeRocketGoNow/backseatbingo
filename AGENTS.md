# Working in this repo

This repo is public and source-available under the Elastic License 2.0 (see `LICENSE.md`). Keep personal and proprietary material out of tracked files, commit messages and docs:

- Real content packs go in `packs/private/` (gitignored). `packs/family.json` is sample content only.
- The product plan with business details lives in `docs/private/` (gitignored). `docs/DESIGN.md` is the public version; add product decisions to its decisions log.
- No names, contact details, payment links or domains in code, comments or commit messages.

Conventions: TypeScript strict, game rules only in `game/` with Vitest tests, shared types in `shared/`, plain CSS, no new dependencies without a reason. See `docs/DESIGN.md`.

## Commits

Atomic commits: one logical change per commit, with tests and docs for that change in the same commit. Do not bundle unrelated fixes with a feature, and do not split one change across commits that would not each build and pass tests on their own. The Phase 1 scaffold is the one exception, since nothing existed before it.
