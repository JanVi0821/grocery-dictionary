# Grocer data tools

TypeScript scripts for downloading Grocer's public DuckDB snapshot, synchronizing it to local MongoDB, and migrating combined product data to Supabase.

## Project layout

```text
grocer_data/
├── src/
│   ├── commands/                     # Executable data workflows
│   │   ├── full-sync.ts
│   │   ├── incremental-sync.ts
│   │   ├── sync-pending-to-supabase.ts
│   │   └── migrate-products-to-supabase.ts
│   ├── lib/                          # Shared environment, file and DuckDB helpers
│   └── types/                        # Grocer row and sync metadata types
├── sql/
│   └── create-grocer-products.sql    # Supabase products schema
├── base_v3.duckdb                    # Current downloaded snapshot (runtime data)
├── .grocer-mongodb-sync/             # Full-sync state and previous snapshots
├── .grocer-incremental-sync/         # Incremental-sync state and previous snapshot
└── .grocer-products-migration/       # Supabase migration checkpoint
```

Runtime data and checkpoint directories intentionally remain at the project root so existing runs can resume after this refactor.

## Commands

```bash
npm run sync:grocer:mongodb       # Full snapshot replacement in MongoDB
npm run sync:grocer:mongodb -- --database my_database
npm run sync:grocer:incremental   # Compare snapshots and mark MongoDB changes
npm run sync:grocer:incremental -- --database my_database
npm run sync:grocer:supabase     # Apply pending MongoDB changes to Supabase
npm run sync:grocer:supabase -- --database my_database
npm run migrate:grocer:supabase   # Combine MongoDB product data and upsert Supabase
npm run migrate:grocer:supabase -- --database my_database
npm test                          # Product migration unit checks only
npm run test:grocer:incremental   # Incremental comparison unit checks only
npm run typecheck                 # Strict TypeScript validation
```

The two test commands do not download data or write to either database.

## Data flows

### Full MongoDB synchronization

`full-sync.ts` downloads the public DuckDB snapshot, streams all six configured tables into temporary `__refresh` collections, verifies row counts, and then atomically switches the collection names. Existing collections are retained as timestamped backups.

The target database can be selected with `--database <name>` or with
`GROCER_FULL_SYNC_DATABASE`. The command-line option has priority. If neither
is provided, full sync uses `grocer_data_YYYY-MM-DD`, based on the current date
in the `Pacific/Auckland` time zone. This setting is deliberately independent
from the other commands. MongoDB creates a missing database on the first
collection write. Full-sync checkpoints include the target database name, so
a checkpoint cannot be reused accidentally for another database.

Set `GROCER_SKIP_DOWNLOAD=true` to reuse the existing root `base_v3.duckdb`. This is useful when resuming a local import without issuing another request to Grocer.

### Incremental MongoDB synchronization

`incremental-sync.ts` conditionally downloads the latest snapshot, compares every configured source row with MongoDB, and writes `_sync` metadata for `insert`, `update`, `restore`, or `delete`. Checkpoints are saved per table and batch.

It always defaults to `grocery_dictionary`. Pass `--database <name>` to process
a different MongoDB database. The selected database is stored in the checkpoint.

### Supabase product migration

`migrate-products-to-supabase.ts` combines products, barcodes, direct collections, and collection ancestors from MongoDB. Products without a barcode are skipped. Rows are upserted by `grocer_id` in stable batches, and the checkpoint advances only after a successful batch.

Its MongoDB source always defaults to `grocery_dictionary`. Pass
`--database <name>` to migrate from a different database. The selected source
database is stored in the migration checkpoint.

### Pending changes to Supabase

`sync-pending-to-supabase.ts` reads pending changes from MongoDB products,
barcodes, and collection members. It groups them by product, rebuilds the
product's complete current barcode and collection arrays, and then updates
Supabase in batches. Product deletion sets `deleted_from_grocer=true`; other
successful changes set it to `false`. Every applied change sets
`update_at_from_grocer` to the current Auckland date.

MongoDB is acknowledged only after the corresponding Supabase batch succeeds.
Acknowledgement uses both `_id` and `_sync.batch_id`, so a newer pending change
cannot be marked processed accidentally. New products without an active barcode
are skipped, matching the initial migration. An existing product whose final
barcode is deleted is retained with an empty `barcodes` array.

After every pending Supabase batch has succeeded, the command promotes the
processed MongoDB state into the next baseline. Documents with
`_sync.deleted=true` are physically removed; inserted, updated, and restored
documents keep their current source fields but have `_sync` removed. If a run
stops after some batches, their processed markers remain recoverable and are
cleaned after the next fully successful run. Pending documents from a newer
batch are never included in this cleanup.

## Environment variables

The scripts load `.env` from this directory. Do not commit secrets.

| Variable | Purpose | Default |
|---|---|---|
| `MONGODB_URI` / `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017` |
| `GROCER_FULL_SYNC_DATABASE` | Optional full-sync target database | `grocer_data_YYYY-MM-DD` |
| `GROCER_DB_URL` | Grocer DuckDB snapshot | Grocer public asset URL |
| `MONGO_BATCH_SIZE` | Full-sync batch size | `100` |
| `MONGO_BATCH_DELAY_MS` | Full-sync local write delay | `250` |
| `GROCER_SKIP_DOWNLOAD` | Reuse `base_v3.duckdb` when `true` | `false` |
| `GROCER_INCREMENTAL_BATCH_SIZE` | Incremental comparison batch size | `500` |
| `GROCER_SUPABASE_SYNC_BATCH_SIZE` | Pending-to-Supabase product batch size | `100` |
| `GROCER_SUPABASE_SYNC_DELAY_MS` | Delay after each pending-to-Supabase batch | `1000` |
| `SUPABASE_URL` | Supabase project URL | required for migration |
| `SUPABASE_SECRET_KEY` | Supabase server-side secret key | required for migration |
| `GROCER_MIGRATION_BATCH_SIZE` | Supabase upsert batch size | `100` |
| `GROCER_MIGRATION_DELAY_MS` | Delay after each Supabase batch | `1000` |

`SUPABASE_DB_URL` is used for manual SQL/administrative operations and is not required by these TypeScript scripts.
