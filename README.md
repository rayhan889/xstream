# XStream

Command line tool that streams X (Twitter) search results as NDJSON.

XStream opens the X search page in a headless Chromium browser, logged in with your own `auth_token` cookie. It reads tweets from the responses X sends to its own web app, reloads the page on a fixed interval, and prints each new tweet as one JSON object per line.

It does not use the official X API and needs no API key.

## Requirements

1. Node.js 22.12.0 or newer.
2. An X account that is logged in on a desktop browser.

## Installation

```sh
npm install -g @rayhan889/xstream
```

With pnpm:

```sh
pnpm add -g @rayhan889/xstream
```

Check the installation:

```sh
xstream --version
```

### Chromium

XStream needs a Chromium build that matches its Playwright version. On the first run, XStream checks for Chromium and downloads it if it is missing. The download happens once. Progress is printed to stderr, so it does not mix with the tweet output.

To download Chromium in advance, run:

```sh
npx playwright install chromium
```

On Linux, Chromium also needs system libraries. Install them once with:

```sh
sudo npx playwright install-deps chromium
```

## Getting your auth token

XStream logs in to X with the `auth_token` cookie from your browser.

1. Log in to https://x.com in Chrome, Firefox, or Edge.
2. Open the developer tools with F12, or Cmd+Option+I on macOS.
3. Open the Application tab. In Firefox, open the Storage tab.
4. Under Cookies, select `https://x.com`.
5. Find the row named `auth_token` and copy its value.

Treat this value like a password. Anyone who has it can use your X account. The token stops working when you log out of that browser session.

You can pass the token in three ways. XStream uses the first one it finds:

1. The `--auth-token` flag.
2. The `AUTH_TOKEN` environment variable.
3. A `.env` file in the directory you run XStream from:

```sh
AUTH_TOKEN=your_token_value
```

## Usage

```sh
xstream search -k "<query>" [options]
```

### Examples

Stream the latest tweets about GTA VI news to the terminal:

```sh
xstream search -k "gtavi"
```

Only English tweets, stop after 100 tweets:

```sh
xstream search -k "gtavi" -l en --max 100
```

Use X search operators:

```sh
xstream search -k "from:nodejs OR from:gtavi"
```

Write to a file, polling every 60 seconds:

```sh
xstream search -k "playwright" --interval 60 --output tweets.ndjson
```

Show the browser window while it runs:

```sh
xstream search -k "typescript" --no-headless
```

### Options

| Option                   | Description                                                                                     | Default       |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------- |
| `-k, --keywords <query>` | Search query. Supports X search operators such as `OR`, `from:`, `to:`, and `since:`. Required. |               |
| `--auth-token <token>`   | Your X `auth_token` cookie value. Required unless `AUTH_TOKEN` is set.                          | `AUTH_TOKEN`  |
| `-l, --lang <code>`      | Only return tweets in this language. Two letter ISO 639 code, for example `en` or `id`.         | All languages |
| `--interval <seconds>`   | Seconds between page reloads. Minimum 10.                                                       | `30`          |
| `--max <count>`          | Stop after this many tweets.                                                                    | No limit      |
| `--output <destination>` | `stdout` or a file path. Files are appended to, not overwritten.                                | `stdout`      |
| `--no-headless`          | Show the browser window.                                                                        | Headless      |
| `-V, --version`          | Print the version.                                                                              |               |
| `-h, --help`             | Print help.                                                                                     |               |

## Output

XStream writes one JSON object per line (NDJSON). Each tweet is written once per run. Within each reload, tweets are written oldest first.

```json
{
  "id": "1839000000000000000",
  "conversationId": "1839000000000000000",
  "fullText": "Example tweet text",
  "authorHandle": "example",
  "authorName": "Example User",
  "likeCount": 12,
  "replyCount": 3,
  "retweetCount": 1,
  "tweetUrl": "https://x.com/example/status/1839000000000000000",
  "postedAt": "2026-09-28T08:15:00.000Z",
  "scrapedAt": "2026-09-28T08:15:31.000Z"
}
```

| Field            | Type   | Description                            |
| ---------------- | ------ | -------------------------------------- |
| `id`             | string | Tweet ID.                              |
| `conversationId` | string | ID of the first tweet in the thread.   |
| `fullText`       | string | Tweet text.                            |
| `authorHandle`   | string | Author username, without `@`.          |
| `authorName`     | string | Author display name.                   |
| `likeCount`      | number | Likes when the tweet was read.         |
| `replyCount`     | number | Replies when the tweet was read.       |
| `retweetCount`   | number | Retweets when the tweet was read.      |
| `tweetUrl`       | string | Link to the tweet.                     |
| `postedAt`       | string | Time the tweet was posted, ISO 8601.   |
| `scrapedAt`      | string | Time XStream read the tweet, ISO 8601. |

Tweets go to stdout. Logs and status messages go to stderr. Redirecting stdout to a file or another program gives you only tweets.

## Rate limits

When X returns HTTP 429, XStream doubles the reload interval, up to a maximum of 5 minutes. It keeps that interval for the rest of the run.

## Troubleshooting

**`auth_token invalid or expired`**
X redirected to the login page. Copy a new `auth_token` from your browser.

**`Tweet feed not found`**
The search returned no results, or X changed its page layout. Try the same query on https://x.com/search. If results show there, run XStream with `--no-headless` to see what the browser shows.

**`Chromium install failed`**
The automatic download failed, usually because of a network or proxy problem. Run `npx playwright install chromium` yourself.

**Browser fails to start on Linux**
System libraries are missing. Run `sudo npx playwright install-deps chromium`.

## Limitations

1. XStream depends on the internal format of the X web app. When X changes that format, XStream can stop working until it is updated.
2. XStream acts as your own account. Heavy use can get the account rate limited or locked. Use a longer `--interval` for long runs.
3. Scraping may violate the X Terms of Service. You are responsible for how you use this tool.

## Development

```sh
git clone https://github.com/rayhan889/xstream.git
cd xstream
nvm use
pnpm install
```

| Command                             | Description                                  |
| ----------------------------------- | -------------------------------------------- |
| `pnpm dev search -k "typescript"`   | Run the CLI from source.                     |
| `pnpm watch search -k "typescript"` | Run from source and restart on file changes. |
| `pnpm check`                        | Type check.                                  |
| `pnpm build`                        | Compile to `dist/`.                          |
| `pnpm start search -k "typescript"` | Run the compiled CLI.                        |

## License

ISC. See [LICENSE](LICENSE).
