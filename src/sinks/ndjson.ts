import { Tweet, TweetSink } from "@/types";

export class NdjsonStdoutSink implements TweetSink {
  public async write(tweet: Tweet): Promise<void> {
    const line = JSON.stringify(tweet) + "\n";

    if (process.stdout.write(line)) {
      return;
    }

    await new Promise<void>((resolve) => {
      process.stdout.once("drain", resolve);
    });
  }

  public async close(): Promise<void> {}
}
