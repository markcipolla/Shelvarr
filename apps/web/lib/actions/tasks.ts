'use server';

import { revalidatePath } from 'next/cache';
import {
  getTasks as getTasksFromDb,
  getTask,
  cancelTask as cancelTaskInDb,
  cleanupOldTasks,
  retryTask as retryTaskInQueue,
  type Task,
} from '@/lib/services/queue';
import { query } from '@/lib/db';
import type { IssueNumber } from '@shelvarr/types';

/**
 * What a comic download task is actually fetching.
 *
 * The task row only carries a `comicDownloadId`, so on its own a queue row
 * can say no more than "Comic Download". These come from the download's own
 * row, joined out to the volume and the issue it is for.
 */
export interface ComicDownloadSubject {
  volumeId: number;
  volumeSlug: string;
  volumeTitle: string;
  /** `#12`, `#1–25`, or null when the release doesn't say which issue. */
  issueLabel: string | null;
  /** The release as GetComics titled it. */
  releaseTitle: string | null;
  host: string;
  state: string;
}

interface ComicDownloadRow {
  id: number;
  volume_id: number;
  covered_issues: string | null;
  host: string;
  web_title: string | null;
  web_sub_title: string | null;
  state: string;
  volume_title: string;
  volume_slug: string | null;
  issue_number: string | null;
}

/** Render the issue(s) a download covers: a single number or a range. */
function issueLabel(issueNumber: string | null, coveredIssues: string | null): string | null {
  if (issueNumber) return `#${issueNumber}`;

  if (!coveredIssues) return null;
  let covered: IssueNumber;
  try {
    covered = JSON.parse(coveredIssues) as IssueNumber;
  } catch {
    return null;
  }

  if (typeof covered === 'number') return `#${covered}`;
  if (Array.isArray(covered) && covered.length === 2) {
    const [start, end] = covered;
    return start === end ? `#${start}` : `#${start}–${end}`;
  }
  return null;
}

/**
 * Attach a `comicDownload` description to every comic download task in the
 * list, in one query rather than one per row.
 *
 * A task whose download row has since been deleted keeps its bare label; the
 * job still happened, we just can't say what it was for any more.
 */
function withComicDownloadSubjects(tasks: Task[]): Task[] {
  const ids = new Set<number>();
  for (const task of tasks) {
    if (task.type !== 'comic_download') continue;
    const id = task.data?.comicDownloadId;
    if (typeof id === 'number') ids.add(id);
  }
  if (ids.size === 0) return tasks;

  const placeholders = [...ids].map(() => '?').join(',');
  const rows = query<ComicDownloadRow>(
    `SELECT cd.id, cd.volume_id, cd.covered_issues, cd.host, cd.web_title,
            cd.web_sub_title, cd.state,
            c.title as volume_title, c.slug as volume_slug,
            i.issue_number
       FROM comic_downloads cd
       JOIN comics c ON c.id = cd.volume_id
       LEFT JOIN comic_issues i ON i.id = cd.issue_id
      WHERE cd.id IN (${placeholders})`,
    [...ids]
  );

  const subjects = new Map<number, ComicDownloadSubject>(
    rows.map((row) => [
      row.id,
      {
        volumeId: row.volume_id,
        volumeSlug: row.volume_slug || String(row.volume_id),
        volumeTitle: row.volume_title,
        issueLabel: issueLabel(row.issue_number, row.covered_issues),
        releaseTitle: row.web_sub_title ?? row.web_title,
        host: row.host,
        state: row.state,
      },
    ])
  );

  return tasks.map((task) => {
    const id = task.data?.comicDownloadId;
    if (typeof id !== 'number') return task;
    const subject = subjects.get(id);
    if (!subject) return task;
    return { ...task, data: { ...task.data, comicDownload: subject } };
  });
}

export async function getTasks(options: {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  statuses?: Array<'pending' | 'running' | 'completed' | 'failed' | 'cancelled'>;
  limit?: number;
  offset?: number;
} = {}) {
  const result = getTasksFromDb(options);
  return { ...result, tasks: withComicDownloadSubjects(result.tasks) };
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

export async function cancelAllQueuedTasks() {
  const { tasks } = getTasksFromDb({ statuses: ['pending', 'running'], limit: 1000 });
  let cancelled = 0;

  for (const task of tasks) {
    cancelTaskInDb(task.id);
    cancelled++;
  }

  revalidatePath('/tasks');
  return { success: true, cancelled };
}
