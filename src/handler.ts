import {
  GatewayDispatchEvents,
  GatewayGuildCreateDispatchData,
  GatewayGuildDeleteDispatchData,
  GatewayReadyDispatchData,
  GatewayGuildUpdateDispatchData,
  GatewayChannelCreateDispatchData,
  GatewayChannelUpdateDispatchData,
  GatewayChannelDeleteDispatchData,
  GatewayGuildRoleUpdateDispatchData,
  GatewayGuildRoleCreateDispatchData,
  GatewayGuildRoleDeleteDispatchData,
  GatewayThreadCreateDispatchData,
  GatewayThreadUpdateDispatchData,
  GatewayThreadDeleteDispatchData,
  GatewayThreadListSyncDispatchData,
  GatewayGuildMemberUpdateDispatchData,
} from "discord-api-types/gateway/v9";
import { Snowflake } from "discord-api-types/v9";
import { GuildNotFound, GuildUnavailable } from "./errors";
import ReJSONCommands from "./redis";

import Guild, {
  insertGuildIntoShardArray,
  mergeGuilds,
  parseGuildData,
  removeGuildFromShardArray,
} from "./structures/guild";
import { mergeChannel, parseChannel } from "./structures/channel";
import GuildManager from "./guildManager";
import winston from "winston";
import { bigIntParse, bigIntStringify } from "./json";
import { Socket } from "detritus-client-socket/lib/gateway";

// Design inspired from https://github.com/detritusjs/client/blob/b27cbaa5bfb48506b059be178da0e871b83ba95e/src/gateway/handler.ts#L146
class GatewayEventHandler {
  private _redis: ReJSONCommands;
  private _logger: winston.Logger;
  private _shardId: number;
  guilds: GuildManager;

  constructor(redis: ReJSONCommands, logger: winston.Logger, shardId: number) {
    this._redis = redis;
    this._logger = logger;
    this._shardId = shardId;
    this.guilds = new GuildManager(redis);
  }
  async [GatewayDispatchEvents.Ready](
    data: GatewayReadyDispatchData,
    client: Socket
  ) {
    const newShardGuilds = data.guilds.map((guild) => guild.id);
    console.log(`${this._shardId} - ${data.guilds?.length} guilds`);
    const previousShardGuilds = bigIntParse(
      await this._redis.get({ key: `shard:${this._shardId}` })
    ) as Snowflake[] | null;
    // This is incase any guilds were deleted while the process was offline
    // and thus they should be deleted from the cache
    if (previousShardGuilds) {
      const deletedGuilds = previousShardGuilds.filter((guildId) => {
        return !newShardGuilds.includes(guildId);
      });
      deletedGuilds.forEach(async (guildId) => {
        await this._redis.delete({ key: `guild:${guildId}` });
      });
    }
    await this._redis.set({
      key: `shard:${this._shardId}`,
      value: bigIntStringify(newShardGuilds),
    });
    data.guilds.forEach(async (guild) => {
      await Guild.saveNewUnavailable(guild, { redis: this._redis });
    });
    this._redis.clientId = data.user.id;
    client.emit("readyParsed"); // So events are not processed until ready
  }
  async [GatewayDispatchEvents.GuildCreate](
    data: GatewayGuildCreateDispatchData
  ) {
    await insertGuildIntoShardArray({
      guildId: data.id,
      shardId: this._shardId,
      redis: this._redis,
    });
    await Guild.saveNew(data, { redis: this._redis });
  }
  async [GatewayDispatchEvents.GuildUpdate](
    data: GatewayGuildUpdateDispatchData
  ) {
    const guild = this.guilds.getGuild(data.id);
    const newParsedData = parseGuildData(
      data,
      this._redis.clientId! // Must be set as READY event was received
    );
    try {
      const oldData = await guild.toStatic();
      const newData = mergeGuilds(oldData, newParsedData);
      await guild.overwrite(newData);
    } catch (error) {
      if (error instanceof GuildNotFound) {
        await Guild.saveNew(data, { redis: this._redis });
      } else if (error instanceof GuildUnavailable) {
        await guild.overwrite(newParsedData);
      } else {
        this._logger.error(`Error updating guild ${data.id}`, error);
      }
    }
  }
  async [GatewayDispatchEvents.GuildDelete](
    data: GatewayGuildDeleteDispatchData
  ) {
    if (data.unavailable) {
      // Guild is unavailable
      await Guild.saveNewUnavailable(data, { redis: this._redis });
    } else {
      // Left guild or deleted guild
      await removeGuildFromShardArray({
        guildId: data.id,
        shardId: this._shardId,
        redis: this._redis,
      });
      await this.guilds.getGuild(data.id).delete("."); // This won't error even if it can't be found
    }
  }

  async [GatewayDispatchEvents.ChannelCreate](
    data: GatewayChannelCreateDispatchData
  ) {
    if (!data.guild_id) {
      return; // DMs are not used and therefore would be a waste of memory
    }
    await this.guilds.getGuild(data.guild_id).saveNewChannel(data);
  }
  async [GatewayDispatchEvents.ChannelUpdate](
    data: GatewayChannelUpdateDispatchData
  ) {
    // Overwrite since all data used is included
    if (!data.guild_id) {
      return; // DMs are not used and therefore would be a waste of memory
    }
    const guild = this.guilds.getGuild(data.guild_id);
    const newParsedData = parseChannel(data);
    try {
      const oldData = await guild.getChannel(data.id);
      if (!oldData) {
        await guild.saveNewChannel(data);
        return;
      }
      const newData = mergeChannel(oldData, newParsedData);
      await guild.overwriteNewChannel(data.id, newData);
    } catch (error) {
      if (error instanceof GuildNotFound || error instanceof GuildUnavailable) {
        return;
      } else {
        throw error;
      }
    }
  }

  async [GatewayDispatchEvents.ChannelDelete](
    data: GatewayChannelDeleteDispatchData
  ) {
    if (!data.guild_id) {
      return; // DMs are not used and therefore would be a waste of memory
    }
    await this.guilds.getGuild(data.guild_id).deleteChannel(data.id);
  }

  async [GatewayDispatchEvents.GuildRoleCreate](
    data: GatewayGuildRoleCreateDispatchData
  ) {
    await this.guilds.getGuild(data.guild_id).saveNewRole(data.role);
  }

  async [GatewayDispatchEvents.GuildRoleUpdate](
    data: GatewayGuildRoleUpdateDispatchData
  ) {
    await this.guilds.getGuild(data.guild_id).saveNewRole(data.role);
  }

  async [GatewayDispatchEvents.GuildRoleDelete](
    data: GatewayGuildRoleDeleteDispatchData
  ) {
    await this.guilds.getGuild(data.guild_id).deleteRole(data.role_id);
  }

  async [GatewayDispatchEvents.ThreadCreate](
    data: GatewayThreadCreateDispatchData
  ) {
    if (!data.guild_id) {
      return; // This should never happen but whatever
    }
    await this.guilds.getGuild(data.guild_id).saveNewThread(data);
  }
  async [GatewayDispatchEvents.ThreadUpdate](
    data: GatewayThreadUpdateDispatchData
  ) {
    if (!data.guild_id) {
      return; // This should never happen but whatever
    }
    await this.guilds.getGuild(data.guild_id).saveNewThread(data);
  }
  async [GatewayDispatchEvents.ThreadDelete](
    data: GatewayThreadDeleteDispatchData
  ) {
    if (!data.guild_id) {
      return; // This should never happen but whatever
    }
    await this.guilds.getGuild(data.guild_id).deleteThread(
      data.id,
      data.parent_id! // This is included -> https://discord.com/developers/docs/topics/gateway#thread-delete
    );
  }
  async [GatewayDispatchEvents.ThreadListSync](
    data: GatewayThreadListSyncDispatchData
  ) {
    // Most logic for this function taken from https://github.com/discordjs/discord.js/blob/01f8d1bed564a07d40b184dc7ff686a895ddda31/src/client/actions/ThreadListSync.js
    const guild = this.guilds.getGuild(data.guild_id);
    try {
      // Clear the threads
      if (data.channel_ids) {
        for (const channelId of data.channel_ids) {
          const channel = await guild.getChannel(channelId);
          if (channel && channel.threads) {
            for (const threadId of channel.threads) {
              const thread = await guild.getChannel(threadId);
              if (!(!thread || !thread.archived)) {
                await guild.deleteChannel(threadId);
              }
            }
          }
        }
      } else {
        const { channels } = await guild.toStatic();
        for (const channelId in channels) {
          if (Object.prototype.hasOwnProperty.call(channels, channelId)) {
            const channel = channels[channelId];
            if (channel.threads) {
              for (const threadId of channel.threads) {
                const thread = await guild.getChannel(threadId);
                if (!(!thread || !thread.archived)) {
                  await guild.deleteChannel(threadId);
                }
              }
            }
          }
        }
      }

      for (const thread of data.threads) {
        await guild.saveNewThread(thread);
      }
    } catch (error) {
      if (error instanceof GuildNotFound) {
        return;
      } else {
        this._logger.error(`Error syncing threads`, error);
      }
    }
  }
  async [GatewayDispatchEvents.GuildMemberUpdate](
    data: GatewayGuildMemberUpdateDispatchData
  ) {
    // If clientId on _redis is not the same as the id on the data, then the event is not for the bot process and therefore should be ignored
    if (this._redis.clientId !== data.user.id) {
      return;
    }
    // This will only contain the bot's roles since the members privileged intent should be disabled
    await this.guilds.getGuild(data.guild_id).setValue({
      path: "botMemberRoles",
      value: data.roles,
    });
  }
}

export { GatewayEventHandler };
