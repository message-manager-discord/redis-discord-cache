const {
  GatewayClient,
  createRedisClient,
  clearGuildsAboveShardCount,
} = require("../dist/index");

const winston = require("winston");

const main = async () => {
  const logger = winston.createLogger({
    level: "info",
    transports: [
      new winston.transports.File({
        filename: "logs/test.log",
        format: winston.format.simple(),
        handleExceptions: true,
        level: "info",
      }),
    ],
    exitOnError: false,
  });

  const token = "";
  const client = new GatewayClient({
    redis: { port: 6378 },
    discord: {
      token: token,
      shardCount: 1,
      shardId: 0,
    },
    logger,
  });
  await client.connect();
};
main();
