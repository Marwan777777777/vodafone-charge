create table if not exists users (
  id text primary key,
  name text not null,
  username text not null unique,
  password_hash text not null,
  phone text not null default '',
  department text not null default '',
  role text not null check (role in ('admin', 'employee')),
  created_at timestamptz not null default now()
);

create table if not exists bays (
  id text primary key,
  bay text not null,
  kind text not null check (kind in ('fast', 'slow')),
  kw numeric not null,
  connector text not null,
  facing text not null,
  status text not null,
  led text not null,
  occupied boolean not null default false,
  note text,
  est text not null,
  paint text
);

create table if not exists reservations (
  id text primary key,
  bay_id text not null references bays(id),
  user_id text not null references users(id),
  start_local text not null,
  duration_min int not null,
  status text not null check (status in ('queued', 'active', 'charging', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists reservations_bay_idx on reservations (bay_id, status);
create index if not exists reservations_user_idx on reservations (user_id, status);

create table if not exists event_log (
  id bigserial primary key,
  kind text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists password_resets (
  id bigserial primary key,
  username text not null,
  created_at timestamptz not null default now(),
  handled boolean not null default false
);

create table if not exists telemetry (
  id bigserial primary key,
  bay_id text not null references bays(id),
  led text,
  occupied boolean,
  source text,
  raw jsonb,
  created_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('remind_on', 'true'),
  ('notify_on', 'true'),
  ('hardware_mode', 'sim')
on conflict (key) do nothing;
