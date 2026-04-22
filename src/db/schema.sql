-- Wagio — Supabase Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────────
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  telegram_id    bigint unique not null,
  username       text,
  full_name      text,
  email          text,
  country        text,                        -- 'AR' | 'MX' | 'BR' | 'CO'
  wallet_address text,                        -- Privy embedded wallet
  bank_account   jsonb,                       -- { type: 'cvu'|'spei'|'pix'|'pse', account: '...' }
  onboarding_step text default 'start',       -- start | country | bank | done
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ─── Invoices ─────────────────────────────────────────────────────────────────
create table if not exists invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  client_name      text not null,
  description      text,
  amount_usdc      numeric(18, 6) not null,
  country          text not null,             -- off-ramp destination country
  solana_pay_url   text not null,
  reference_pubkey text unique not null,      -- matches memo on-chain
  status           text default 'pending',    -- pending | paid | offramp_pending | completed | failed
  tx_signature     text,                      -- Solana tx hash when paid
  paid_at          timestamptz,
  local_amount     numeric(18, 2),            -- amount in local currency
  local_currency   text,                      -- ARS | MXN | BRL | COP
  offramp_id       text,                      -- Bitso payout ID
  offramp_rate     numeric(18, 6),            -- USDC → local rate used
  fee_usdc         numeric(18, 6),            -- 1% fee charged
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_invoices_reference  on invoices(reference_pubkey);
create index if not exists idx_invoices_user_id    on invoices(user_id);
create index if not exists idx_invoices_status     on invoices(status);
create index if not exists idx_users_telegram_id   on users(telegram_id);

-- ─── Updated_at auto trigger ──────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on users
  for each row execute function update_updated_at();

create trigger invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at();
