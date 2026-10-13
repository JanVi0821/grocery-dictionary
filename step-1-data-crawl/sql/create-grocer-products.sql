create table public.products (
  id bigint generated always as identity primary key,
  grocer_id integer not null unique,
  update_at_from_grocer date,
  deleted_from_grocer boolean not null default false,
  collection_ids integer[] not null default '{}'::integer[],
  barcodes text[] not null,
  name text not null,
  brand text,
  unit text not null,
  size text,

  constraint products_grocer_id_positive check (grocer_id > 0),
  constraint products_barcodes_no_null check (array_position(barcodes, null) is null),
  constraint products_barcodes_no_empty check (array_position(barcodes, '') is null),
  constraint products_collection_ids_no_null check (array_position(collection_ids, null) is null),
  constraint products_collection_ids_exclude_all check (not (1 = any(collection_ids))),
  constraint products_unit_not_empty check (btrim(unit) <> '')
);

create index products_barcodes_gin_idx
  on public.products using gin (barcodes);

create index products_collection_ids_gin_idx
  on public.products using gin (collection_ids);

alter table public.products enable row level security;

revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;
grant select, insert, update, delete on table public.products to service_role;
grant usage, select on sequence public.products_id_seq to service_role;

create policy "Products are publicly readable"
  on public.products
  for select
  to anon, authenticated
  using (true);
