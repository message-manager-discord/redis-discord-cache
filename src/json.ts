// https://dev.to/benlesh/bigint-and-json-stringify-json-parse-2m8p
const bigIntStringify = (data: any) =>
  JSON.stringify(data, (key, value) =>
    typeof value === "bigint" ? `BIGINT::${value}` : value
  );
const bigIntParse = (data: any) =>
  JSON.parse(data, (key, value) => {
    if (typeof value === "string" && value.startsWith("BIGINT::")) {
      return BigInt(value.substr(8));
    }
    return value;
  });
export { bigIntParse, bigIntStringify };
