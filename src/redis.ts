import { Snowflake } from "discord-api-types/v9";
import { Redis } from "ioredis";

const makeGuildKey = (guildId: Snowflake) => `guild:${guildId}`;

class ReJSONCommands {
  private redis: Redis;
  clientId: Snowflake | null;
  constructor(redis: Redis) {
    this.redis = redis;
    this.clientId = null;
  }
  set = async ({
    key,
    path = ".",
    value,
  }: {
    key: string;
    path?: string;
    value: string;
  }) => {
    return this.redis.send_command("JSON.SET", [key, path, value]);
  };
  get = async ({
    key,
    path = ".",
  }: {
    key: string;
    path?: string | string[];
  }): Promise<any> => {
    let args = [key];
    if (typeof path === "string") {
      args.push(path);
    } else {
      args = args.concat(path);
    }
    return this.redis.send_command("JSON.GET", args);
  };
  delete = async ({
    key,
    path = ".",
  }: {
    key: string;
    path?: string | string[];
  }): Promise<number> => {
    let args = [key];
    if (typeof path === "string") {
      args.push(path);
    } else {
      args = args.concat(path);
    }
    return this.redis.send_command("JSON.DEL", args);
  };
  arrAppend = async ({
    key,
    path = ".",
    value,
  }: {
    key: string;
    path?: string;
    value: string;
  }) => {
    return this.redis.send_command("JSON.ARRAPPEND", [key, path, value]);
  };
  arrIndex = async ({
    key,
    path = ".",
    value,
  }: {
    key: string;
    path?: string;
    value: string;
  }) => {
    return this.redis.send_command("JSON.ARRINDEX", [key, path, value]);
  };
  arrPop = async ({
    key,
    path = ".",
    index,
  }: {
    key: string;
    path?: string;
    index: string;
  }) => {
    return this.redis.send_command("JSON.ARRPOP", [key, path, index]);
  };
}

export default ReJSONCommands;
export { makeGuildKey };
