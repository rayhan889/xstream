# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is pnpm (`packageManager: pnpm@10.33.0`).

- `pnpm dev` — run the CLI directly via tsx (`src/cmd/cli.ts`)
- `pnpm watch` — run the CLI with tsx watch mode
- `pnpm check` — typecheck only (`tsc --noEmit`)
- `pnpm build` — compile to `dist/` (`tsc && tsc-alias`, needed to resolve `@/*` path aliases in output)
- `pnpm start` — run the compiled CLI from `dist/cmd/cli.js`

There is no test suite or lint config in this repo.

Example CLI invocation:
```
pnpm dev search -k "typescript" --auth-token $AUTH_TOKEN -l en
```
`AUTH_TOKEN` can be set via env var instead of `--auth-token`. `.env` is loaded automatically (`dotenv/config`) at CLI entry.

## Architecture

XStream is a CLI tool that scrapes X/Twitter search results by driving a real (stealth) headless browser rather than calling the X API directly.

Flow: `cmd/cli.ts` (Commander-based CLI, validates args, builds `StreamConfig` via the Zod schema in `schemas/stream.ts`) → `engine/stream.ts` (`XStreamer`, orchestrates the session) → `engine/browser.ts` (`launchBrowser`, launches `playwright-extra` Chromium with the stealth plugin and injects the `auth_token` cookie for `.x.com`) → `engine/interceptor.ts` (`XInterceptor`, attaches a Playwright `page.on("response")` listener) → `engine/parser.ts` (`parseTweetsFromResponse`, walks X's internal GraphQL `SearchTimeline` response shape to extract `Tweet` objects).

Key points:
- Authentication is cookie-based: the caller supplies their own X `auth_token` cookie value (from a logged-in browser session), not an API key.
- Tweet extraction works by intercepting the browser's own network responses to X's internal GraphQL endpoint (`/i/api/graphql/...SearchTimeline`), not by scraping the DOM or calling a public API. Parsing logic in `parser.ts` is tightly coupled to that undocumented response shape (`data.search_by_raw_query.search_timeline.timeline.instructions[].entries[]...tweet_results.result`) and will break if X changes it.
- Path alias `@/*` maps to `src/*` (see `tsconfig.json`); `tsc-alias` rewrites these in the compiled `dist/` output since `tsc` alone does not.
- `XStreamer.start()` currently navigates to the search URL, waits for the feed to appear, and tears down the browser — the interceptor collects tweets into memory but nothing yet reads/exports `capturedTweets` from the CLI.
- `types.ts`'s `Crawler` interface declares fields (`output`, `max`, `batchSize`, `batchDelay`, `db`) not yet wired into `StreamConfig`/`XStreamer` — these represent planned but unimplemented options (result limits, batching/pagination via cursor, output destination).
- Each module (`browser.ts`, `interceptor.ts`, `parser.ts`, `stream.ts`) creates its own `tslog` `Logger` instance scoped by name; log level is `DEBUG` unless `NODE_ENV=prod`, in which case it's `INFO`.
