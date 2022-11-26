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
        level: "debug",
      }),
    ],
    exitOnError: false,
  });

  const token = "NzYwNzc4MzcwMTE5NzYxOTIx.X3RAEg.g_5_8Wg6QwOf2VrF6JW68Hs8cr8";
  const client = new GatewayClient({
    redis: { port: 6377 },
    discord: {
      token: token,
      shardCount: 1,
      shardId: 0,
    },
    logger,
  });
  await client.connect();
  logger.info("waiting for 20 seconds");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const GuildManager = createRedisClient({ port: 6377, logger });
  console.log("testmultiple");
  try {
    console.log(
      await GuildManager.getGuildIconsAndNames([
        "719080176465477642",
        "a",
        "975871933306535946",
      ])
    );
  } catch (e) {
    console.log(e);
  }

  logger.info("finished waiting");
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(await GuildManager.getGuildCount());
  console.log("checking 1");
  console.log(await GuildManager.getGuildWithActiveCheck("975871933306535946"));
  console.log("checking 2");

  GuildManager.getGuild("7190801764654776aa42")
    .getRoles([])
    .then((roles) => console.log(roles))
    .catch((e) => console.error(e));
};
main();
