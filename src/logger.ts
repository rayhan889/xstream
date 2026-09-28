import { Logger } from "tslog";

export function createLogger(name: string): Logger<Record<string, unknown>> {
  const logger = new Logger<Record<string, unknown>>({
    name,
    minLevel: process.env.NODE_ENV === "prod" ? "INFO" : "DEBUG",
    type: "hidden",
  });

  logger.attachTransport({
    name: "stderr",
    format: "pretty",
    write: (_record, line) => {
      process.stderr.write(line + "\n");
    },
  });

  return logger;
}
