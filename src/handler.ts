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
import { Snowflake, ChannelType, APIThreadChannel } from "discord-api-types/v9";
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
import GatewayClient from "./gateway";

// Design inspired from https://github.com/detritusjs/client/blob/b27cbaa5bfb48506b059be178da0e871b83ba95e/src/gateway/handler.ts#L146
class GatewayEventHandler {
  private _redis: ReJSONCommands;
  private _logger: winston.Logger;
  private _shardId: number;
  client: GatewayClient;
  guilds: GuildManager;

  constructor(
    client: GatewayClient,
    redis: ReJSONCommands,
    logger: winston.Logger,
    shardId: number
  ) {
    this._redis = redis;
    this._logger = logger;
    this._shardId = shardId;
    this.client = client;
    this.guilds = new GuildManager(redis);
  }
  async [GatewayDispatchEvents.Ready](
    data: GatewayReadyDispatchData,
    client: Socket
  ) {
    const newShardGuilds = data.guilds.map((guild) => guild.id);
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
    await this._redis.nonJSONset({
      key: `shard:${this._shardId}:guildCount`,
      value: 0, // This will be updated to the correct value when receiving GuildCreate events
    });
    this.client.clientId = data.user.id;
    await this._redis.set({ key: "clientId", value: data.user.id });
    client.emit("readyParsed"); // So events are not processed until ready
  }
  async [GatewayDispatchEvents.GuildCreate](
    data: GatewayGuildCreateDispatchData
  ) {
    await Guild.saveNew(data, { redis: this._redis, client: this.client });
    // This command must be first. This is because a GUILD_MEMBER_UPDATE is sent immediately after
    // the GUILD_CREATE event. Due to the async nature of handling if this command is not sent first,
    // the member roles will be attempted to be updated on the guild before the guild is created.
    await insertGuildIntoShardArray({
      guildId: data.id,
      shardId: this._shardId,
      redis: this._redis,
    });

    await this._redis.nonJSONincr({ key: `shard:${this._shardId}:guildCount` });
  }
  async [GatewayDispatchEvents.GuildUpdate](
    data: GatewayGuildUpdateDispatchData
  ) {
    const guild = this.guilds.getGuildNoCacheChecks(data.id);
    const newParsedData = parseGuildData(
      data,
      this.client.clientId! // Must be set as READY event was received
    );
    try {
      const oldData = await guild.toStatic();
      const newData = mergeGuilds(oldData, newParsedData);
      await guild.overwrite(newData);
    } catch (error) {
      if (error instanceof GuildNotFound) {
        await Guild.saveNew(data, { redis: this._redis, client: this.client });
        await this._redis.nonJSONincr({
          key: `shard:${this._shardId}:guildCount`,
        });
      } else if (error instanceof GuildUnavailable) {
        await guild.overwrite(newParsedData);
        await this._redis.nonJSONincr({
          key: `shard:${this._shardId}:guildCount`,
        });
        // Unavailable guilds are not counted in the guild count since that would mean an addition call
        // on guild create to check if it was a new guild or an unavailable guild made available
      } else {
        this._logger.error(`Error updating guild ${data.id}`, error);
      }
      if (data.id === "796460453248368732") {
        console.log(JSON.stringify(data));
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
      await this.guilds.getGuildNoCacheChecks(data.id).delete("."); // This won't error even if it can't be found
    }

    await this._redis.nonJSONdecr({ key: `shard:${this._shardId}:guildCount` });
  }

  async [GatewayDispatchEvents.ChannelCreate](
    data: GatewayChannelCreateDispatchData
  ) {
    if (
      data.type === ChannelType.DM ||
      data.type === ChannelType.GroupDM ||
      !data.guild_id
    ) {
      return; // DMs are not used and therefore would be a waste of memory
    }
    await this.guilds.getGuildNoCacheChecks(data.guild_id).saveNewChannel(data);
  }
  async [GatewayDispatchEvents.ChannelUpdate](
    data: GatewayChannelUpdateDispatchData
  ) {
    // Overwrite since all data used is included
    if (
      data.type === ChannelType.DM ||
      data.type === ChannelType.GroupDM ||
      !data.guild_id
    ) {
      return; // DMs are not used and therefore would be a waste of memory
    }
    const guild = this.guilds.getGuildNoCacheChecks(data.guild_id);
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
    if (
      data.type === ChannelType.DM ||
      data.type === ChannelType.GroupDM ||
      !data.guild_id
    ) {
      return; // DMs are not used and therefore would be a waste of memory
    }
    await this.guilds
      .getGuildNoCacheChecks(data.guild_id)
      .deleteChannel(data.id);
  }

  async [GatewayDispatchEvents.GuildRoleCreate](
    data: GatewayGuildRoleCreateDispatchData
  ) {
    await this.guilds
      .getGuildNoCacheChecks(data.guild_id)
      .saveNewRole(data.role);
  }

  async [GatewayDispatchEvents.GuildRoleUpdate](
    data: GatewayGuildRoleUpdateDispatchData
  ) {
    await this.guilds
      .getGuildNoCacheChecks(data.guild_id)
      .saveNewRole(data.role);
  }

  async [GatewayDispatchEvents.GuildRoleDelete](
    data: GatewayGuildRoleDeleteDispatchData
  ) {
    await this.guilds
      .getGuildNoCacheChecks(data.guild_id)
      .deleteRole(data.role_id);
  }

  async [GatewayDispatchEvents.ThreadCreate](
    data: GatewayThreadCreateDispatchData
  ) {
    if (!data.guild_id) {
      return; // This should never happen but whatever
    }
    await this.guilds.getGuildNoCacheChecks(data.guild_id).saveNewThread(data);
  }
  async [GatewayDispatchEvents.ThreadUpdate](
    data: GatewayThreadUpdateDispatchData
  ) {
    if (
      data.type === ChannelType.DM ||
      data.type === ChannelType.GroupDM ||
      !data.guild_id
    ) {
      return; // DMs are not used and therefore would be a waste of memory
    }

    await this.guilds
      .getGuildNoCacheChecks(data.guild_id)
      .saveNewThread(data as APIThreadChannel);
  }
  async [GatewayDispatchEvents.ThreadDelete](
    data: GatewayThreadDeleteDispatchData
  ) {
    if (
      data.type === ChannelType.DM ||
      data.type === ChannelType.GroupDM ||
      !data.guild_id
    ) {
      return; // DMs are not used and therefore would be a waste of memory
    }
    await this.guilds.getGuildNoCacheChecks(data.guild_id).deleteThread(
      data.id,
      data.parent_id! // This is included -> https://discord.com/developers/docs/topics/gateway#thread-delete
    );
  }
  async [GatewayDispatchEvents.ThreadListSync](
    data: GatewayThreadListSyncDispatchData
  ) {
    // Most logic for this function taken from https://github.com/discordjs/discord.js/blob/01f8d1bed564a07d40b184dc7ff686a895ddda31/src/client/actions/ThreadListSync.js
    const guild = this.guilds.getGuildNoCacheChecks(data.guild_id);
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
        await guild.saveNewThread(thread as APIThreadChannel);
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
    if (this.client.clientId !== data.user.id) {
      return;
    }
    // This will only contain the bot's roles since the members privileged intent should be disabled
    await this.guilds.getGuildNoCacheChecks(data.guild_id).setValue({
      path: "botMemberRoles",
      value: data.roles,
    });
  }
}

export { GatewayEventHandler };
