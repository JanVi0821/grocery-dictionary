alter table public.products
  add column data_completion jsonb;

alter table public.products
  add constraint products_data_completion_object
  check (data_completion is null or jsonb_typeof(data_completion) = 'object');

comment on column public.products.data_completion is
  'Sanitized source completion payload imported from MongoDB data_completion; MongoDB identifiers and duplicated product fields are excluded.';
