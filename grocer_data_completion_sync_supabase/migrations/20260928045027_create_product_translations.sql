create table public.product_translations (
  id bigint generated always as identity primary key,
  product_id bigint not null,
  lang text not null,
  name text not null,
  detail jsonb not null,

  constraint product_translations_product_id_positive check (product_id > 0),
  constraint product_translations_lang_not_empty check (btrim(lang) <> ''),
  constraint product_translations_name_not_empty check (btrim(name) <> ''),
  constraint product_translations_detail_object check (jsonb_typeof(detail) = 'object'),
  constraint product_translations_product_lang_unique unique (product_id, lang)
);

comment on table public.product_translations is
  'Localized product names and sanitized translation details; product_id intentionally has no foreign key.';
comment on column public.product_translations.product_id is
  'ID of the corresponding row in public.products; stored without a foreign-key constraint.';
comment on column public.product_translations.lang is
  'Target language code, for example zh.';
comment on column public.product_translations.name is
  'Translated product name mapped from data_completion_zh.product_name.';
comment on column public.product_translations.detail is
  'Sanitized translation payload; excludes _id, id, productId, product_name, brand, at, needsReview, and attempts.';

create index product_translations_lang_idx
  on public.product_translations (lang);

alter table public.product_translations enable row level security;

revoke all on table public.product_translations from anon, authenticated;
grant select on table public.product_translations to anon, authenticated;
grant select, insert, update, delete on table public.product_translations to service_role;
grant usage, select on sequence public.product_translations_id_seq to service_role;

create policy "Product translations are publicly readable"
  on public.product_translations
  for select
  to anon, authenticated
  using (true);
