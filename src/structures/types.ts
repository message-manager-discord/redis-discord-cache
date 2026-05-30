import type {
  APIGuildCategoryChannel,
  APIGuildForumChannel,
  APIGuildMediaChannel,
  APIGuildStageVoiceChannel,
  APIGuildVoiceChannel,
  APINewsChannel,
  APITextChannel,
  APIThreadChannel,
  ChannelType,
  OverwriteType,
  Snowflake,
} from "discord-api-types/v9";

type GuildChannel =
  | APITextChannel
  | APINewsChannel
  | APIGuildVoiceChannel
  | APIGuildStageVoiceChannel
  | APIGuildCategoryChannel
  | APIThreadChannel
  | APIGuildForumChannel
  | APINewsChannel
  | APIGuildMediaChannel;

type CachedMinimalRole = {
  name: string;
  icon?: string | null;
  unicode_emoji?: string | null;
  color: number;
  permissions: bigint;
  position: number;
};

type MinimalRole = CachedMinimalRole & {
  id: Snowflake;
};

type DMChannelTypes = ChannelType.DM | ChannelType.GroupDM;

type GuildVoiceChannelTypes =
  | ChannelType.GuildVoice
  | ChannelType.GuildStageVoice;

type NonTextGuildChannelTypes =
  | ChannelType.GuildCategory
  | ChannelType.GuildForum;

type NonThreadTextGuildChannelTypes =
  | ChannelType.GuildNews
  | ChannelType.GuildText;

type GuildThreadTypes =
  | ChannelType.GuildNewsThread
  | ChannelType.GuildPrivateThread
  | ChannelType.GuildPublicThread;

type GuildChannelTypes =
  | NonTextGuildChannelTypes
  | NonThreadTextGuildChannelTypes
  | GuildThreadTypes;

type GuildTextChannelTypes = NonThreadTextGuildChannelTypes | GuildThreadTypes;

type NotThreadChannelTypes =
  | DMChannelTypes
  | GuildVoiceChannelTypes
  | NonTextGuildChannelTypes
  | NonThreadTextGuildChannelTypes;

interface ChannelOverwrite {
  id: Snowflake;
  type: OverwriteType;
  allow: bigint;
  deny: bigint;
}

type ChannelOverwritesObject = Record<Snowflake, ChannelOverwrite>;

interface CachedMinimalChannel {
  name?: string;
  parent_id?: Snowflake | null;
  permission_overwrites?: ChannelOverwritesObject;
  type: ChannelType;
  position?: number;
  archived?: boolean;
  locked?: boolean;
  threads?: Snowflake[];
}

interface MinimalChannel extends CachedMinimalChannel {
  id: Snowflake;
}

type CachedChannelsObject = Record<Snowflake, CachedMinimalChannel>;
type ChannelsObject = Record<Snowflake, MinimalChannel>;

type CachedRolesObject = Record<Snowflake, CachedMinimalRole>;
type RolesObject = Record<Snowflake, MinimalRole>;
/*This is since unavailable and channels aren't included in events after GuildCreate */
interface CachedMinimalGuild {
  unavailable: boolean;
  botMemberRoles: Snowflake[];
  name: string;
  icon: string | null;
  owner_id: Snowflake;
  channels: CachedChannelsObject;

  roles: CachedRolesObject;
}

interface UnavailableGuild {
  unavailable: boolean;
}
export {
  CachedChannelsObject,
  CachedMinimalChannel,
  CachedMinimalGuild,
  CachedMinimalRole,
  CachedRolesObject,
  ChannelOverwrite,
  ChannelOverwritesObject,
  ChannelsObject,
  DMChannelTypes,
  GuildChannel,
  GuildChannelTypes,
  GuildTextChannelTypes,
  GuildThreadTypes,
  GuildVoiceChannelTypes,
  MinimalChannel,
  MinimalRole,
  NonTextGuildChannelTypes,
  NonThreadTextGuildChannelTypes,
  NotThreadChannelTypes,
  RolesObject,
  UnavailableGuild,
};
