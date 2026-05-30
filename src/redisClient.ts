import Redis from "ioredis";
import winston from "winston";

import GuildManager from "./guildManager.js";
import { createDefaultLogger } from "./logger.js";
import ReJSONCommands from "./redis.js";

interface CreateRedisClientOptions {
  port?: number;
  host?: string;
  logger?: winston.Logger;
}

const createRedisClient = ({
  port,
  host,
  logger,
}: CreateRedisClientOptions): GuildManager => {
  if (!logger) {
    logger = createDefaultLogger();
  }
  const redisConnection = new Redis(port ?? 6379, host ?? "127.0.0.1");
  logger.info(`Connected to redis on host: ${host} port: ${port}`);
  const redisCommands = new ReJSONCommands(redisConnection, logger);
  return new GuildManager(redisCommands);
};
export { createRedisClient };
