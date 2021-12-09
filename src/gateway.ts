import { Gateway } from "detritus-client-socket";
import { GatewayEventHandler } from "./handler";
import Redis from "ioredis";
import ReJSONCommands from "./redis";
import { GatewayOpcodes } from "discord-api-types/v9";
import { GatewayIntents } from "detritus-client-socket/lib/constants";

interface CreateGatewayConnectionOptions {
  redis: {
    port?: number;
    host?: string;
  };
  discord: {
    token: string;
  };
}

const createGatewayConnection = ({
  redis,
  discord,
}: CreateGatewayConnectionOptions) => {
  const redisConnection = new Redis(redis.port, redis.host);

  redisConnection.send_command("FLUSHDB"); // Clear everything to avoid stale data
  const redisCommands = new ReJSONCommands(redisConnection);
  const dispatchHandler = new GatewayEventHandler(redisCommands);

  const client = new Gateway.Socket(discord.token, {
    presence: {
      status: "online",
    },
    encoding: "etf",
    intents: GatewayIntents.GUILDS,
  });

  client.on("packet", async (packet) => {
    if (packet.op === GatewayOpcodes.Dispatch) {
      const { d: data, t: name } = packet;
      if (name in dispatchHandler) {
        try {
          (dispatchHandler as any)[name](data);
        } catch (error) {
          console.log(error);
        }
        return;
      }
    }
  });
  client.on("close", (event) => console.log("client close", event));
  client.on("warn", console.error);
  client.connect("wss://gateway.discord.gg/");
};

export { createGatewayConnection };
