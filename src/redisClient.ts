import Redis from "ioredis";
import ReJSONCommands from "./redis";
import GuildManager from "./guildManager";

interface CreateRedisClientOptions {
  port?: number;
  host?: string;
}

const createRedisClient = ({
  port,
  host,
}: CreateRedisClientOptions): GuildManager => {
  const redisConnection = new Redis(port, host);
  const redisCommands = new ReJSONCommands(redisConnection);
  return new GuildManager(redisCommands);
};
export { createRedisClient };
