import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const contractsRoot = path.resolve(process.cwd(), "..", "contracts");
const pairs = [
  [contractsRoot,
    "commercial-template-v0.2.schema.json",
    "commercial-template-platform-promo-v0.2.example.json",
  ],
  [contractsRoot, "evaluation-result-v0.3.schema.json", "evaluation-result-v0.3.example.json"],
  [path.resolve(process.cwd(), "contracts"), "product-expression-v0.1.schema.json", "product-expression-v0.1.example.json"],
];

for (const [root, schemaName, exampleName] of pairs) {
  test(`${exampleName} conforms to ${schemaName}`, async () => {
    const [schema, example] = await Promise.all(
      [schemaName, exampleName].map(async (name) =>
        JSON.parse(await readFile(path.join(root, name), "utf8")),
      ),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const valid = validate(example);
    assert.equal(valid, true, JSON.stringify(validate.errors, null, 2));
  });
}
