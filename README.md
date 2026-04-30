# Timesheet Processor

Production-ready Next.js payroll processor for `.xlsx` timesheet files.

## Architecture
- Managed authentication: Clerk
- Persistence: Postgres (Vercel/Neon-compatible via `@vercel/postgres`)
- Stateless file handling: upload in request, process in memory, return output, no file persistence
- Protected endpoints: `/` and `/api/process` via Clerk middleware

## Required Environment Variables
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `POSTGRES_URL` (required by `@vercel/postgres`)
- `DATABASE_URL` (optional compatibility alias)
- `APP_URL`
- `MAX_UPLOAD_MB` (default `10`)
- `PROCESS_TIMEOUT_MS` (default `120000`)
- `PROCESS_RATE_LIMIT_COUNT` (default `20`)
- `PROCESS_RATE_LIMIT_WINDOW_MS` (default `60000`)

## Database Setup
1. Create Postgres instance in Vercel (or connected Neon database).
2. Run migration SQL in [`db/migrations/001_init.sql`](/Users/oscarstromsborg/Library/CloudStorage/OneDrive-DanmarksTekniskeUniversitet/Tandex/Timer/timesheet-processor/db/migrations/001_init.sql).
3. Seed initial admin role mapping:
   - Set `SEED_ADMIN_CLERK_USER_ID=<clerk_user_id>`
   - Optional: `SEED_ADMIN_EMAIL=<email>`
   - Run `npm run seed:admin`

## Local Development
1. `npm install`
2. Create `.env.local` with all required variables.
3. `npm run dev`
4. Visit `http://localhost:3000/login` to authenticate with Clerk.

## Production Deployment (Direct to Prod with Verification Gate)
1. Configure Vercel project from `main`.
2. Add all required env vars in Vercel.
3. Deploy and verify:
   - `GET /api/health` returns `{ ok: true }`
   - Clerk login works
   - upload a known workbook and reconcile summary totals
4. Perform go-live only after verification succeeds.

## Security and Operations
- Security headers are applied in middleware and Next headers config.
- `/api/process` enforces:
  - authenticated user
  - authorized role (`admin` or `operator`)
  - file type and size checks
  - in-memory request rate limiting
  - request timeout budget
- Processing runs are logged into `processing_runs` for audit/incident triage.

## Incident and Rollback
1. Revert deployment in Vercel to previous production release.
2. If auth policy changes caused outage, revert recent `users.role` updates.
3. Re-test `/api/health` and one known workbook before reopening user access.
