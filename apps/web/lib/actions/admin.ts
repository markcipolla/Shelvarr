'use server';

import { revalidatePath } from 'next/cache';
import { admin, auth } from '@shelvarr/services';
import type { LogLevel } from '@shelvarr/services/utils/logger';
import '@/lib/config';
import { getCurrentUser } from '@/lib/auth';

export interface AdminApiSettings {
  enabled: boolean;
  /** Null until the API has been switched on at least once. */
  token: string | null;
}

/**
 * Gate for everything on the Advanced tab.
 *
 * A server action is reachable by anyone holding a session, so the page
 * being admin-only is not on its own a check. On a server with
 * authentication switched off there is no user to check against, and running
 * that way is already a declaration that the network is trusted.
 */
async function requireAdmin(): Promise<void> {
  if (!auth.isAuthEnabled()) return;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only an admin can do that');
  }
}

export async function getAdminApiSettings(): Promise<AdminApiSettings> {
  await requireAdmin();
  return { enabled: admin.isAdminApiEnabled(), token: admin.getAdminApiToken() };
}

export async function setAdminApiEnabledAction(enabled: boolean): Promise<AdminApiSettings> {
  await requireAdmin();
  const result = admin.setAdminApiEnabled(enabled);
  revalidatePath('/settings/advanced');
  return result;
}

/** Mint a new token. Anything still using the old one stops working. */
export async function regenerateAdminApiTokenAction(): Promise<AdminApiSettings> {
  await requireAdmin();
  const token = admin.regenerateAdminApiToken();
  revalidatePath('/settings/advanced');
  return { enabled: admin.isAdminApiEnabled(), token };
}

export interface LogTailEntry {
  sequence: number;
  timestamp: string;
  level: LogLevel;
  context?: string;
  message: string;
  data?: string;
}

export interface LogTail {
  entries: LogTailEntry[];
  matched: number;
  buffered: number;
  capacity: number;
  level: LogLevel;
}

/**
 * The tail shown on the Advanced tab.
 *
 * Deliberately available whether or not the diagnostics API is switched on:
 * the checkbox governs who may reach the logs over HTTP, not whether an admin
 * looking at their own settings page may read them.
 */
export async function getLogTail(
  options: { level?: LogLevel; search?: string; limit?: number } = {}
): Promise<LogTail> {
  await requireAdmin();

  const result = admin.searchLogs({
    ...(options.level ? { minLevel: options.level } : {}),
    ...(options.search ? { search: options.search } : {}),
    limit: options.limit ?? 100,
  });

  return {
    entries: result.entries,
    matched: result.matched,
    buffered: result.buffer.buffered,
    capacity: result.buffer.capacity,
    level: result.buffer.level,
  };
}
