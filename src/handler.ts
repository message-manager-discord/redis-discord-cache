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
import { GuildNotFound, GuildUnavailable } from "./errors";
import ReJSONCommands from "./redis";

import Guild, { mergeGuilds, parseGuildData } from "./structures/guild";
import { mergeChannel, parseChannel } from "./structures/channel";
import GuildManager from "./guildManager";
import winston from "winston";

// Design inspired from https://github.com/detritusjs/client/blob/b27cbaa5bfb48506b059be178da0e871b83ba95e/src/gateway/handler.ts#L146
class GatewayEventHandler {
  private _redis: ReJSONCommands;
  private _logger: winston.Logger;
  guilds: GuildManager;

  constructor(redis: ReJSONCommands, logger: winston.Logger) {
    this._redis = redis;
    this._logger = logger;
    this.guilds = new GuildManager(redis);
  }
  async [GatewayDispatchEvents.Ready](data: GatewayReadyDispatchData) {
    data.guilds.forEach(async (guild) => {
      await Guild.saveNewUnavailable(guild, { redis: this._redis });
    });
    this._redis.clientId = data.user.id;
  }
  async [GatewayDispatchEvents.GuildCreate](
    data: GatewayGuildCreateDispatchData
  ) {
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
      await Guild.saveNewUnavailable(data, { redis: this._redis });
    } else {
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
