create table if not exists book_catalog (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  author text,
  category text,
  estimated_value text,
  estimated_midpoint numeric,
  condition text,
  condition_note text,
  recommendation text check (recommendation in ('SELL', 'DONATE')),
  rationale text,
  created_at timestamptz default now()
);

alter table book_catalog enable row level security;

create policy "Allow all" on book_catalog for all using (true) with check (true);
