import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z.object({
  DATABASE_URL: z.string({ error: "DATABASE_URL is required" }).min(1, "DATABASE_URL is required"),
  APP_URL: z.url({ error: "APP_URL must be a full URL, e.g. http://localhost:3000" }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Redis over TCP (redis:// or rediss://). Empty = caching is off and every read goes to the database.
  REDIS_URL: z.string().default(""),
  // How many reverse proxies in front of the app append to X-Forwarded-For. The client IP is the
  // entry that many places from the right; 0 ignores the header (IP unknown, per-IP limits off).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  DEPLOYMENT_MODE: z.enum(["hosted", "self-hosted"]).default("self-hosted"),
  REQUIRE_EMAIL_VERIFICATION: booleanString,
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanString,
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().min(1).default("WalletHistory <noreply@example.com>"),
});

export type Env = z.infer<typeof envSchema>;

/** Validates a raw environment; empty strings count as "not set". */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const input = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${problems}\nSee .env.example.`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Server-only. Validated once on first use, then cached for the process lifetime. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
