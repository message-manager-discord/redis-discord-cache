# Redis Discord Cache

This intends to be a simple wrapper around detritus-socket that allows for easy caching of Discord objects in redis for use in external processes written in typescript. It is currently not in a public release and targeted for mainly the message manager bot, but has intentions for being a full featured library in the future. This means it is currently in development and is not yet ready for use.

## Limitations

There are a number of backed in limitations due to the current state of the library. These are not documented and are subject to change. They will be resolved before a stable release.

## License

This is licensed under the MIT license.

## Installation

Node version greater than 16 is required.

`npm i git+https://github.com/message-manager-discord/redis-discord-cache.git`

## Documentation

Two methods of connecting are exposed by the library, these create a gateway connect and connect to the cache.

### Gateway Connect

`GatewayClient`
This connects to the discord gateway and populates the redis cache. Only one instance should be created.
This returns a promise that resolves to the detritus gateway connection instance.

This class takes four options:

- redis: An object containing the redis connection information.
  - port: The port of the redis instance.
  - host: The hostname of the redis instance.
- discord: An object containing the discord connection information.

  - token: The token of the discord bot.
  - presence: An object containing the presence information for the bot. See the [detritusjs docs for more info](https://socket.detritusjs.com/interfaces/gateway.presenceoptions)
  - shardId: id of shard, see [discord docs](https://discord.com/developers/docs/topics/gateway#sharding) for more info
  - shardCount: total number of shards

- logger: A winston logger instance. This is optional and will [default](https://github.com/message-manager-discord/redis-discord-cache/blob/main/src/logger.ts) to a console logger with the level INFO if not provided and will catch exceptions. Pass a [winston logger instance](https://github.com/winstonjs/winston#creating-your-own-logger) to have more control over output and log levels.

- metrics: An object containing metric event handlers
  - onGatewayEvent: A function that will be called when a gateway event is received. takes a single argument of an object containing {name: string}
  - onRedisCommand: A function that will be called when a redis command is sent. takes a single argument of an object containing {name: string}

After creating an instance you will then need to call `connect` to connect to the gateway.

### Redis Client

`createRedisClient`
Connects to an existing redis cache (one that is created by the gateway connect function). This is useful if you want to use the cache in a separate process. Multiple clients can be created and used in parallel.

This function has two parameters:

- port: The port of the redis instance.
- host: The hostname of the redis instance.
- logger: A winston logger instance. (same as above)

### Notes on sharding

When a gateway connection is started it stores which guild were on which shard. This is used in ensuring that no stale data persists (in the case of a guild deletion during an outage). However since the calculation that determines which shard a guild is on changes when the shard count changes, this will mean that guilds that are now on different shards will be considered 'deleted' and get deleted. Therefore when changing the shard count, you **must** recommended to flush the cache. Do this with `clearCache(...)` or the redis command `FLUSHDB`. This will ensure that the cache is empty and all guilds are on the correct shard. This also does not have any negative effects on startup performance, as all guild get reset on startup anyways.  
An error will be thrown if the cache is not flushed when changing the shard count.
