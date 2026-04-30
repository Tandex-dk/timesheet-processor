import { sql } from '@vercel/postgres';

type RunStatus = 'success' | 'validation_error' | 'rate_limited' | 'unauthorized' | 'error';

type ProcessingRunEvent = {
  requestId: string;
  actorUserId: string;
  actorEmail: string | null;
  inputFilename: string;
  rowCount: number;
  employeeCount: number;
  status: RunStatus;
  errorCode?: string;
};

export async function logProcessingRun(event: ProcessingRunEvent) {
  await sql`
    INSERT INTO processing_runs (
      request_id,
      actor_user_id,
      actor_email,
      input_filename,
      row_count,
      employee_count,
      status,
      error_code
    )
    VALUES (
      ${event.requestId},
      ${event.actorUserId},
      ${event.actorEmail},
      ${event.inputFilename},
      ${event.rowCount},
      ${event.employeeCount},
      ${event.status},
      ${event.errorCode ?? null}
    );
  `;
}
