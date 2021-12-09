const { createGatewayConnection, createRedisClient } = require("../dist/index");

const main = async () => {
  createGatewayConnection({
    redis: { port: 7000 },
    discord: {
      token: "NzYwNzc4MzcwMTE5NzYxOTIx.X3RAEg.pqNPTHYiHH0UjGQpoAWn-8rXFKA",
    },
  });
  let name;
  const guildManager = createRedisClient({ port: 7000 });
  while (!name) {
    try {
      name = await guildManager.getGuild("").name; // Should Throw
    } catch (e) {}
  }
  console.log(name);
  process.exit(0);
};
main();
