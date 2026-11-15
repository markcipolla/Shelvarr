/**
 * FlareSolverr integration.
 *
 * FlareSolverr runs a headless Chrome that solves Cloudflare Turnstile
 * challenges on behalf of server-side fetches. When a source responds with a
 * challenge page, we forward the same URL to FlareSolverr and use the HTML
 * it returns instead.
 *
 * API: POST /v1 with { cmd: "request.get", url, maxTimeout }
 * Response: { status: "ok", solution: { status, response, cookies, userAgent } }
 */

interface FlareSolverrCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
}

interface FlareSolverrSolution {
  status: number;
  response: string;
  cookies: FlareSolverrCookie[];
  userAgent: string;
}

interface FlareSolverrResponse {
  status: 'ok' | 'error';
  message: string;
  solution?: FlareSolverrSolution;
}

export interface FlareSolverrResult {
  html: string;
  /** Cookie header value ready to include in follow-up requests to the same domain. */
  cookieHeader: string;
}

export class FlareSolverrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlareSolverrError';
  }
}

/**
 * Fetch a URL through FlareSolverr and return the solved HTML + cookies.
 *
 * @throws FlareSolverrError when FlareSolverr itself is unreachable or returns an error.
 */
export async function flareSolverrFetch(
  url: string,
  flareSolverrUrl: string
): Promise<FlareSolverrResult> {
  const endpoint = flareSolverrUrl.replace(/\/$/, '') + '/v1';

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 60000 }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    throw new FlareSolverrError(
      `FlareSolverr unreachable at ${flareSolverrUrl}: ${(error as Error).message}`
    );
  }

  if (!response.ok) {
    throw new FlareSolverrError(`FlareSolverr returned HTTP ${response.status}`);
  }

  const body = (await response.json().catch(() => null)) as FlareSolverrResponse | null;
  if (!body || body.status !== 'ok' || !body.solution) {
    throw new FlareSolverrError(
      `FlareSolverr error: ${body?.message || 'unexpected response format'}`
    );
  }

  const cookieHeader = body.solution.cookies
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  return { html: body.solution.response, cookieHeader };
}
