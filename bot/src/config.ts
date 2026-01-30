import dotenv from "dotenv";

dotenv.config();

type Config = {
  discordToken: string;
  verifyChannel: string;
  redisUrl: string;
  stubWorker: boolean;
};

const discordToken = process.env.DISCORD_TOKEN;
if (!discordToken) {
  throw new Error("DISCORD_TOKEN is required");
}

export const config: Config = {
  discordToken,
  verifyChannel: process.env.VERIFY_CHANNEL ?? "verify",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  stubWorker: (process.env.STUB_WORKER ?? "true").toLowerCase() === "true",
};
