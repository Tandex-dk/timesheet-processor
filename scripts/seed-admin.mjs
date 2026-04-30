import { sql } from '@vercel/postgres';

const clerkUserId = process.env.SEED_ADMIN_CLERK_USER_ID;
const email = process.env.SEED_ADMIN_EMAIL ?? null;

if (!clerkUserId) {
  console.error('SEED_ADMIN_CLERK_USER_ID is required');
  process.exit(1);
}

await sql`
  INSERT INTO users (clerk_user_id, email, role)
  VALUES (${clerkUserId}, ${email}, 'admin')
  ON CONFLICT (clerk_user_id)
  DO UPDATE SET email = EXCLUDED.email, role = 'admin', updated_at = NOW();
`;

console.log('Seeded admin user:', clerkUserId);
