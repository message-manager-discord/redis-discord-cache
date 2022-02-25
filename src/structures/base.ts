import {
  Snowflake,
  GatewayGuildCreateDispatchData,
} from "discord-api-types/v9";
import { bigIntParse, bigIntStringify } from "../json";
import ReJSONCommands from "../redis";
import {
  CachedMinimalChannel,
  CachedMinimalGuild,
  CachedMinimalRole,
  UnavailableGuild,
} from "./types";

type CreateDataMinimals =
  | CachedMinimalGuild
  | CachedMinimalChannel
  | CachedMinimalRole
  | UnavailableGuild;

export const makeStructureKey = (
  structureName: string,
  structureId: Snowflake
) => `${structureName}:${structureId}`;

interface CachedCommand {
  result: string;
  time: number;
}

export default abstract class BaseStructure<Key, Value> {
  readonly _redis: ReJSONCommands;
  abstract readonly _structureName: string; // MUST be set by

  _cachedValues: Record<string, CachedCommand> = {}; // This cache works of the assumption that guild objects will be short lived

  id: Snowflake;
  constructor(id: Snowflake, { redis }: { redis: ReJSONCommands }) {
    this._redis = redis;
    this.id = id;
  }

  toJSON(): Promise<Value> {
    return this._redis.get({
      key: makeStructureKey(this._structureName, this.id),
    });
  }

  private async _checkTimestampCached(
    name: string,
    data: CachedCommand
  ): Promise<void> {
    const now = Date.now();
    if (now - data.time > 1000 * 15) {
      // max cached for 15 seconds
      // Cache expired
      delete this._cachedValues[name];
    }
  }
  async get(path: string | string[]): Promise<any> {
    const pathAsString = typeof path === "string" ? path : path.join(".");
    if (pathAsString in this._cachedValues) {
      const cached = this._cachedValues[pathAsString];
      this._checkTimestampCached(pathAsString, cached); // We don't care about the result of this
      return bigIntParse(cached.result);
    } else {
      const data = await this._redis.get({
        key: `${this._structureName}:${this.id}`,
        path,
      });
      this._cachedValues[pathAsString] = {
        result: data,
        time: Date.now(),
      };
      return bigIntParse(data);
    }
  }

  async delete(path: string | string[]): Promise<void> {
    await this._redis.delete({
      key: `${this._structureName}:${this.id}`,
      path,
    });
  }

  async setValue({ path, value }: { path?: string; value: any }): Promise<any> {
    return await this._redis.set({
      key: makeStructureKey(this._structureName, this.id),
      path,
      value: bigIntStringify(value),
    });
  }

  // saveNew should be implemented by subclasses (I do not know how to do this with abstract + static)
  static _baseSave(
    data: CreateDataMinimals,
    id: Snowflake,
    { redis, structureName }: { redis: ReJSONCommands; structureName: string }
  ): Promise<void> {
    return redis.set({
      key: makeStructureKey(structureName, id),
      value: bigIntStringify(data),
    });
  }
}
