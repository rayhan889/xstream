import z from "zod";

export const StreamSchema = z.object({
  keywords: z.string().min(1, "Keywords cannot be empty"),
  lang: z.string().optional(),
  authToken: z
    .string()
    .min(1, "Auth token is required (--auth-token or AUTH_TOKEN)"),
  headless: z.boolean().default(true),
  interval: z.coerce
    .number()
    .min(2, "Interval must be at least 2 seconds")
    .default(5),
  max: z.coerce.number().int().positive().optional(),
  output: z.string().default("stdout"),
});

export type StreamConfig = z.infer<typeof StreamSchema>;
