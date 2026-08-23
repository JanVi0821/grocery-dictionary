#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const DEFAULTS = {
  mongoUri: "mongodb://127.0.0.1:27017",
  database: "grocery_dictionary",
  collection: "openfoodfacts_nz_raw",
  source: "openfoodfacts",
  batchSize: 100,
  maxBatchBytes: 500_000,
};

const COLUMNS = [
  "source",
  "code",
  "product_name",
  "generic_name",
  "ingredients_text",
  "origin",
  "brands",
  "last_modified_t",
  "allergens_tags",
  "ingredients",
  "ingredients_tags",
  "additives_tags",
  "ingredients_analysis",
  "categories_tags",
  "labels_tags",
  "stores",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "serving_size",
  "serving_quantity",
  "nutrition_grades",
  "nova_group",
  "nutriments",
  "image",
  "metadata",
];

const COLUMN_TYPES = {
  source: "text",
  code: "text",
  product_name: "text",
  generic_name: "text",
  ingredients_text: "text",
  origin: "text",
  brands: "text[]",
  last_modified_t: "timestamptz",
  allergens_tags: "text[]",
  ingredients: "jsonb",
  ingredients_tags: "text[]",
  additives_tags: "text[]",
  ingredients_analysis: "jsonb",
  categories_tags: "text[]",
  labels_tags: "text[]",
  stores: "text[]",
  quantity: "text",
  product_quantity: "numeric",
  product_quantity_unit: "text",
  serving_size: "text",
  serving_quantity: "numeric",
  nutrition_grades: "text",
  nova_group: "smallint",
  nutriments: "jsonb",
  image: "jsonb",
  metadata: "jsonb",
};

const PROMOTED_FIELDS = new Set([...COLUMNS, "_id", "lang"]);

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--output-dir") options.outputDir = value;
    else if (arg === "--mongo-uri") options.mongoUri = value;
    else if (arg === "--database") options.database = value;
    else if (arg === "--collection") options.collection = value;
    else if (arg === "--source") options.source = value;
    else if (arg === "--batch-size") options.batchSize = Number(value);
    else if (arg === "--max-batch-bytes") options.maxBatchBytes = Number(value);
    else if (arg === "--limit") options.limit = Number(value);
    else if (arg === "--help") {
      console.log(`Usage: node migrate-mongodb-to-supabase.mjs --output-dir DIR [options]

Options:
  --mongo-uri URI          Default: ${DEFAULTS.mongoUri}
  --database NAME          Default: ${DEFAULTS.database}
  --collection NAME        Default: ${DEFAULTS.collection}
  --source NAME            Default: ${DEFAULTS.source}
  --batch-size NUMBER      Default: ${DEFAULTS.batchSize}
  --max-batch-bytes NUMBER Default: ${DEFAULTS.maxBatchBytes}
  --limit NUMBER           Only export the first NUMBER documents
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }

    index += 1;
  }

  if (!options.outputDir) throw new Error("--output-dir is required");
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer");
  }
  if (!Number.isInteger(options.maxBatchBytes) || options.maxBatchBytes < 10_000) {
    throw new Error("--max-batch-bytes must be at least 10000");
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }

  return options;
}

function cleanJson(value) {
  if (typeof value === "string") return value.replaceAll("\0", "�");
  if (Array.isArray(value)) return value.map(cleanJson);
  if (!value || typeof value !== "object") return value;

  const keys = Object.keys(value);
  if (keys.length === 1 && "$numberLong" in value) return Number(value.$numberLong);
  if (keys.length === 1 && "$numberInt" in value) return Number(value.$numberInt);
  if (keys.length === 1 && "$numberDouble" in value) return Number(value.$numberDouble);

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cleanJson(child)]),
  );
}

function textOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function arrayOrNull(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return null;
  return value.map((item) => String(item).replaceAll("\0", "�"));
}

function commaListOrNull(value) {
  if (value === undefined || value === null) return null;
  const items = Array.isArray(value) ? value : String(value).split(",");
  const cleaned = [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
  return cleaned.length ? cleaned : null;
}

function timestampOrNull(value) {
  const seconds = numberOrNull(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function isEmptyMetadataValue(value) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
  );
}

function transform(document, source) {
  const metadata = {};
  for (const [key, rawValue] of Object.entries(document)) {
    if (PROMOTED_FIELDS.has(key)) continue;
    const value = cleanJson(rawValue);
    if (!isEmptyMetadataValue(value)) metadata[key] = value;
  }

  const code = textOrNull(document.code);
  if (!code) throw new Error("Document is missing a non-empty code");

  const novaGroup = numberOrNull(document.nova_group);

  return {
    source,
    code,
    product_name: textOrNull(document.product_name),
    generic_name: textOrNull(document.generic_name),
    ingredients_text: textOrNull(document.ingredients_text),
    origin: textOrNull(document.origin),
    brands: commaListOrNull(document.brands),
    last_modified_t: timestampOrNull(document.last_modified_t),
    allergens_tags: arrayOrNull(document.allergens_tags),
    ingredients: document.ingredients === undefined ? null : cleanJson(document.ingredients),
    ingredients_tags: arrayOrNull(document.ingredients_tags),
    additives_tags: arrayOrNull(document.additives_tags),
    ingredients_analysis:
      document.ingredients_analysis === undefined
        ? null
        : cleanJson(document.ingredients_analysis),
    categories_tags: arrayOrNull(document.categories_tags),
    labels_tags: arrayOrNull(document.labels_tags),
    stores: commaListOrNull(document.stores),
    quantity: textOrNull(document.quantity),
    product_quantity: numberOrNull(document.product_quantity),
    product_quantity_unit: textOrNull(document.product_quantity_unit),
    serving_size: textOrNull(document.serving_size),
    serving_quantity: numberOrNull(document.serving_quantity),
    nutrition_grades: textOrNull(document.nutrition_grades),
    nova_group: Number.isInteger(novaGroup) && novaGroup >= 1 && novaGroup <= 4 ? novaGroup : null,
    nutriments:
      document.nutriments && typeof document.nutriments === "object"
        ? cleanJson(document.nutriments)
        : {},
    image: document.image === undefined ? null : cleanJson(document.image),
    metadata,
  };
}

function sqlFor(rows) {
  const json = JSON.stringify(rows).replaceAll("'", "''");
  const definitions = COLUMNS.map((column) => `${column} ${COLUMN_TYPES[column]}`).join(",\n      ");
  const columns = COLUMNS.join(",\n    ");
  const updates = COLUMNS.filter((column) => !["source", "code"].includes(column))
    .map((column) => `${column} = excluded.${column}`)
    .join(",\n    ");

  return `with batch as (
  select *
  from jsonb_to_recordset('${json}'::jsonb) as row(
      ${definitions}
  )
), upserted as (
  insert into public.products (
    ${columns}
  )
  select
    ${columns}
  from batch
  on conflict (source, code) do update set
    ${updates}
  returning 1
)
select count(*)::int as affected_rows from upserted;
`;
}

async function writeSql(path, sql) {
  const stream = createWriteStream(path, { encoding: "utf8" });
  if (!stream.write(sql)) await once(stream, "drain");
  stream.end();
  await once(stream, "finish");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = resolve(options.outputDir);

  if (existsSync(outputDir) && readdirSync(outputDir).length > 0) {
    throw new Error(`Output directory must be empty: ${outputDir}`);
  }
  mkdirSync(outputDir, { recursive: true });

  const mongoArgs = [
    `--uri=${options.mongoUri}`,
    `--db=${options.database}`,
    `--collection=${options.collection}`,
    "--type=json",
    "--jsonFormat=relaxed",
    "--quiet",
    "--assertExists",
    '--sort={"_id":1}',
  ];
  if (options.limit !== undefined) mongoArgs.push(`--limit=${options.limit}`);

  const exporter = spawn("mongoexport", mongoArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exporterClosed = once(exporter, "close");
  let stderr = "";
  exporter.stderr.setEncoding("utf8");
  exporter.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const lines = createInterface({ input: exporter.stdout, crlfDelay: Infinity });
  const manifest = { source: options.source, rows: 0, batches: [] };
  let batch = [];
  let batchBytes = 2;

  async function flush() {
    if (!batch.length) return;
    const number = manifest.batches.length + 1;
    const filename = `batch-${String(number).padStart(5, "0")}.sql`;
    const sql = sqlFor(batch);
    await writeSql(resolve(outputDir, filename), sql);
    manifest.batches.push({ file: filename, rows: batch.length, bytes: Buffer.byteLength(sql) });
    batch = [];
    batchBytes = 2;
  }

  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = transform(JSON.parse(line), options.source);
    const rowBytes = Buffer.byteLength(JSON.stringify(row)) + 1;

    if (
      batch.length > 0 &&
      (batch.length >= options.batchSize || batchBytes + rowBytes > options.maxBatchBytes)
    ) {
      await flush();
    }

    batch.push(row);
    batchBytes += rowBytes;
    manifest.rows += 1;
  }

  await flush();
  const [exitCode] = await exporterClosed;
  if (exitCode !== 0) throw new Error(`mongoexport failed (${exitCode}): ${stderr.trim()}`);

  writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
