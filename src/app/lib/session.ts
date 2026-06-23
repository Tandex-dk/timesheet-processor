// lib/session.ts (or utils/session.ts)
import type { User } from '@/types/auth'; // Adjust import path as needed

interface Session {
  id: string;
  userId: string;
  expiresAt: number;
}

const SESSIONS = new Map<string, Session>();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function createSession(userId: string): Session {
  const now = Date.now();

  // Clean up expired sessions
  for (const [id, session] of Array.from(SESSIONS.entries())) {
    if (session.expiresAt < now) {
      SESSIONS.delete(id);
    }
  }

  const session: Session = {
    id: crypto.randomUUID(),
    userId,
    expiresAt: now + SESSION_DURATION,
  };

  SESSIONS.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  const session = SESSIONS.get(sessionId);
  if (!session) return undefined;

  if (session.expiresAt < Date.now()) {
    SESSIONS.delete(sessionId);
    return undefined;
  }

  return session;
}

export function deleteSession(sessionId: string): void {
  SESSIONS.delete(sessionId);
}

export function getUserFromSession(sessionId: string, users: User[]): User | undefined {
  const session = getSession(sessionId);
  if (!session) return undefined;

  return users.find(user => user.username === session.userId);
}
