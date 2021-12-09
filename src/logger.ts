import winston from "winston";

export const createDefaultLogger = (): winston.Logger => {
  return winston.createLogger({
    level: "info",
    transports: [
      new winston.transports.Console({
        format: winston.format.simple(),
        handleExceptions: true,
      }),
    ],
    exitOnError: false,
  });
};
