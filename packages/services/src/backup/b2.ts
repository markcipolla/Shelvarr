/**
 * Backblaze B2, over its own API rather than the S3-compatible one.
 *
 * S3 would mean hand-rolling SigV4 or pulling in the AWS SDK; B2's native API
 * is Basic auth, a bearer token and a SHA-1 header, so it is both the smaller
 * thing to write and the smaller thing to read at 3am. No dependency: `fetch`
 * and `node:crypto` cover all of it.
 */

import { createHash } from 'crypto';

const AUTHORIZE_URL = 'https://api.backblazeb2.com/b2api/v3/b2_authorize_account';

/**
 * Largest file b2_upload_file takes in one request is 5 GB, and this uploads
 * from a Buffer, so memory is the tighter limit in practice.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

export interface B2Credentials {
  keyId: string;
  applicationKey: string;
  bucket: string;
}

export interface B2Session {
  apiUrl: string;
  token: string;
  bucketId: string;
}

export interface B2File {
  fileName: string;
  fileId: string;
  contentLength: number;
  uploadTimestamp: number;
}

/** B2 returns its errors as JSON; surface the message rather than "500". */
async function readError(response: Response, what: string): Promise<Error> {
  const body = await response.text().catch(() => '');
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    if (parsed.message) message = parsed.code ? `${parsed.message} (${parsed.code})` : parsed.message;
  } catch {
    // Not JSON — the truncated body is the best we have.
  }
  return new Error(`Backblaze ${what} failed: ${response.status}${message ? ` ${message}` : ''}`);
}

async function call<T>(session: B2Session, name: string, body: unknown): Promise<T> {
  const response = await fetch(`${session.apiUrl}/b2api/v3/${name}`, {
    method: 'POST',
    headers: { Authorization: session.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response, name);
  return (await response.json()) as T;
}

interface AuthorizeResponse {
  accountId: string;
  authorizationToken: string;
  apiInfo: {
    storageApi: {
      apiUrl: string;
      /** Set only when the key is restricted to one bucket. */
      bucketId: string | null;
      bucketName: string | null;
    };
  };
}

/**
 * Trade the application key for a session, resolving the bucket name to the
 * id every other call wants. A bucket-restricted key already carries its id,
 * which is also the only case where listing buckets would be refused.
 */
export async function authorize(credentials: B2Credentials): Promise<B2Session> {
  const basic = Buffer.from(`${credentials.keyId}:${credentials.applicationKey}`).toString('base64');
  const response = await fetch(AUTHORIZE_URL, { headers: { Authorization: `Basic ${basic}` } });
  if (!response.ok) throw await readError(response, 'sign-in');

  const auth = (await response.json()) as AuthorizeResponse;
  const storage = auth.apiInfo.storageApi;
  const session: B2Session = { apiUrl: storage.apiUrl, token: auth.authorizationToken, bucketId: '' };

  if (storage.bucketId) {
    if (storage.bucketName && storage.bucketName !== credentials.bucket) {
      throw new Error(
        `That application key only opens the bucket "${storage.bucketName}", not "${credentials.bucket}".`
      );
    }
    return { ...session, bucketId: storage.bucketId };
  }

  const buckets = await call<{ buckets: Array<{ bucketId: string; bucketName: string }> }>(
    session,
    'b2_list_buckets',
    { accountId: auth.accountId, bucketName: credentials.bucket }
  );
  const bucket = buckets.buckets.find((candidate) => candidate.bucketName === credentials.bucket);
  if (!bucket) throw new Error(`No bucket named "${credentials.bucket}" in this Backblaze account.`);

  return { ...session, bucketId: bucket.bucketId };
}

/** Percent-encode a file name for the header, leaving the path separators. */
function encodeFileName(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

export async function uploadFile(session: B2Session, name: string, body: Buffer): Promise<B2File> {
  if (body.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${name} is ${body.length} bytes, past the 5 GB single-request limit. ` +
        'Back up to a local path and copy it across instead.'
    );
  }

  const upload = await call<{ uploadUrl: string; authorizationToken: string }>(
    session,
    'b2_get_upload_url',
    { bucketId: session.bucketId }
  );

  const response = await fetch(upload.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: upload.authorizationToken,
      'X-Bz-File-Name': encodeFileName(name),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
      'X-Bz-Content-Sha1': createHash('sha1').update(body).digest('hex'),
    },
    body: new Uint8Array(body),
  });
  if (!response.ok) throw await readError(response, 'upload');

  return (await response.json()) as B2File;
}

/**
 * Every version of every file under `prefix`.
 *
 * ponytail: one page, no `nextFileName` loop. A thousand files is far more
 * backups than any retention setting keeps; paginate if that stops being true.
 */
export async function listFiles(session: B2Session, prefix: string): Promise<B2File[]> {
  const result = await call<{ files: B2File[] }>(session, 'b2_list_file_versions', {
    bucketId: session.bucketId,
    prefix,
    maxFileCount: 1000,
  });
  return result.files;
}

export async function deleteFile(session: B2Session, file: B2File): Promise<void> {
  await call(session, 'b2_delete_file_version', {
    fileName: file.fileName,
    fileId: file.fileId,
  });
}
