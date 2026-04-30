import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import {
  aggregateRows,
  buildWorkbook,
  generateOutputFilename,
  parseWorkbook,
} from '@/server/timesheet-processing';
import { ensureDatabaseSchema, getAllowedRoleForUser } from '@/server/db';
import { getEnv } from '@/server/env';
import { logProcessingRun } from '@/server/run-logger';
import { checkRateLimit, createRequestId } from '@/server/security';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const env = getEnv();
  const requestId = createRequestId();
  const startedAt = Date.now();
  const { userId, sessionClaims } = auth();
  const user = userId ? await currentUser() : null;
  const actorEmail = user?.emailAddresses[0]?.emailAddress ?? null;

  const fail = async (
    status: number,
    payload: Record<string, unknown>,
    logStatus: 'validation_error' | 'rate_limited' | 'unauthorized' | 'error',
    errorCode?: string,
    inputFilename = 'unknown.xlsx'
  ) => {
    if (userId) {
      await logProcessingRun({
        requestId,
        actorUserId: userId,
        actorEmail,
        inputFilename,
        rowCount: 0,
        employeeCount: 0,
        status: logStatus,
        errorCode,
      });
    }
    return NextResponse.json(payload, {
      status,
      headers: { 'x-request-id': requestId },
    });
  };

  try {
    if (!userId) {
      return await fail(
        401,
        { error: 'Login er påkrævet', code: 'unauthenticated' },
        'unauthorized',
        'unauthenticated'
      );
    }

    await ensureDatabaseSchema();
    const dbRole = await getAllowedRoleForUser(userId);
    const metadataRoleRaw =
      (user?.publicMetadata as { role?: string } | undefined)?.role ??
      (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
    const metadataRole =
      metadataRoleRaw === 'admin' || metadataRoleRaw === 'operator'
        ? metadataRoleRaw
        : null;
    const effectiveRole = dbRole || metadataRole;

    if (!effectiveRole) {
      return await fail(
        403,
        { error: 'Brugeren har ikke adgang til lønbehandling', code: 'forbidden' },
        'unauthorized',
        'forbidden'
      );
    }

    const rateKey = `${userId}:${request.nextUrl.pathname}`;
    const rate = checkRateLimit(
      rateKey,
      env.PROCESS_RATE_LIMIT_COUNT,
      env.PROCESS_RATE_LIMIT_WINDOW_MS
    );
    if (!rate.allowed) {
      return await fail(
        429,
        { error: 'For mange forespørgsler. Prøv igen senere.', code: 'rate_limited' },
        'rate_limited',
        'rate_limited'
      );
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return await fail(
        415,
        { error: 'Ikke-understøttet indholdstype', code: 'unsupported_media_type' },
        'validation_error',
        'unsupported_media_type'
      );
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > env.MAX_UPLOAD_MB * 1024 * 1024) {
      return await fail(
        413,
        { error: `Filen er for stor. Maksimum er ${env.MAX_UPLOAD_MB} MB.`, code: 'payload_too_large' },
        'validation_error',
        'payload_too_large'
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return await fail(
        400,
        { error: 'Ingen fil blev uploadet', code: 'missing_file' },
        'validation_error',
        'missing_file'
      );
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return await fail(
        400,
        { error: 'Kun .xlsx-filer accepteres', code: 'invalid_file_type' },
        'validation_error',
        'invalid_file_type',
        file.name
      );
    }

    if (file.size > env.MAX_UPLOAD_MB * 1024 * 1024) {
      return await fail(
        413,
        { error: `Filen er for stor. Maksimum er ${env.MAX_UPLOAD_MB} MB.`, code: 'payload_too_large' },
        'validation_error',
        'payload_too_large',
        file.name
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (Date.now() - startedAt > env.PROCESS_TIMEOUT_MS) {
      return await fail(
        408,
        { error: 'Behandlingen overskred tidsgrænsen før indlæsning', code: 'timeout' },
        'error',
        'timeout',
        file.name
      );
    }

    const normalizedRows = parseWorkbook(buffer);
    const { summary, audit } = aggregateRows(normalizedRows);
    const outputFilename = generateOutputFilename(file.name);

    if (Date.now() - startedAt > env.PROCESS_TIMEOUT_MS) {
      return await fail(
        408,
        { error: 'Behandlingen overskred tidsgrænsen under beregningen', code: 'timeout' },
        'error',
        'timeout',
        file.name
      );
    }

    const workbookBuffer = await buildWorkbook({
      summary,
      audit,
      sourceFilename: file.name,
    });

    await logProcessingRun({
      requestId,
      actorUserId: userId,
      actorEmail,
      inputFilename: file.name,
      rowCount: normalizedRows.length,
      employeeCount: summary.length,
      status: 'success',
    });

    return new NextResponse(workbookBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
        'Cache-Control': 'no-store, max-age=0',
        'x-request-id': requestId,
      }
    });
  } catch (error) {
    console.error('Error processing file:', { requestId, error });
    if (error instanceof Error && error.name === 'ValidationError') {
      return await fail(
        400,
        {
          error: error.message,
          code: (error as Error & { code?: string }).code,
          details: (error as Error & { details?: unknown }).details ?? null,
        },
        'validation_error',
        (error as Error & { code?: string }).code
      );
    }

    return await fail(
      500,
      {
        error: 'Der opstod en fejl under behandling af filen',
        code: 'processing_failed',
      },
      'error',
      'processing_failed'
    );
  }
}
