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

Two functions are exposed by the library, these create a gateway connect and connect to the cache.

### Gateway Connect

`createGatewayConnection`
This connects to the discord gateway and populates the redis cache. Only one instance should be created.

This function takes three options:

- redis: An object containing the redis connection information.
  - port: The port of the redis instance.
  - host: The hostname of the redis instance.
- discord: An object containing the discord connection information.

  - token: The token of the discord bot.
  - presence: An object containing the presence information for the bot. See the [detritusjs docs for more info](https://socket.detritusjs.com/interfaces/gateway.presenceoptions)

- logger: A winston logger instance. This is optional and will [default](https://github.com/message-manager-discord/redis-discord-cache/blob/main/src/logger.ts) to a console logger with the level INFO if not provided and will catch exceptions. Pass a [winston logger instance](https://github.com/winstonjs/winston#creating-your-own-logger) to have more control over output and log levels.

### Redis Client

`createRedisClient`
Connects to an existing redis cache (one that is created by the gateway connect function). This is useful if you want to use the cache in a separate process. Multiple clients can be created and used in parallel.

This function has two parameters:

- port: The port of the redis instance.
- host: The hostname of the redis instance.
- logger: A winston logger instance. (same as above)
