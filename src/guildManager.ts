import { Snowflake } from "discord-api-types/v9";
import { ShardInactive } from "./errors";
import { bigIntParse } from "./json";
import ReJSONCommands from "./redis";
import Guild from "./structures/guild";

class GuildManager {
  private _redis: ReJSONCommands;
  private _shardsInactiveCache: string[];
  private _shardCountCache: { count?: number; lastChecked?: number };
  constructor(redis: ReJSONCommands) {
    this._redis = redis;
    this._shardsInactiveCache = [];
    this._shardCountCache = {};

    // Run first shard check
    this._checkShardsActive();
  }

  async _getShardCountCached(): Promise<number> {
    const now = Date.now();
    // force a check every 5 minutes
    if (
      this._shardCountCache.count &&
      this._shardCountCache.lastChecked &&
      now - this._shardCountCache.lastChecked < 5 * 60 * 1000
    ) {
      return this._shardCountCache.count;
    }
    this._shardCountCache.count = await this.getShardCount();
    this._shardCountCache.lastChecked = now;
    return this._shardCountCache.count;
  }

  get shardCountCached(): Promise<number> {
    return this._getShardCountCached();
  }

  private _getGuild(id: Snowflake): Guild {
    return new Guild(id, { redis: this._redis });
  }

  async getGuild(id: Snowflake): Promise<Guild> {
    // First get the shard id that the guild is in
    // with shard_id = (guild_id >> 22) % num_shards
    const shardId = (BigInt(id) >> 22n) % BigInt(await this.getShardCount());
    const shardIdString = shardId.toString();
    // Then check if the shard is active by checking that it isn't in the array of inactive shards
    const shardIsActive = !this._shardsInactiveCache.includes(shardIdString);
    if (!shardIsActive) {
      throw new ShardInactive(
        `The guild ${id} cannot be accessed because the shard ${shardId} is inactive`
      );
    }

    return this._getGuild(id);
  }

  private async _checkShardsActive() {
    const shardCount = await this.getShardCount();
    for (let shardId = 0; shardId < shardCount; shardId++) {
      const shardIdString = shardId.toString();
      const shardIsActive = JSON.parse(
        await this._redis.nonJSONget({ key: `shard:${shardId}:active` })
      ) as boolean | null;
      if (this._shardsInactiveCache.includes(shardIdString)) {
        if (shardIsActive) {
          // remove from array
          this._shardsInactiveCache.splice(
            this._shardsInactiveCache.indexOf(shardIdString),
            1
          );
        }
      } else {
        if (!shardIsActive) {
          // add to array
          this._shardsInactiveCache.push(shardIdString);
        }
      }
    }
    // then run this again - every 15 seconds
    setTimeout(() => this._checkShardsActive(), 15 * 1000);
  }

  async getShardCount(): Promise<number> {
    return bigIntParse(await this._redis.get({ key: "shardCount" })) as number;
  }
  async getGuildCount(): Promise<number> {
    let guildCount = 0;
    const shardCount = await this.getShardCount();
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
