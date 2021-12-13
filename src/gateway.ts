import { Gateway } from "detritus-client-socket";
import { PresenceOptions } from "detritus-client-socket/lib/gateway";
import { GatewayEventHandler } from "./handler";
import Redis from "ioredis";
import ReJSONCommands from "./redis";
import { GatewayDispatchEvents } from "discord-api-types/gateway/v9";
import { GatewayOpcodes, Snowflake } from "discord-api-types/v9";
import { GatewayIntents } from "detritus-client-socket/lib/constants";
import winston from "winston";
import { createDefaultLogger } from "./logger";
import { bigIntParse } from "./json";

interface CreateGatewayConnectionOptions {
  redis: {
    port?: number;
    host?: string;
  };
  discord: {
    token: string;
    presence?: PresenceOptions;
    shardCount?: number;
    shardId?: number;
  };
  logger?: winston.Logger;
}

const createGatewayConnection = async ({
  redis,
  discord,
  logger,
}: CreateGatewayConnectionOptions): Promise<Gateway.Socket> => {
  if (!logger) {
    logger = createDefaultLogger();
  }
  const redisConnection = new Redis(redis.port, redis.host);
  logger.info(`Connected to redis on host: ${redis.host} port: ${redis.port}`);
  if (!discord.shardCount) {
    discord.shardCount = 1;
  }

  const redisCommands = new ReJSONCommands(redisConnection, logger);

  // Check if the previous shard count is the same as the current shard count
  logger.debug("Checking shard count");
  const shardCount = bigIntParse(
    await redisCommands.get({ key: "shardCount" })
  );
  if (!shardCount) {
    await redisCommands.set({
      key: "shardCount",
      value: bigIntParse(discord.shardCount),
    });
  } else if (shardCount !== discord.shardCount) {
    throw new Error(
      "Shard count does not match previous shard count. Please clear the redis cache."
    );
  }
  const dispatchHandler = new GatewayEventHandler(
    redisCommands,
    logger,
    discord.shardId || 0
  );

  const client = new Gateway.Socket(discord.token, {
    presence: {
      status: "online",
    },
    intents: GatewayIntents.GUILDS,
    shardCount: discord.shardCount,
    shardId: discord.shardId,
  });

  const waitForReady = () =>
    new Promise((resolve) => {
      client.once("readyParsed", resolve);
    });

  client.on("packet", async (packet) => {
    logger!.debug(`Received websocket event`, packet);
    if (packet.op === GatewayOpcodes.Dispatch) {
      const { d: data, t: name } = packet;

      if (name in dispatchHandler) {
        if (name === GatewayDispatchEvents.Ready) {
          try {
            (dispatchHandler as any)[name](data, client);
          } catch (error) {
            logger!.error(`Error handling event ${name}`, error);
          }
          return;
        } else if (!redisCommands.clientId) {
          // Events shouldn't be processed until we have a clientId (the client is ready)
          await waitForReady();
        }
        logger!.debug(`Handling websocket event ${name}`);
        try {
          (dispatchHandler as any)[name](data);
        } catch (error) {
          logger!.error(`Error handling event ${name}`, error);
        }
        return;
      }
    }
  });
  client.on("ready", () =>
    logger!.info(`Connected to Discord Gateway on shard: ${discord.shardId}`)
  );
  client.on("close", (event) =>
    logger!.info(`Client closed on shard: ${discord.shardId}`, event)
  );
  client.on("warn", (error) =>
    logger!.error(`Client warn occurred on shard: ${discord.shardId}`, error)
  );

  client.connect("wss://gateway.discord.gg/");
  return client;
};

/*
  Clears all guilds from the cache so that stale data doesn't persist.
  This is done already when starting a shard, but if the shard count changes the calculation for where a guild belongs changes
  which can cause conflicts and accidental deletions of data. 
  This function should not be run while other shards connected to the cache are running. 
  This function should be run after the shard count has been changed, and before any other shards are connected to the cache.
  TODO: Adapt this to allow for rolling updates to shard counts
*/

export { createGatewayConnection };
