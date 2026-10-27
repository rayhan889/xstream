# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is pnpm (`packageManager: pnpm@10.33.0`). `.nvmrc` pins Node 24; `engines` requires `>=22.12.0`. `pnpm install` runs `husky` through `prepare`, which installs the git hooks.

- `pnpm dev <args>` — run the CLI from source via tsx, e.g. `pnpm dev search -k "typescript" -l en`
- `pnpm watch <args>` — same, restarting on file change
- `pnpm check` — typecheck only (`tsc --noEmit`). It is also the pre-commit hook and the first CI step.
- `pnpm build` — `clean` + `tsc` + `tsc-alias`. `tsc-alias` is required because it rewrites the `@/*` imports in `dist/`.
- `pnpm start <args>` — run `dist/cmd/cli.js`
- Smoke test, as CI runs it: `node dist/cmd/cli.js --version` and `node dist/cmd/cli.js --help`

There is no test suite, no lint config, and therefore no single-test command. Verify with `pnpm check`. For changes to scraping, run against real X with a valid token. `parseTweetsFromResponse` (`src/engine/parser.ts`) is pure, so you can check it offline by passing it a saved SearchTimeline JSON body.

`AUTH_TOKEN` can come from the environment or from `--auth-token`. `.env` is loaded by `dotenv/config` at CLI entry and is gitignored. Never print or commit the token.

## Git and CI

- Commits must follow Conventional Commits. The `commit-msg` hook runs commitlint, and the PR-title workflow checks PR titles the same way.
- Merges to `main` run release-please (`release-please-config.json`). It owns the version bump and changelog, based on `feat`/`fix`/`perf`/`refactor` commits. Don't edit the version in `package.json` or `.release-please-manifest.json` by hand.
- The release workflow publishes to npm. It uses the Node version from `.nvmrc`.
- CI (`.github/workflows/ci.yml`) runs `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, the smoke test, and `npm pack --dry-run`, on Node 22, 24, and 26.

## Architecture

Pipeline: `cmd/cli.ts` → `engine/stream.ts` (`XStreamer`) → `engine/browser.ts`, `engine/interceptor.ts`, `engine/parser.ts`, `engine/rate-limit.ts` → a `TweetSink`.

**Entry (`src/cmd/cli.ts`).** Commander parses the flags. `StreamSchema` (zod, `src/schemas/stream.ts`) validates and coerces them into `StreamConfig`. Validation errors exit with code 2 and runtime errors with code 1. The sink is chosen here: `NdjsonStdoutSink` (`src/sinks/ndjson.ts`), or the file sink defined in `cli.ts`, which appends. The first SIGINT or SIGTERM calls `XStreamer.stop()` for a graceful shutdown. A second signal forces exit.

**Session (`XStreamer.start` in `engine/stream.ts`).** It launches the browser, attaches the interceptor to the page, and navigates to the live search URL. If the URL ends up on `/login` or `/i/flow`, the token is invalid. The run then waits for `[data-testid="cellInnerDiv"]` and enters `pollLoop`. The `finally` block closes the browser and the sink.

**Tweets come from two channels that share one listener.**
1. Passive: `XInterceptor` (`engine/interceptor.ts`) listens to every page `response` and matches `/i/api/graphql/` with `SearchTimeline`. It parses the body with `parser.ts`, which walks `data.search_by_raw_query.search_timeline.timeline.instructions[].entries[]`. It also saves the successful request as a `RequestTemplate` (URL, method, headers, body). Cookies, `sec-*` headers, and anything in `UNREPLAYABLE_HEADERS` are dropped.
2. Active: `pollLoop` replays that template with `page.evaluate(fetch(..., { credentials: "include" }))`. The page supplies the cookies and the `ct0` CSRF header, so Node never handles auth itself. The refetch's response goes through the same interceptor listener. The `refetch` result carries only status and headers, which feed rate limiting and failure counting.

**Recovery.** A refetch status other than 200 or 429 counts as a failure. After `MAX_REFETCH_FAILURES` (3) in a row, `pollLoop` clears the template and reloads the page. The reload captures a fresh template from its SearchTimeline response. A 429 is not a failure. It is handled by pacing.

**Pacing (`engine/rate-limit.ts`, `RateLimitTracker`).** It reads `x-rate-limit-{limit,remaining,reset}`. It spreads requests evenly over the remaining budget until reset, keeping 2 requests in reserve. On a 429 it blocks until the reset time. Without reset headers it backs off exponentially, from 60s up to 5 minutes. `--interval` is the floor, and `nextDelay` adds up to 10% jitter.

**Dedup and output.** `handleTweets` drops IDs already in `seenIds`, which holds at most 10,000 entries and evicts the oldest. Each batch is sorted oldest first. Once `--max` is reached, the run stops.

## Invariants and gotchas

- stdout carries only NDJSON tweets. Logs go to stderr through the tslog transport in `src/logger.ts`. Don't `console.log` or write to stdout anywhere else.
- Each module gets its logger from `createLogger(name)`. The level is DEBUG unless `NODE_ENV=prod`, which sets INFO.
- The project compiles to CommonJS (there is no `"type": "module"`). `cli.ts` uses `__dirname` and `browser.ts` uses `require.resolve`. Switching to ESM means changing both.
- `browser.ts` downloads Chromium on first run if the Playwright executable is missing. It runs through `playwright-extra` with the stealth plugin.
- `extractCursor` in `parser.ts` is exported but unused, so cursor pagination isn't wired up.
- `README.md` lags the code. Its `--interval` minimum and default (10 and 30) differ from `schemas/stream.ts` (2 and 5), and its description of fixed-interval page reloads predates the in-page refetch. Trust the source.
