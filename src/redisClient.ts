import Redis from "ioredis";
import type winston from "winston";

import GuildManager from "./guildManager";
import { createDefaultLogger } from "./logger";
import ReJSONCommands from "./redis";

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
  const redisConnection = new Redis(port, host);
  logger.info(`Connected to redis on host: ${host} port: ${port}`);
  const redisCommands = new ReJSONCommands(redisConnection, logger);
  return new GuildManager(redisCommands);
};
export { createRedisClient };
