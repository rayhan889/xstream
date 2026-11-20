import { Tweet } from "@/types";
import { createLogger } from "@/logger";

const logger = createLogger("Parser");

export function parseTweetsFromResponse(responseBody: any): Tweet[] {
  const tweets: Tweet[] = [];

  try {
    const instructions =
      responseBody?.data?.search_by_raw_query?.search_timeline?.timeline
        ?.instructions;

    if (!instructions || !Array.isArray(instructions)) {
      logger.debug("No instructions found in GraphQL response");
      return tweets;
    }

    for (const instruction of instructions) {
      const entries = instruction.entries || instruction.moduleItems || [];

      for (const entry of entries) {
        const tweet = extractTweetFromEntry(entry);
        if (tweet) {
          tweets.push(tweet);
        }
      }
    }
  } catch (error) {
    logger.debug(`Failed to parse GraphQL response: ${error}`);
  }

  return tweets;
}

const EMBEDDED_MARKER = String.raw`value:"{\"data\":{\"search_by_raw_query\"`;

export function extractEmbeddedSearchResponses(html: string): unknown[] {
  const bodies: unknown[] = [];
  let from = 0;

  while (true) {
    const marker = html.indexOf(EMBEDDED_MARKER, from);
    if (marker === -1) break;

    const start = marker + "value:".length;
    let end = start + 1;
    while (end < html.length && html[end] !== '"') {
      end += html[end] === "\\" ? 2 : 1;
    }
    from = end + 1;

    try {
      bodies.push(JSON.parse(JSON.parse(html.slice(start, end + 1))));
    } catch (error) {
      logger.debug(`Failed to parse embedded search response: ${error}`);
    }
  }

  return bodies;
}

function extractTweetFromEntry(entry: any): Tweet | null {
  try {
    const tweetResult =
      entry?.content?.itemContent?.tweet_results?.result ||
      entry?.item?.itemContent?.tweet_results?.result ||
      entry?.content?.content?.tweet_results?.result;

    if (!tweetResult) {
      return null;
    }

    const actualTweet = tweetResult.tweet || tweetResult;

    if (!actualTweet.core || !(actualTweet.legacy || actualTweet.details)) {
      return null;
    }

    const legacy = actualTweet.legacy ?? {};
    const details = actualTweet.details ?? {};
    const counts = actualTweet.counts ?? {};

    const userResult = actualTweet.core?.user_results?.result;

    if (!userResult) {
      return null;
    }

    const userCore = userResult.core;

    if (!userCore) {
      logger.debug("userResult.core is missing — skipping tweet");
      return null;
    }

    const tweetId = actualTweet.rest_id || legacy.id_str;
    const authorHandle = userCore?.screen_name || "";
    const authorName = userCore?.name || "";

    logger.debug(`Extracted tweet ID ${tweetId} by @${authorHandle}`);

    return {
      id: actualTweet.rest_id || legacy.id_str || "",
      conversationId: legacy.conversation_id_str || "",
      fullText: details.full_text || legacy.full_text || "",
      authorHandle,
      authorName,
      likeCount: counts.favorite_count ?? legacy.favorite_count ?? 0,
      replyCount: counts.reply_count ?? legacy.reply_count ?? 0,
      retweetCount: counts.retweet_count ?? legacy.retweet_count ?? 0,
      tweetUrl: `https://x.com/${authorHandle}/status/${tweetId}`,
      postedAt:
        typeof details.created_at_ms === "number"
          ? new Date(details.created_at_ms).toISOString()
          : parseTwitterDate(legacy.created_at),
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.debug(`Failed to extract tweet from entry: ${error}`);
    return null;
  }
}

function parseTwitterDate(createdAt: string | undefined): string {
  if (!createdAt) return "";

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

export function extractCursor(responseBody: any): string | null {
  try {
    const instructions =
      responseBody?.data?.search_by_raw_query?.search_timeline?.timeline
        ?.instructions;

    if (!instructions) return null;

    for (const instruction of instructions) {
      const entries = instruction.entries || [];
      for (const entry of entries) {
        if (
          entry.entryId?.startsWith("cursor-bottom") ||
          entry.entryId?.startsWith("sq-cursor-bottom")
        ) {
          return entry.content?.value || null;
        }
      }
    }
  } catch {}

  return null;
}
