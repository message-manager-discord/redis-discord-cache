import {
  GatewayGuildCreateDispatchData,
  GatewayGuildUpdateDispatchData,
  GatewayThreadCreateDispatchData,
  Snowflake,
  APIRole,
  APIThreadChannel,
  ChannelType,
} from "discord-api-types/v9";
import ReJSONCommands from "../redis";
import BaseStructure, { makeStructureKey } from "./base";
import { Permissions, PERMISSIONS_ALL } from "./consts";
import {
  CachedMinimalChannel,
  CachedMinimalGuild,
  CachedMinimalRole,
  CachedRolesObject,
  GuildChannel,
  MinimalChannel,
  MinimalRole,
  RolesObject,
} from "./types";

const _structureName = "guild";
import { GuildNotFound, GuildUnavailable } from "../errors";
import { parseChannel, parseChannels, parseThreadChannel } from "./channel";
import { bigIntStringify } from "../json";
import GatewayClient from "../gateway";

export default class Guild extends BaseStructure<
  Snowflake,
  CachedMinimalGuild
> {
  _structureName = _structureName;
  constructor(id: Snowflake, { redis }: { redis: ReJSONCommands }) {
    super(id, { redis });
  }
  static saveNewUnavailable(
    data: { id: Snowflake; unavailable: boolean },
    { redis }: { redis: ReJSONCommands }
  ) {
    const strippedDownData = { unavailable: data.unavailable };
    return this._baseSave(strippedDownData, data.id, {
      redis,
      structureName: _structureName,
    });
  }
  static saveNew(
    data: GatewayGuildCreateDispatchData,
    { redis, client }: { redis: ReJSONCommands; client: GatewayClient }
  ) {
    return this._baseSave(
      parseGuildData(
        data,
        client.clientId! // Must be set as READY event was received
      ),
      data.id,
      {
        redis,
        structureName: _structureName,
      }
    );
  }

  overwrite(data: CachedMinimalGuild): Promise<void> {
    return Guild._baseSave(data, this.id, {
      redis: this._redis,
      structureName: _structureName,
    });
  }

  async toStatic(): Promise<CachedMinimalGuild> {
    return this.get(".") as Promise<CachedMinimalGuild>;
  }

  async saveNewRole(data: APIRole): Promise<any> {
    try {
      return await this.setValue({
        path: `roles["${data.id}"]`,
        value: parseRoleData(data),
      });
    } catch (e: any) {
      if (!e.command) throw e; // command exists on ReplyError
      // Ignore, as guild can't be found. This will catch more than it should, however i don't think it can be helped with the current state of REDISJSON
    }
  }

  async saveNewChannel(data: GuildChannel): Promise<any> {
    try {
      return await this.setValue({
        path: `channels["${data.id}"]`,
        value: parseChannel(data),
      });
    } catch (e: any) {
      if (!e.command) throw e; // command exists on ReplyError
      // Ignore, as guild can't be found. This will catch more than it should, however i don't think it can be helped with the current state of REDISJSON
    }
  }

  async overwriteNewChannel(
    id: Snowflake,
    data: CachedMinimalChannel
  ): Promise<any> {
    try {
      return await this.setValue({
        path: `channels["${id}"]`,
        value: data,
      });
    } catch (e: any) {
      if (!e.command) throw e; // command exists on ReplyError
      // Ignore, as guild can't be found. This will catch more than it should, however i don't think it can be helped with the current state of REDISJSON
    }
  }

  async saveNewThread(data: GatewayThreadCreateDispatchData): Promise<any> {
    if (data.parent_id) {
      const parentChannel = await this.getChannel(data.parent_id);
      if (parentChannel && !parentChannel.threads?.includes(data.id)) {
        // Update threads on parent channel
        const threadPath = `channels["${data.parent_id}"]["threads"]`;

        await this._redis.arrAppend({
          key: makeStructureKey(this._structureName, this.id),
          path: threadPath,
          value: bigIntStringify(data.id),
        });
      }
    }

    return await this.setValue({
      path: `channels["${data.id}"]`,
      value: parseThreadChannel(data),
    });
  }

  async deleteThread(id: Snowflake, parent_id: Snowflake): Promise<void> {
    // Update threads on parent channel
    const threadPath = `channels["${parent_id}"]["threads"]`;

    const parentChannel = await this.getChannel(parent_id);
    if (parentChannel) {
      const indexCurrentThread = await this._redis.arrIndex({
        key: makeStructureKey(this._structureName, this.id),
        path: threadPath,
        value: bigIntStringify(id),
      });
      if (indexCurrentThread !== -1) {
        // -1 means it's not there
        await this._redis.arrPop({
          key: makeStructureKey(this._structureName, this.id),
          path: threadPath,
          index: bigIntStringify(indexCurrentThread),
        });
      }
    }
    await this.deleteChannel(id);
  }

  async deleteChannel(id: Snowflake): Promise<void> {
    await this.delete(`channels["${id}"]`);
  }

  async deleteRole(id: Snowflake): Promise<void> {
    await this.delete(`roles["${id}"]`);
  }

  async get(path: string | string[]): Promise<any> {
    let parsedPath: string[];
    if (typeof path === "string") {
      parsedPath = [path, "unavailable"];
    } else {
      parsedPath = path.concat(["unavailable"]);
    }
    let data;
    try {
      data = (await super.get(parsedPath)) as Record<string, any>;
    } catch (e: any) {
      if (!e.command) throw e; // command exists on ReplyError
      data = null;
    }

    if (!data) {
      throw new GuildNotFound("Guild not found");
    } else if (data.unavailable || data.unavailable === null) {
      throw new GuildUnavailable("Guild unavailable");
    }
    delete data.unavailable;
    if (typeof path === "string") {
      return data[path];
    } else {
      return data;
    }
  }

  get clientId(): Promise<string> {
    return this._redis.get({ key: "clientId" });
  }

  get name(): Promise<string> {
    return this.get(`name`);
  }

  get icon(): Promise<string> {
    return this.get(`icon`);
  }

  get ownerId(): Promise<Snowflake> {
    return this.get(`owner_id`);
  }

  async _getBotMemberRoles(): Promise<Snowflake[]> {
    return this.get("botMemberRoles") as Promise<Snowflake[]>;
  }

  get botMemberRoles(): Promise<Snowflake[]> {
    return this._getBotMemberRoles();
  }

  async getRole(id: Snowflake): Promise<MinimalRole | null> {
    const role = (await this.get(`roles['${id}']`)) as CachedMinimalRole | null;
    if (!role) return role;
    return {
      id,
      ...role,
    };
  }
  async setRole(id: Snowflake, data: CachedMinimalRole): Promise<void> {
    await this.setValue({ path: `roles['${id}']`, value: data });
  }
  async getRoles(ids: Snowflake[]): Promise<RolesObject | null> {
    const cached = (await this.get(
      ids.map((roleId) => `roles['${roleId}']`)
    )) as CachedRolesObject | null;

    if (cached === null) {
      return null;
    }
    let parsed: RolesObject = {};

    Object.entries(cached).forEach((roleEntry) => {
      const roleId = roleEntry[0].replace(/roles\['|'\]/g, "");
      parsed[roleId] = {
        id: roleId,
        ...roleEntry[1],
      };
    });
    return parsed;
  }
  async getChannel(id: Snowflake): Promise<MinimalChannel | null> {
    let channel: CachedMinimalChannel | null;
    try {
      channel = (await this.get(
        `channels["${id}"]`
      )) as CachedMinimalChannel | null;
    } catch (error) {
      if (error instanceof GuildNotFound) {
        channel = null;
        this.name; // This *should* throw is guild is not found
      } else {
        throw error;
      }
    }
    if (!channel) return channel;
    return {
      id,
      ...channel,
    };
  }

  // https://discord.com/developers/docs/topics/permissions#permission-overwrites
  async calculateGuildPermissions(
    userId: Snowflake,
    roles: Snowflake[]
  ): Promise<bigint> {
    if (userId === (await this.ownerId)) {
      return PERMISSIONS_ALL;
    }
    const allRoles = await this.getRoles(roles.concat([this.id]));
    if (!allRoles) return Permissions.NONE;
    const everyoneRole = allRoles[this.id];
    let permissions = Permissions.NONE;
    if (everyoneRole) permissions = everyoneRole.permissions;
    roles.forEach((roleId) => {
      const role = allRoles[roleId];
      if (role) {
        permissions |= role.permissions;
      }
    });
    if (
      (permissions & Permissions.ADMINISTRATOR) ===
      Permissions.ADMINISTRATOR
    ) {
      return PERMISSIONS_ALL;
    }
    return permissions;
  }

  async calculateBotGuildPermissions(): Promise<bigint> {
    const botId = await this.clientId;
    const botMemberRoles = await this.botMemberRoles;
    return await this.calculateGuildPermissions(botId, botMemberRoles);
  }

  // https://discord.com/developers/docs/topics/permissions#permission-overwrites
  async calculateChannelPermissions(
    userId: Snowflake,
    roles: Snowflake[],
    channelId: Snowflake
  ): Promise<bigint> {
    let channel = await this.getChannel(channelId);
    if (!channel) {
      throw new Error("Channel not cached!");
    }
    if (
      channel.type === ChannelType.GuildNewsThread ||
      channel.type === ChannelType.GuildPrivateThread ||
      channel.type === ChannelType.GuildPublicThread
    ) {
      channel = await this.getChannel(channel.parent_id!);
      if (!channel) {
        throw new Error("Channel not cached!");
      }
    }

    const guildPermissions = await this.calculateGuildPermissions(
      userId,
      roles
    );
    if (
      (guildPermissions & Permissions.ADMINISTRATOR) ===
      Permissions.ADMINISTRATOR
    ) {
      return PERMISSIONS_ALL;
    }
    if (!channel.permission_overwrites) return guildPermissions;
    let total = guildPermissions;
    const overwrites = channel.permission_overwrites;
    const overwriteEveryone = overwrites[this.id];
    if (overwriteEveryone) {
      total &= ~overwriteEveryone.deny;
      total |= overwriteEveryone.allow;
    }

    let overwritesAllow = Permissions.NONE;
    let overwritesDeny = Permissions.NONE;

    roles.forEach((roleId) => {
      const overwriteRole = overwrites[roleId];
      if (overwriteRole) {
        overwritesAllow |= overwriteRole.allow;
        overwritesDeny |= overwriteRole.deny;
      }
    });
    total &= ~overwritesDeny;
    total |= overwritesAllow;

    const memberOverwrite = overwrites[userId]; // User exists since this is not used on MESSAGE_CREATE events
    if (memberOverwrite) {
      total &= ~memberOverwrite.deny;
      total |= memberOverwrite.allow;
    }
    return total;
  }
  async calculateBotChannelPermissions(channelId: Snowflake): Promise<bigint> {
    const botId = await this.clientId;
    const botMemberRoles = await this.botMemberRoles;
    return await this.calculateChannelPermissions(
      botId,
      botMemberRoles,
      channelId
    );
  }

  async getUsersHighestRolePosition(roles: Snowflake[]): Promise<number> {
    const allRoles = await this.getRoles(roles);
    if (!allRoles) return 0;
    let highestPosition = 0;
    // Loop over all roles and if the role is higher than the current highest, set it as the highest
    Object.entries(allRoles).forEach(([roleId, role]) => {
      if (role.position > highestPosition) {
        highestPosition = role.position;
      }
    });
    return highestPosition;
  }
}

const parseGuildData = (
  data: GatewayGuildCreateDispatchData | GatewayGuildUpdateDispatchData,
  clientId: Snowflake
): CachedMinimalGuild => {
  const botMember = data.members?.filter(
    (member) => member.user?.id === clientId
  );
  const botMemberRoles =
    botMember && botMember.length > 0 ? botMember[0].roles : [];

  const strippedDownData: CachedMinimalGuild = {
    unavailable: false,
    name: data.name,
    icon: data.icon,
    owner_id: data.owner_id,
    channels: parseChannels(
      data.channels as GuildChannel[] | undefined,
      data.threads as APIThreadChannel[] | undefined
    ),
    roles: parseRolesData(data.roles),
    botMemberRoles,
  };
  return strippedDownData;
};

const parseRolesData = (roles: APIRole[]): CachedRolesObject => {
  return roles.reduce(
    (obj, role): CachedRolesObject => ({
      ...obj,
      [role.id]: parseRoleData(role),
    }),
    {}
  );
};

const parseRoleData = (role: APIRole): CachedMinimalRole => ({
  name: role.name,
  icon: role.icon,
  color: role.color,
  permissions: BigInt(role.permissions),
  position: role.position,
  unicode_emoji: role.unicode_emoji,
});

const mergeGuilds = (
  oldData: CachedMinimalGuild,
  newData: CachedMinimalGuild
): CachedMinimalGuild => {
  return {
    channels: oldData.channels,
    unavailable: oldData.unavailable,
    botMemberRoles: oldData.botMemberRoles,
    // Above is data that is not included in extra events, only in GuildCreate events and are updated by other more specific events
    name: newData.name,
    icon: newData.icon,
    owner_id: newData.owner_id,
    roles: newData.roles,
  };
};

const insertGuildIntoShardArray = async ({
  guildId,
  shardId,
  redis,
}: {
  guildId: Snowflake;
  shardId: number;
  redis: ReJSONCommands;
}) => {
  const indexGuild = await redis.arrIndex({
    key: `shard:${shardId}`,
    value: bigIntStringify(guildId),
  });
  if (indexGuild === -1) {
    // -1 means it's not there
    await redis.arrAppend({
      key: `shard:${shardId}`,
      value: bigIntStringify(guildId),
    });
  }
};

const removeGuildFromShardArray = async ({
  guildId,
  shardId,
  redis,
}: {
  guildId: Snowflake;
  shardId: number;
  redis: ReJSONCommands;
}) => {
  const indexGuild = await redis.arrIndex({
    key: `shard:${shardId}`,
    value: bigIntStringify(guildId),
  });
  if (indexGuild !== -1) {
    // -1 means it's not there

    await redis.arrPop({
      key: `shard:${shardId}`,
      index: bigIntStringify(indexGuild),
    });
  }
};

export {
  mergeGuilds,
  parseGuildData,
  removeGuildFromShardArray,
  insertGuildIntoShardArray,
};
