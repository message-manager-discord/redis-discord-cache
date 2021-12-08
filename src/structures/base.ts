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

export default abstract class BaseStructure<Key, Value> {
  readonly _redis: ReJSONCommands;
  abstract readonly _structureName: string; // MUST be set by

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
  async get(path: string | string[]): Promise<any> {
    return bigIntParse(
      await this._redis.get({
        key: `${this._structureName}:${this.id}`,
        path,
      })
    );
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
