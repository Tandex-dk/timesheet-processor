import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { getEnv } from '@/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const env = getEnv();
    await sql`SELECT 1`;
    return NextResponse.json(
      {
        ok: true,
        service: 'timesheet-processor',
        environment: env.NODE_ENV,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('Health check failed', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'database_unavailable',
      },
      { status: 503 }
    );
  }
}
