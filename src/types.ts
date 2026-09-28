export interface Tweet {
  id: string;
  conversationId: string;
  fullText: string;
  authorHandle: string;
  authorName: string;
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  tweetUrl: string;
  postedAt: string;
  scrapedAt: string;
}

export interface TweetSink {
  write(t: Tweet): void | Promise<void>;
  close(): Promise<void>;
}
