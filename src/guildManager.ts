import type { Snowflake } from "discord-api-types/v9";

import { ShardInactive } from "./errors.js";
import { bigIntParse } from "./json.js";
import ReJSONCommands from "./redis.js";
import Guild from "./structures/guild.js";

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

  /**
   * Get the current shard count.
   *
   * Uses the cached value for up to 5 minutes unless skipCache is true.
   * A fresh lookup always updates the cache.
   */
  async getShardCount(skipCache = false): Promise<number> {
    const now = Date.now();

    if (
      !skipCache &&
      this._shardCountCache.count &&
      this._shardCountCache.lastChecked &&
      now - this._shardCountCache.lastChecked < 5 * 60 * 1000
    ) {
      return this._shardCountCache.count;
    }

    const count = bigIntParse(
      await this._redis.get({ key: "shardCount" }),
    ) as number;

    this._shardCountCache.count = count;
    this._shardCountCache.lastChecked = now;

    return count;
  }

  /**
   * @deprecated Use getShardCount() instead.
   */
  async _getShardCountCached(): Promise<number> {
    return this.getShardCount();
  }

  /**
   * @deprecated Use getShardCount() instead.
   */
  get shardCountCached(): Promise<number> {
    return this.getShardCount();
  }

  private _getGuild(id: Snowflake): Guild {
    return new Guild(id, { redis: this._redis });
  }

  getGuildNoCacheChecks = this._getGuild;

  async getGuild(id: Snowflake): Promise<Guild> {
    // First get the shard id that the guild is in
    // with shard_id = (guild_id >> 22) % num_shards
    const shardId = (BigInt(id) >> 22n) % BigInt(await this.getShardCount());
    const shardIdString = shardId.toString();
    // Then check if the shard is active by checking that it isn't in the array of inactive shards
    const shardIsActive = !this._shardsInactiveCache.includes(shardIdString);
    if (!shardIsActive) {
      throw new ShardInactive(
        `The guild ${id} cannot be accessed because the shard ${shardId} is inactive`,
      );
    }

    return this._getGuild(id);
  }

  async getGuildIconsAndNames(guildIds: Snowflake[]): Promise<{
    [guildId: string]: { icon: string | null; name: string } | undefined;
  }> {
    // Get multiple guilds at once - return their icons and names
    const icons = await this._redis.getMultipleGuildIcons({ guildIds });
    const names = await this._redis.getMultipleGuildNames({ guildIds });
    const result: {
      [guildId: string]: { icon: string | null; name: string } | undefined;
    } = {};
    // loop including index
    for (const [index, guildId] of guildIds.entries()) {
      const name = names[index];
      const icon = icons[index];
      if (name) {
        result[guildId] = {
          icon: icon ? JSON.parse(icon) : null,
          name: name ? JSON.parse(name) : null,
        };
      } else {
        result[guildId] = undefined;
      }
    }
    return result;
  }

  private async _checkShardsActive(): Promise<void> {
    // Always get a fresh shard count here so that changes in shard count
    // are reflected immediately in shardsActive.
    const shardCount = await this.getShardCount(true);
    for (let shardId = 0; shardId < shardCount; shardId++) {
      const shardIdString = shardId.toString();
      const shardIsActive = JSON.parse(
        await this._redis.nonJSONget({ key: `shard:${shardId}:active` }),
      ) as boolean | null;
      if (this._shardsInactiveCache.includes(shardIdString)) {
        if (shardIsActive) {
          // remove from array
          this._shardsInactiveCache.splice(
            this._shardsInactiveCache.indexOf(shardIdString),
            1,
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
  get shardsActive(): {
    isValid: boolean;
    shards: Record<number, boolean>;
  } {
    const shardCount = this._shardCountCache.count;

    if (shardCount === undefined) {
      return {
        isValid: false,
        shards: {},
      };
    }

    const shards: Record<number, boolean> = {};

    for (let shardId = 0; shardId < shardCount; shardId++) {
      shards[shardId] = !this._shardsInactiveCache.includes(shardId.toString());
    }

    return {
      isValid: true,
      shards,
    };
  }

  async getGuildCount(): Promise<number> {
    let guildCount = 0;
    const shardCount = await this.getShardCount();
    for (let shardId = 0; shardId < shardCount; shardId++) {
      const shardGuildCount = JSON.parse(
        await this._redis.nonJSONget({
          key: `shard:${shardId || 0}:guildCount`,
        }),
      );
      guildCount += shardGuildCount;
    }
    return guildCount;
  }
}

export default GuildManager;
