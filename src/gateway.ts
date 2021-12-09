import { Gateway } from "detritus-client-socket";
import { PresenceOptions } from "detritus-client-socket/lib/gateway";
import { GatewayEventHandler } from "./handler";
import Redis from "ioredis";
import ReJSONCommands from "./redis";
import { GatewayOpcodes } from "discord-api-types/v9";
import { GatewayIntents } from "detritus-client-socket/lib/constants";
import winston from "winston";
import { createDefaultLogger } from "./logger";

interface CreateGatewayConnectionOptions {
  redis: {
    port?: number;
    host?: string;
  };
  discord: {
    token: string;
    presence?: PresenceOptions;
  };
  logger?: winston.Logger;
}

const createGatewayConnection = async ({
  redis,
  discord,
  logger,
}: CreateGatewayConnectionOptions) => {
  if (!logger) {
    logger = createDefaultLogger();
  }
  const redisConnection = new Redis(redis.port, redis.host);
  logger.info(`Connected to redis on host: ${redis.host} port: ${redis.port}`);

  const redisCommands = new ReJSONCommands(redisConnection, logger);
  logger.debug(`Flushing redis cache`);
  await redisCommands.flush(); // Clear everything to avoid stale data
  const dispatchHandler = new GatewayEventHandler(redisCommands, logger);

  const client = new Gateway.Socket(discord.token, {
    presence: {
      status: "online",
    },
    encoding: "etf",
    intents: GatewayIntents.GUILDS,
  });

  client.on("packet", async (packet) => {
    logger!.debug(`Received websocket event`, packet);
    if (packet.op === GatewayOpcodes.Dispatch) {
      const { d: data, t: name } = packet;
      if (name in dispatchHandler) {
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
  client.on("ready", () => logger!.info("Connected to Discord Gateway"));
  client.on("close", (event) => logger!.info("Client closed", event));
  client.on("warn", (error) => logger!.error(`Client warn occurred`, error));

  client.connect("wss://gateway.discord.gg/");
};

export { createGatewayConnection };
