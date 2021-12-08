import { Snowflake } from "discord-api-types";
import ReJSONCommands from "./redis";
import Guild from "./structures/guild";

class GuildManager {
  private _redis: ReJSONCommands;
  constructor(redis: ReJSONCommands) {
    this._redis = redis;
  }

  getGuild(id: Snowflake): Guild {
    return new Guild(id, { redis: this._redis });
  }
}

export default GuildManager;
