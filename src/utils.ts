import winston from "winston";
import { createDefaultLogger } from "./logger";
import Redis from "ioredis";
import ReJSONCommands from "./redis";

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
  const redisConnection = new Redis(redis.port, redis.host);
  logger.info(`Connected to redis on host: ${redis.host} port: ${redis.port}`);

  const redisCommands = new ReJSONCommands(redisConnection, logger);
  await redisCommands.flush();

  logger.info(`Cleared cache`);
};
export { clearCache };
