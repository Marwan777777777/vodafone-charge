function req(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

if (isProd) {
  for (const name of ["DATABASE_URL", "JWT_SECRET", "GARAGE_API_KEY"] as const) {
    if (!process.env[name]) throw new Error(`Missing required env: ${name}`);
  }
  if ((process.env.JWT_SECRET ?? "").length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: req("JWT_SECRET", isProd ? undefined : "dev-only-change-me-in-production-please-32b"),
  garageApiKey: req("GARAGE_API_KEY", isProd ? undefined : "dev-garage-key-change-me"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  timezone: process.env.TZ_NAME ?? "Africa/Cairo",
  hardwareMode: (process.env.HARDWARE_MODE ?? "sim") as "sim" | "live",
  nodeEnv,
};
