#!/usr/bin/env node
import "dotenv/config";
import * as path from "node:path";
import * as fs from "node:fs";
import { type StreamConfig, StreamSchema } from "@/schemas/stream";
import { Command, InvalidArgumentError } from "commander";
import { XStreamer } from "@/engine/stream";
import { NdjsonStdoutSink } from "@/sinks/ndjson";
import { Tweet, TweetSink } from "@/types";
import { ZodError } from "zod";
import { createLogger } from "@/logger";

const { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"),
) as { version: string };

const program = new Command();

function exitOnError(err: { exitCode: number }): never {
  process.exit(err.exitCode);
}

const ISO_639_1 = /^[a-z]{2}$/i;
function parseLang(value: string): string {
  if (!ISO_639_1.test(value)) {
    throw new InvalidArgumentError(
      "Language must be an ISO 639-1 two-letter code (e.g. en, es).",
    );
  }
  return value.toLowerCase();
}

class NdjsonFileSink implements TweetSink {
  private readonly stream: fs.WriteStream;

  constructor(path: string) {
    this.stream = fs.createWriteStream(path, { flags: "a" });
  }

  public async write(tweet: Tweet): Promise<void> {
    const line = JSON.stringify(tweet) + "\n";
    if (this.stream.write(line)) return;
    await new Promise<void>((resolve) => this.stream.once("drain", resolve));
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.stream.end((error: NodeJS.ErrnoException | null | undefined) =>
        error ? reject(error) : resolve(),
      );
    });
  }
}

function createSink(output: string): TweetSink {
  return output === "stdout"
    ? new NdjsonStdoutSink()
    : new NdjsonFileSink(output);
}

program
  .name("xstream")
  .description("CLI for xstream")
  .version(version)
  .showHelpAfterError("(add --help for additional information)")
  .showSuggestionAfterError(true)
  .exitOverride(exitOnError)
  .addHelpText(
    "after",
    `
Examples:
  $ xstream search -k "bagong bali" --auth-token $AUTH_TOKEN
  $ xstream search -k "from:atmadja_ OR hendraatmajda" -l en --auth-token $AUTH_TOKEN
  $ AUTH_TOKEN=xxxx xstream search -k "typescript"
`,
  );

program
  .command("search")
  .description("Search and scrape tweets matching the given keywords")
  .showHelpAfterError("(add --help for additional information)")
  .showSuggestionAfterError(true)
  .exitOverride(exitOnError)
  .requiredOption(
    "-k, --keywords <query>",
    "Search keywords (supports X search operators like OR, from:, etc.)",
  )
  .requiredOption(
    "--auth-token <token>",
    "Your X/Twitter auth_token cookie value (required, falls back to AUTH_TOKEN env var)",
    process.env.AUTH_TOKEN,
  )
  .option(
    "-l, --lang <code>",
    "Language filter (ISO 639-1 code, omit for all languages)",
    parseLang,
  )
  .option("--no-headless", "Run with visible browser UI (default: headless)")
  .option(
    "--interval <seconds>",
    "Polling interval between refetches, in seconds (min 10)",
    "30",
  )
  .option("--max <count>", "Stop after emitting this many tweets")
  .option(
    "--output <destination>",
    "Where to write NDJSON output: 'stdout' or a file path",
    "stdout",
  )
  .action(async (rawOptions: Record<string, unknown>) => {
    const logger = createLogger("CLI");

    try {
      const streamConfig: StreamConfig = StreamSchema.parse(rawOptions);
      const { keywords, lang, authToken, headless } = streamConfig;

      if (process.stdout.isTTY) {
        console.error(`XStream | v${version}`);
        console.error("-".repeat(50));
        console.error(`Keywords: ${keywords}`);
        console.error(`Auth Token: ${authToken ? "Provided" : "Not Provided"}`);
        console.error(`Language: ${lang || "All"}`);
        console.error(`Headless Mode: ${headless ? "Enabled" : "Disabled"}`);
        console.error("-".repeat(50) + "\n");
      }

      const sink = createSink(streamConfig.output);
      const crawler = new XStreamer(streamConfig, sink);

      let shuttingDown = false;
      const onSignal = (signal: NodeJS.Signals) => {
        if (shuttingDown) {
          logger.warn(`Received second ${signal}, forcing exit.`);
          process.exit(128 + (signal === "SIGINT" ? 2 : 15));
        }
        shuttingDown = true;
        logger.warn(`Received ${signal}, shutting down gracefully...`);
        crawler.stop();
      };
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);

      await crawler.start();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues
          .map((issue) => `- ${issue.message}`)
          .join("\n");
        console.error(`Validation Error:\n${issues}`);
        process.exit(2);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to run search: ${message}`);
        process.exit(1);
      }
    }
  });

program.parse(process.argv);
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
