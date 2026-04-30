import { sql } from '@vercel/postgres';

let schemaReady = false;

export async function ensureDatabaseSchema() {
  if (schemaReady) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      clerk_user_id TEXT UNIQUE NOT NULL,
      email TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS processing_runs (
      id BIGSERIAL PRIMARY KEY,
      request_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_email TEXT,
      input_filename TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      employee_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('success', 'validation_error', 'rate_limited', 'unauthorized', 'error')),
      error_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS absence_mapping_overrides (
      id BIGSERIAL PRIMARY KEY,
      remark_key TEXT UNIQUE NOT NULL,
      mapped_category TEXT NOT NULL CHECK (mapped_category IN ('sickness', 'vacation', 'feriefridage', 'publicHoliday', 'otherAbsence')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  schemaReady = true;
}

export async function getAllowedRoleForUser(userId: string): Promise<'admin' | 'operator' | null> {
  const result = await sql`
    SELECT role
    FROM users
    WHERE clerk_user_id = ${userId}
    LIMIT 1;
  `;

  if (!result.rowCount) {
    return null;
  }

  const role = result.rows[0].role as 'admin' | 'operator';
  return role;
}

export async function upsertSeedUser(userId: string, email: string | null, role: 'admin' | 'operator') {
  await sql`
    INSERT INTO users (clerk_user_id, email, role)
    VALUES (${userId}, ${email}, ${role})
    ON CONFLICT (clerk_user_id)
    DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role, updated_at = NOW();
  `;
}
