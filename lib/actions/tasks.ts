'use server';

import { revalidatePath } from 'next/cache';
import {
  getTasks as getTasksFromDb,
  getTask,
  cancelTask as cancelTaskInDb,
  cleanupOldTasks,
  retryTask as retryTaskInQueue,
} from '@/lib/services/queue';

export async function getTasks(options: {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  statuses?: Array<'pending' | 'running' | 'completed' | 'failed' | 'cancelled'>;
  limit?: number;
  offset?: number;
} = {}) {
  return getTasksFromDb(options);
}

export async function getTaskById(id: number) {
  return getTask(id);
}

export async function cancelTask(id: number) {
  const success = cancelTaskInDb(id);
  revalidatePath('/tasks');
  return { success };
}

export async function cleanupTasks(olderThanDays: number = 7) {
  const deleted = cleanupOldTasks(olderThanDays);
  revalidatePath('/tasks');
  return { success: true, deleted };
}

export async function retryTask(id: number) {
  try {
    const newTask = retryTaskInQueue(id);
    revalidatePath('/tasks');
    return { success: true, taskId: newTask?.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to retry task' };
  }
}
