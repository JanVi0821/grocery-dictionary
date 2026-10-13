alter table public.products
  rename column data_completion to detail;

alter table public.products
  rename constraint products_data_completion_object to products_detail_object;

comment on column public.products.detail is
  'Sanitized product completion payload imported from MongoDB data_completion; MongoDB identifiers and duplicated product fields are excluded.';
