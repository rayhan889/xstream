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

function extractTweetFromEntry(entry: any): Tweet | null {
  try {
    const tweetResult =
      entry?.content?.itemContent?.tweet_results?.result ||
      entry?.item?.itemContent?.tweet_results?.result;

    if (!tweetResult) {
      return null;
    }

    const actualTweet = tweetResult.tweet || tweetResult;

    if (!actualTweet.legacy || !actualTweet.core) {
      return null;
    }

    const legacy = actualTweet.legacy;

    const userResult = actualTweet.core?.user_results?.result;
    // logger.debug(`user result: ${JSON.stringify(userResult, null, 2)}`);

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
      fullText: legacy.full_text || "",
      authorHandle,
      authorName,
      likeCount: legacy.favorite_count || 0,
      replyCount: legacy.reply_count || 0,
      retweetCount: legacy.retweet_count || 0,
      tweetUrl: `https://x.com/${authorHandle}/status/${tweetId}`,
      postedAt: parseTwitterDate(legacy.created_at),
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
