@./rules/verified-claims.md

# THIS REPOSITORY

A Claude Code mod (a plugin with a hooks module): the Usage pane on the right,
or the band above the prompt. It started as a fork of
anantraghunath/claude-code-usage-quota-mod and is now maintained separately at
endavis/claude-code-usage-quota-mod. The `upstream` remote still points at the
original, for fetching its fixes; never push or open PRs there.

- `hooks/register.tsx`: all of the mod. `hooks/hooks.json` names it as the one module.
- `types/index.d.ts`: the mod's state (`PluginState['usage-quota']`) and its shapes.
- `.claude-plugin/plugin.json`: the manifest, `userConfig` (each `/config` row) included.
- `tests/*.test.tsx`: `claude-code/testing` tests, one `world()` of engine mocks per file.

# COMMANDS

Run the tests from the parent directory:

```bash
cd .. && claude plugin test ./claude-code-usage-quota-mod
```

Try it live in a session of its own: `claude --plugin-dir <path to this repo>`.
`/reload-plugins` there re-reads it after a change.

# MOD API GOTCHAS (each hit in practice)

- `hooks.json` `modules` takes one entry. Split code into files imported from
  `register.tsx` (`import { x } from './file'`).
- An event registered without a matcher may be registered once per plugin
  (`session.start`, `turn.complete`, `classic.Stop`, ...). Add to the existing
  hook, or give the new one a matcher.
- `$.tool.call` from a test drops `agentId`: a test cannot act as a subagent.
  Test such rules through an exported pure function.
- In tests: `ui.find({ text })` matches a substring (`'line 1'` finds
  `line 100`), so anchor a RegExp; `mock.store` returns nothing and the test's
  `$` has no store; registering one event twice in a test's world fails to load.
- What the engine shows a mod about background shells, measured with a probe,
  is on issue #1.

# CONVENTIONS

- Match the code around a change: lowercase comments that say why, the
  palette tokens (`MUTED`, `AMBER`, ...), `$.ui.log(..., { to: 'debug' })` for
  failures, `.catch(($, e, next) => next(e))` on hooks that must never hold
  an event back.
- Logic worth testing goes in an exported pure function with a test in `tests/`.
- A new part of the pane gets a `show_<part>` setting: `SHOW_KEYS`, `FIELDS`,
  `plugin.json` `userConfig`, and the field counts in `tests/pane.test.tsx`.
- The README documents each part, and its Privacy section lists every file the
  mod reads, every program it runs and every hook it adds.

# WORKFLOW

- Issue → branch → PR on endavis/claude-code-usage-quota-mod. Never commit to `main`.
- Commit subjects are plain sentences in the repo's existing style, not
  conventional commits.
- A release is its own commit, `vX.Y.Z: <what changed>`: the version in
  `plugin.json` and `marketplace.json`, a new `docs/badges/version-vX.Y.Z.svg`
  (a copy of the last with the number changed) and the README badge pointing at it.
