import { Snowflake } from "discord-api-types/v9";
import { Redis } from "ioredis";
import winston from "winston";

const makeGuildKey = (guildId: Snowflake) => `guild:${guildId}`;

class ReJSONCommands {
  private redis: Redis;
  private logger: winston.Logger;
  private onCommand: ((options: { name: string }) => any) | undefined;

  constructor(
    redis: Redis,
    logger: winston.Logger,
    onCommand?: (({ name }: { name: string }) => any) | undefined
  ) {
    this.redis = redis;

    this.logger = logger;
    this.onCommand = onCommand;
  }
  private async _sendCommand(command: string, ...args: any[]): Promise<any> {
    this.logger.debug(`Sending redis command: ${command} with args: ${args}`);

    const data = await this.redis.send_command(command, ...args);
    this.logger.debug(
      `Received data: ${data} from redis command: ${command} with args ${args}`
    );
    try {
      if (this.onCommand) {
        this.onCommand({ name: command });
      }
    } catch (e) {
      this.logger.error(e);
    } // This function is user provided
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
  async scan({
    cursor,
    pattern,
  }: {
    cursor: string;
    pattern: string;
  }): Promise<ScanReturn> {
    const data = await this._sendCommand("SCAN", [cursor, "MATCH", pattern]);
    return {
      cursor: data[0],
      keys: data[1],
    };
  }
  async scanAll({ pattern }: { pattern: string }): Promise<string[]> {
    let cursor = "0";
    let keys: string[] = [];
    let data: ScanReturn;
    do {
      data = await this.scan({ cursor, pattern });
      cursor = data.cursor;
      keys = keys.concat(data.keys);
    } while (cursor !== "0");
    return keys;
  }
  async nonJSONset({ key, value }: { key: string; value: any }) {
    return this._sendCommand("SET", [key, value]);
  }
  async nonJSONget({ key }: { key: string }) {
    return this._sendCommand("GET", [key]);
  }
  async nonJSONincr({ key }: { key: string }) {
    await this._sendCommand("INCR", [key]);
  }
  async nonJSONdecr({ key }: { key: string }) {
    return this._sendCommand("DECR", [key]);
  }
}

interface ScanReturn {
  cursor: string;
  keys: string[];
}

export default ReJSONCommands;
export { makeGuildKey };
