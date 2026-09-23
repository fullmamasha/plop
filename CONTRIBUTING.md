# Contributing to Plop

Issues and pull requests are welcome. This file is everything you need to run
Plop from source and find your way around it.

## Running it

```bash
npm install
npm run dev        # design gallery and field test
npm test           # unit checks
npm run typecheck  # strict TypeScript
npm run build      # the extension, into dist/
npm run package    # a Chrome Web Store zip, into Versions/
```

`npm run dev` serves two pages:

- `/` a gallery of every surface in both themes, for comparing against the
  design.
- `/test` a field test with a real upload control, real clipboard access and
  real stored files.

To try the real extension, run `npm run build` and load `dist/` in
`chrome://extensions` with developer mode on. After a rebuild, press reload on
Plop's card there and refresh the page you are testing.

## Layout

```
src/
  background/   service worker: update handling and the keyboard shortcut
  content/      the part that runs on a page: detection and interception
  popup/        the extensions-menu settings panel
  ui/           widget, settings, and the pieces they share
  styles/       design tokens and component styles
  assets/       icons and the logo
scripts/        build, manifest generation, packaging
dev/            gallery and field test, never shipped
docs/           the project site, served by GitHub Pages
test/           unit checks
```

Two things about the build are worth knowing before it surprises you:

- **The content script is built separately**, as one self-contained file.
  Chrome loads a content script as a classic script with no module loader, so
  it cannot have imports. That is why `scripts/build.mjs` runs Vite twice.
- **The version lives only in `package.json`.** `manifest.json` is generated
  from it at build time, and CI fails if the two ever disagree.

## Pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  titles: `fix:`, `feat:`, `docs:`, `chore:`.
- Keep `main` buildable.
- Make sure `npm test`, `npm run typecheck` and `npm run build` all pass.
- Non-trivial logic comes with a check in `test/`. There is no framework; the
  tests are plain `node:test`.
- Match the surrounding code. Comments explain *why*, not *what*.

## Design changes

The interface follows a Figma source of truth, and the values behind it —
colours, sizes, radii, motion — live in `src/styles/tokens.css`. Components
read tokens rather than hardcoding values. If a change needs a value that is
not there, add it to the tokens rather than to the component.

## Releases

Maintainer only. Bump the version in `package.json`, add a `CHANGELOG.md`
entry, then tag `vX.Y.Z` and push the tag. CI checks that the tag matches
`package.json`, builds, packages, and publishes the release with the zip
attached. The zip is uploaded to the Chrome Web Store by hand; the store, not
GitHub, is what installed copies update from.
