import { Snowflake } from "discord-api-types/v9";
import { Redis } from "ioredis";
import winston from "winston";

const makeGuildKey = (guildId: Snowflake) => `guild:${guildId}`;

class ReJSONCommands {
  private redis: Redis;
  private logger: winston.Logger;
  clientId: Snowflake | null;

  constructor(redis: Redis, logger: winston.Logger) {
    this.redis = redis;
    this.clientId = null;
    this.logger = logger;
  }
  private async _sendCommand(command: string, ...args: any[]): Promise<any> {
    this.logger.debug(`Sending redis command: ${command} with args: ${args}`);
    const data = await this.redis.send_command(command, ...args);
    this.logger.debug(
      `Received data: ${data} from redis command: ${command} with args ${args}`
    );
    return data;
  }

  flush() {
    return this._sendCommand("FLUSHALL");
  }

  async set({
    key,
    path = ".",
    value,
  }: {
    key: string;
    path?: string;
    value: string;
  }) {
    return this._sendCommand("JSON.SET", [key, path, value]);
  }
  async get({
    key,
    path = ".",
  }: {
    key: string;
    path?: string | string[];
  }): Promise<any> {
    let args = [key];
    if (typeof path === "string") {
      args.push(path);
    } else {
      args = args.concat(path);
    }
    return this._sendCommand("JSON.GET", args);
  }
  async delete({
    key,
    path = ".",
  }: {
    key: string;
    path?: string | string[];
  }): Promise<number> {
    let args = [key];
    if (typeof path === "string") {
      args.push(path);
    } else {
      args = args.concat(path);
    }
    return this._sendCommand("JSON.DEL", args);
  }
  arrAppend({
    key,
    path = ".",
    value,
  }: {
    key: string;
    path?: string;
    value: string;
  }): Promise<number> {
    return this._sendCommand("JSON.ARRAPPEND", [key, path, value]);
  }
  arrIndex({
    key,
    path = ".",
    value,
  }: {
    key: string;
    path?: string;
    value: string;
  }): Promise<number> {
    return this._sendCommand("JSON.ARRINDEX", [key, path, value]);
  }
  arrPop({
    key,
    path = ".",
    index,
  }: {
    key: string;
    path?: string;
    index: string;
  }): Promise<number> {
    return this._sendCommand("JSON.ARRPOP", [key, path, index]);
  }
}

export default ReJSONCommands;
export { makeGuildKey };
