import { StreamConfig } from "@/schemas/stream";
import { Tweet, TweetSink } from "@/types";
import { Browser, BrowserContext, Page } from "playwright";
import { Logger } from "tslog";
import { createLogger } from "@/logger";
import { launchBrowser } from "./browser";
import { XInterceptor } from "./interceptor";

const MAX_INTERVAL_MS = 5 * 60_000;
const MAX_SEEN_IDS = 10_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export class XStreamer {
  private readonly streamConfig: StreamConfig;
  private readonly sink: TweetSink;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly logger: Logger<Record<string, unknown>>;
  private readonly interceptor: XInterceptor;
  private readonly seenIds: Set<string> = new Set();
  private readonly abortController = new AbortController();
  private intervalMs: number;
  private emittedCount = 0;

  constructor(streamConfig: StreamConfig, sink: TweetSink) {
    this.streamConfig = streamConfig;
    this.sink = sink;
    this.intervalMs = streamConfig.interval * 1000;
    this.logger = createLogger("XStreamer");
    this.interceptor = new XInterceptor(
      (tweets) => this.handleTweets(tweets),
      () => this.handleRateLimit(),
    );
  }

  public stop(): void {
    this.abortController.abort();
  }

  public async start(): Promise<void> {
    try {
      this.logger.info("Starting XStreamer...");
      const { browser, context } = await launchBrowser(this.streamConfig);
      this.browser = browser;
      this.context = context;
      this.page = await this.context.newPage();

      if (this.interceptor && this.page) {
        this.logger.debug("Attaching interceptor to the page...");
        this.interceptor.attach(this.page);
      }

      const searchUrl = this.buildSearchUrl(
        this.streamConfig.keywords,
        this.streamConfig.lang,
      );

      this.logger.info(`Navigating to search URL: ${searchUrl}`);
      await this.page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      this.assertAuthenticated(this.page);

      const feedAppeared = await this.page
        .waitForSelector('[data-testid="cellInnerDiv"]', { timeout: 30000 })
        .then(() => true)
        .catch(() => false);

      if (!feedAppeared) {
        this.logger.error(
          "Failed to detect the tweet feed. The page may have changed or the search returned no results.",
        );
        throw new Error(
          "Tweet feed not found. Please check your keywords and try again.",
        );
      }

      this.logger.info("Tweet feed detected. Streaming tweets...");

      await this.pollLoop(this.page);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error during streaming: ${message}`);
      throw error;
    } finally {
      await this.cleanup(this.page, this.context, this.browser);
      await this.sink.close();
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }

  private async pollLoop(page: Page): Promise<void> {
    const signal = this.abortController.signal;

    while (!signal.aborted) {
      await sleep(this.intervalMs, signal);
      if (signal.aborted) break;

      await page
        .reload({ waitUntil: "domcontentloaded", timeout: 60000 })
        .catch((error) => {
          this.logger.warn(`Failed to reload search page: ${error}`);
        });
      if (signal.aborted) break;

      await page
        .waitForSelector('[data-testid="cellInnerDiv"]', { timeout: 30000 })
        .catch(() => {
          this.logger.warn("Tweet feed not detected after reload.");
        });
    }
  }

  private assertAuthenticated(page: Page): void {
    const url = page.url();
    if (url.includes("/login") || url.includes("/i/flow")) {
      throw new Error(
        "auth_token invalid or expired: X redirected to the login flow.",
      );
    }
  }

  private handleTweets(tweets: Tweet[]): void {
    const fresh = tweets
      .filter((tweet) => !this.seenIds.has(tweet.id))
      .sort(
        (a, b) =>
          new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime(),
      );

    for (const tweet of fresh) {
      if (
        this.streamConfig.max !== undefined &&
        this.emittedCount >= this.streamConfig.max
      ) {
        this.stop();
        return;
      }

      this.rememberSeen(tweet.id);
      this.sink.write(tweet);
      this.emittedCount++;
    }

    if (
      this.streamConfig.max !== undefined &&
      this.emittedCount >= this.streamConfig.max
    ) {
      this.stop();
    }
  }

  private rememberSeen(id: string): void {
    if (this.seenIds.size >= MAX_SEEN_IDS) {
      const oldest = this.seenIds.values().next().value;
      if (oldest !== undefined) this.seenIds.delete(oldest);
    }
    this.seenIds.add(id);
  }

  private handleRateLimit(): void {
    const nextInterval = Math.min(this.intervalMs * 2, MAX_INTERVAL_MS);
    if (nextInterval !== this.intervalMs) {
      this.intervalMs = nextInterval;
      this.logger.warn(
        `Rate limited by X. Backing off polling interval to ${this.intervalMs}ms.`,
      );
    }
  }

  private buildSearchUrl(keywords: string, lang?: string): string {
    const query = lang ? `${keywords} lang:${lang}` : keywords;
    const encoded = encodeURIComponent(query);
    return `https://x.com/search?q=${encoded}&src=typed_query&f=live`;
  }

  private async cleanup(
    page: Page | null,
    context: BrowserContext | null,
    browser: Browser | null,
  ): Promise<void> {
    this.logger.info("Cleaning up resources...");

    try {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (error) {
      this.logger.error(`Error during cleanup: ${error}`);
    }
  }
}
