import { APIChannel, Snowflake } from "discord-api-types/v9";
import {
  CachedChannelsObject,
  CachedMinimalChannel,
  ChannelOverwritesObject,
} from "./types";

const parseChannel = (channel: APIChannel): CachedMinimalChannel => ({
  name: channel.name,
  parent_id: channel.parent_id,
  permission_overwrites: channel.permission_overwrites?.reduce(
    (obj, overwrite): ChannelOverwritesObject => ({
      ...obj,
      [overwrite.id]: {
        id: overwrite.id,
        type: overwrite.type,
        allow: BigInt(overwrite.allow),
        deny: BigInt(overwrite.deny),
      },
    }),
    {}
  ),
  type: channel.type,
  position: channel.position,
  threads: [],
});

const parseThreadChannel = (thread: APIChannel): CachedMinimalChannel => ({
  name: thread.name,
  parent_id: thread.parent_id,
  archived: thread.thread_metadata?.archived,
  locked: thread.thread_metadata?.locked,
  type: thread.type,
});

const parseChannels = (
  channelsData?: APIChannel[],
  threadsData?: APIChannel[]
): CachedChannelsObject => {
  let channels: CachedChannelsObject = {};
  if (threadsData) {
    channels = threadsData.reduce(
      (obj, thread): CachedChannelsObject => ({
        ...obj,
        [thread.id]: parseThreadChannel(thread),
      }),
      channels
    );
  }
  const threadParentMap: Record<Snowflake, Snowflake[]> = {};
  for (const channelId in channels) {
    if (Object.prototype.hasOwnProperty.call(channels, channelId)) {
      const channel = channels[channelId];
      if (channel.parent_id) {
        if (!threadParentMap[channel.parent_id]) {
          threadParentMap[channel.parent_id] = [channelId];
        } else {
          threadParentMap[channel.parent_id].push(channelId);
        }
      }
    }
  }
  if (channelsData) {
    channels = channelsData.reduce((obj, channel): CachedChannelsObject => {
      const parsedData = parseChannel(channel);
      if (threadParentMap[channel.id]) {
        parsedData.threads = threadParentMap[channel.id];
      }
      return {
        ...obj,
        [channel.id]: parsedData,
      };
    }, channels);
  }

  return channels;
};

const mergeChannel = (
  oldData: CachedMinimalChannel,
  newData: CachedMinimalChannel
): CachedMinimalChannel => {
  console.log(oldData);
  console.log(newData);
  return {
    threads: oldData.threads, // This is dependent on different events (not the channelUpdate event)
    name: newData.name,
    parent_id: newData.parent_id,
    permission_overwrites: newData.permission_overwrites,
    type: newData.type,
    position: newData.position,
    archived: newData.archived,
    locked: newData.locked,
  };
};

export { parseChannels, parseChannel, parseThreadChannel, mergeChannel };
