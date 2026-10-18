'use server';

import { revalidatePath } from 'next/cache';
import { auth, backup } from '@shelvarr/services';
import '@/lib/config';
import { getCurrentUser } from '@/lib/auth';
import type { BackupSettingsInput } from '@shelvarr/services/backup/index';

export type { BackupSettings, BackupSettingsInput, LocalBackup } from '@shelvarr/services/backup/index';

/**
 * Same gate as the rest of the Advanced tab: a server action is reachable by
 * anyone holding a session, and these settings hold a Backblaze key.
 */
async function requireAdmin(): Promise<void> {
  if (!auth.isAuthEnabled()) return;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Only an admin can do that');
  }
}

export async function getBackupSettings() {
  await requireAdmin();
  return backup.getBackupSettings();
}

export async function listBackups() {
  await requireAdmin();
  return backup.listLocalBackups();
}

export async function saveBackupSettingsAction(input: BackupSettingsInput) {
  await requireAdmin();

  try {
    const settings = backup.saveBackupSettings(input);
    revalidatePath('/settings/advanced');
    return { success: true as const, settings };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Could not save those settings',
    };
  }
}
