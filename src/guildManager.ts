import { Snowflake } from "discord-api-types/v9";
import { bigIntParse } from "./json";
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
  async getGuildCount(): Promise<number> {
    const shardCount = bigIntParse(
      await this._redis.get({ key: "shardCount" })
    );
    let guildCount = 0;

    for (let shardId = 0; shardId < shardCount; shardId++) {
      const shardGuildCount = JSON.parse(
        await this._redis.nonJSONget({
          key: `shard:${shardId || 0}:guildCount`,
        })
      );
      guildCount += shardGuildCount;
    }
    return guildCount;
  }
}

export default GuildManager;
