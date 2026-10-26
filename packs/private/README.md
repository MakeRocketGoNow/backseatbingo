# Private packs

Drop content packs you do not want in the public repo here as `*.json`, using the same shape as `../family.json`. Everything in this folder except this file is gitignored.

A private pack with the same `id` as a committed pack replaces it at build time, so a real `family` list here overrides the sample one in `../family.json` without touching tracked files.
