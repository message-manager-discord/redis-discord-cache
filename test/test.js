const {
  createGatewayConnection,
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

  await createGatewayConnection({
    redis: { port: 7000 },
    discord: {
      token: token,
      shardCount: 4,
      shardId: 0,
    },
    logger,
  });
  logger.info("waiting for 6 seconds");
  await new Promise((resolve) => setTimeout(resolve, 6000));
  logger.info("finished waiting");
  await createGatewayConnection({
    redis: { port: 7000 },
    discord: {
      token: token,
      shardCount: 4,
      shardId: 1,
    },
    logger,
  });
  logger.info("waiting for 6 seconds");
  await new Promise((resolve) => setTimeout(resolve, 6000));
  logger.info("finished waiting");
  await createGatewayConnection({
    redis: { port: 7000 },
    discord: {
      token: token,
      shardCount: 4,
      shardId: 2,
    },
    logger,
  });
  logger.info("waiting for 6 seconds");
  await new Promise((resolve) => setTimeout(resolve, 6000));
  logger.info("finished waiting");
  await createGatewayConnection({
    redis: { port: 7000 },
    discord: {
      token: token,
      shardCount: 4,
      shardId: 3,
    },
    logger,
  });
  let name;
  const guildManager = createRedisClient({ port: 7000, logger });
  while (!name) {
    try {
      name = await guildManager.getGuild("").name; // Should Throw
    } catch (e) {}
  }
  console.log(name);
  process.exit(0);
};
main();
