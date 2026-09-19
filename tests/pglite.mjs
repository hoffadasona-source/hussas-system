// قاعدة Postgres داخل الذاكرة (PGlite) مع محاكاة ما يوفره Supabase، ثم تطبيق كل ملفات migrations.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

// أدوار anon/authenticated ومخطط auth ودالة auth.uid() كما في Supabase
const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function bootDb({ quiet = false } = {}) {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUB);
  for (const f of fs.readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
      if (!quiet) console.log('✓ migration', f);
    } catch (e) {
      console.error('✗ migration', f, e.message, e.position ?? '');
      process.exit(1);
    }
  }
  return db;
}
