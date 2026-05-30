import Redis from "ioredis";
import winston from "winston";

import { createDefaultLogger } from "./logger.js";
import ReJSONCommands from "./redis.js";

const clearCache = async ({
  redis,
  logger,
}: {
  redis: {
    port?: number;
    host?: string;
  };
  logger?: winston.Logger;
}) => {
  if (!logger) {
    logger = createDefaultLogger();
  }
  const redisConnection = new Redis(
    redis.port ?? 6379,
    redis.host ?? "127.0.0.1",
  );
  logger.info(`Connected to redis on host: ${redis.host} port: ${redis.port}`);

  const redisCommands = new ReJSONCommands(redisConnection, logger);
  await redisCommands.flush();

  logger.info(`Cleared cache`);
};
export { clearCache };
