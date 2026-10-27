import { Tweet } from "@/types";
import { Page } from "playwright";
import { createLogger } from "@/logger";
import { parseTweetsFromResponse } from "@/engine/parser";
import { RateLimitTracker } from "./rate-limit";

export class XInterceptor {
  private isAttached: boolean = false;
  private readonly logger = createLogger("X Interceptor");

  constructor(
    private readonly onTweets: (tweets: Tweet[]) => void,
    private readonly rateLimit: RateLimitTracker,
  ) {}

  public attach(page: Page): void {
    if (this.isAttached) return;

    page.on("response", async (response) => {
      try {
        const url = response.url();

        if (url.includes("/i/api/graphql/") && url.includes("SearchTimeline")) {
          this.logger.debug(
            `Intercepted GraphQL response from SearchTimeline: ${url}`,
          );
          const status = response.status();
          const headers = response.headers();

          this.rateLimit.update(headers, status);

          const snapshot = this.rateLimit.getSnapshot();
          if (snapshot) {
            this.logger.debug(
              `Rate limit snapshot: ${snapshot.remaining}/${snapshot.limit}, resets at ${new Date(
                snapshot.resetAt,
              ).toISOString()}`,
            );
          }

          if (status === 429) {
            this.logger.warn(
              `Rate limited (429) on SearchTimeline request: ${url}`,
            );
            return;
          }

          if (status !== 200) {
            this.logger.warn(
              `Non-200 response (${status}) from SearchTimeline request: ${url}`,
            );
            return;
          }

          const contentType = headers["content-type"] || "";
          if (!contentType.includes("application/json")) {
            return;
          }

          const body = await response.json();
          const tweets = parseTweetsFromResponse(body);

          if (tweets.length > 0) {
            this.onTweets(tweets);
            this.logger.debug(
              `Intercepted ${tweets.length} tweets from GraphQL response`,
            );
          }
        }
      } catch (error) {
        this.logger.debug(`Response intercept error (non-critical): ${error}`);
      }
    });

    this.isAttached = true;
    this.logger.debug("Tweet interceptor attached to page");
  }
}
