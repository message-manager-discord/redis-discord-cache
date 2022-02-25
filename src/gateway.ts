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
import { GatewayPackets } from "detritus-client-socket/lib/types";
interface DiscordConfig {
  token: string;
  presence?: PresenceOptions;
  shardCount?: number;
  shardId?: number;
}
interface ParsedDiscordConfig extends DiscordConfig {
  shardCount: number;
}

type OnGatewayEventHandler = (options: {
  name: GatewayPackets.Packet["t"];
}) => any;
type OnRedisCommandHandler = (options: { name: string }) => any;
interface CreateGatewayConnectionOptions {
  redis: {
    port?: number;
    host?: string;
  };
  discord: DiscordConfig;
  logger?: winston.Logger;
  metrics?: {
    onGatewayEvent?: OnGatewayEventHandler;
    onRedisCommand?: OnRedisCommandHandler;
  };
}

class GatewayClient {
  client: Gateway.Socket;
  logger: winston.Logger;
  redisConnection: Redis.Redis;
  redisCommands: ReJSONCommands;
  dispatchHandler: GatewayEventHandler;
  clientId: Snowflake | null;
  shardId: number;
  shardCount: number;
  onGatewayEventMetrics: OnGatewayEventHandler | undefined;
  private _eventsPendingReady: GatewayPackets.Packet[];
  constructor({
    redis,
    discord,
    logger,
    metrics,
  }: CreateGatewayConnectionOptions) {
    if (!logger) {
      logger = createDefaultLogger();
    }
    this.logger = logger;
    this.client = new Gateway.Socket(discord.token, {
      presence: {
        status: "online",
      },
      intents: GatewayIntents.GUILDS,
      shardCount: discord.shardCount,
      shardId: discord.shardId,
    });
    this.redisConnection = new Redis(redis.port, redis.host);
    this.logger.info(
      `Connected to redis on host: ${redis.host} port: ${redis.port}`
    );
    this.redisCommands = new ReJSONCommands(
      this.redisConnection,
      logger,
      metrics?.onRedisCommand
    );

    this.shardId = discord.shardId || 0;
    this.shardCount = discord.shardCount || 1;
    this.dispatchHandler = new GatewayEventHandler(
      this,
      this.redisCommands,
      this.logger,
      this.shardId
    );
    this.clientId = null;
    this.redisCommands.delete({ key: "clientId" });
    this._eventsPendingReady = [];
    if (metrics) {
      if (metrics.onGatewayEvent) {
        this.onGatewayEventMetrics = metrics.onGatewayEvent;
      }
    }
  }

  async handlePacket(packet: GatewayPackets.Packet) {
    if (packet.op === GatewayOpcodes.Dispatch) {
      const { d: data, t: name } = packet;

      if (name in this.dispatchHandler) {
        if (name === GatewayDispatchEvents.Ready) {
          try {
            (this.dispatchHandler as any)[name](data, this.client);
          } catch (error) {
            this.logger.error(`Error handling event ${name}`, error);
          }
          return;
        } else if (!this.isReady) {
          this.logger.debug(
            `Waiting for ready to handle websocket event ${name}`
          );
          // Events shouldn't be processed until we have a clientId (the client is ready)
          this._eventsPendingReady.push(packet);
        } else {
          this.logger.debug(`Handling websocket event ${name}`);
          try {
            (this.dispatchHandler as any)[name](data);
          } catch (error) {
            this.logger.error(`Error handling event ${name}`, error);
          }
        }
      }
      if (this.onGatewayEventMetrics) {
        this.onGatewayEventMetrics({ name });
      }
    }
  }
  async connect() {
    // Check if the previous shard count is the same as the current shard count

    /* Part of the checks are:
  Clears all guilds from the cache so that stale data doesn't persist.
  This is done already when starting a shard, but if the shard count changes the calculation for where a guild belongs changes
  which can cause conflicts and accidental deletions of data. 
  This function should not be run while other shards connected to the cache are running. 
  This function should be run after the shard count has been changed, and before any other shards are connected to the cache.
  TODO: Adapt this to allow for rolling updates to shard counts
*/
    this.logger.debug("Checking shard count");
    const shardCount = bigIntParse(
      await this.redisCommands.get({ key: "shardCount" })
    );
    if (!shardCount) {
      await this.redisCommands.set({
        key: "shardCount",
        value: bigIntParse(this.shardCount),
      });
    } else if (shardCount !== this.shardCount) {
      throw new Error(
        "Shard count does not match previous shard count. Please clear the redis cache."
      );
    }

    this.client.on("packet", async (packet) => {
      this.logger.debug(`Received websocket event`, packet);
      this.handlePacket(packet);
    });
    this.client.on("readyParsed", async () => {
      this.logger.debug("Received readyParsed event");
      const eventsToHandle = this._eventsPendingReady;
      this._eventsPendingReady = [];
      for (let index = 0; index < eventsToHandle.length; index++) {
        const packet = eventsToHandle[index];
        this.logger.debug(`Handling delayed packet ${packet.t}`, packet);
        await this.handlePacket(packet);
      }
    });

    this.client.on("ready", () =>
      this.logger.info(`Connected to Discord Gateway on shard: ${this.shardId}`)
    );
    this.client.on("close", (event) =>
      this.logger.info(`Client closed on shard: ${this.shardId}`, event)
    );
    this.client.on("reconnecting", (event) => {
      this.logger.info(`Client reconnecting on shard: ${this.shardId}`, event);
      this.clientId = null;

      this.redisCommands.delete({ key: "clientId" });
    });
    this.client.on("warn", (error) =>
      this.logger.error(`Client warn occurred on shard: ${this.shardId}`, error)
    );

    this.client.connect("wss://gateway.discord.gg/?v=11");
  }

  async getGuildCount(): Promise<number> {
    return JSON.parse(
      await this.redisCommands.nonJSONget({
        key: `shard:${this.shardId || 0}:guildCount`,
      })
    );
  }

  get isReady() {
    return !!this.clientId;
  }
}

export default GatewayClient;
