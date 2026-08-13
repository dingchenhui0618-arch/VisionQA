import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const contractsRoot = path.resolve(process.cwd(), "..", "contracts");
const pairs = [
  [
    "commercial-template-v0.2.schema.json",
    "commercial-template-platform-promo-v0.2.example.json",
  ],
  ["evaluation-result-v0.3.schema.json", "evaluation-result-v0.3.example.json"],
];

for (const [schemaName, exampleName] of pairs) {
  test(`${exampleName} conforms to ${schemaName}`, async () => {
    const [schema, example] = await Promise.all(
      [schemaName, exampleName].map(async (name) =>
        JSON.parse(await readFile(path.join(contractsRoot, name), "utf8")),
      ),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const valid = validate(example);
    assert.equal(valid, true, JSON.stringify(validate.errors, null, 2));
  });
}
