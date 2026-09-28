/**
 * `fetch` through an HTTP(S) or SOCKS proxy, with no new dependency.
 *
 * Node's global fetch has no per-request proxy option: routing one request
 * through a proxy normally means undici's `ProxyAgent` (plus `socks` for
 * SOCKS), which is exactly the kind of dependency E6-4 went and removed. Both
 * proxy families end the same way though — a raw TCP socket already connected
 * to the origin — and `node:http`/`node:https` will happily speak HTTP over a
 * socket you hand them via `createConnection`. So the only thing that is
 * actually proxy-specific here is the handful of bytes that open the tunnel:
 * a CONNECT request, or the SOCKS handshake.
 *
 * What this supports, because it is what the callers use: GET/POST/HEAD,
 * string/`URLSearchParams`/buffer bodies, redirect following, abort signals,
 * gzip/deflate/brotli responses, and TLS to the origin (verified as usual —
 * the proxy only ever sees the CONNECT line, not the plaintext).
 *
 * Only reached when a source has a proxy configured. Everything else stays on
 * the global fetch, which keeps HTTP/2, connection pooling and undici's own
 * behaviour for the overwhelmingly common case.
 */

import { connect as netConnect, type Socket } from 'net';
import { connect as tlsConnect } from 'tls';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';
import { Readable } from 'stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'zlib';

/** Proxy schemes an operator can configure. */
export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5';

export interface ProxySpec {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  /**
   * What the scheme asked for: `socks5h` and `socks4a` mean "send the
   * hostname, you resolve it".
   *
   * Recorded rather than acted on, because the answer is the same either way.
   * A proxy is configured here precisely because the operator's own resolver
   * will not answer for these domains, so SOCKS5 always sends the hostname
   * form and SOCKS4 sends it for anything that is not already an IP literal —
   * resolving locally first would defeat the point.
   */
  remoteDns: boolean;
}

/** The proxy URL was not something we can use. */
export class InvalidProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProxyError';
  }
}

/** The proxy itself refused, or could not reach the origin. */
export class ProxyConnectionError extends Error {
  constructor(message: string, readonly proxy: string) {
    super(message);
    this.name = 'ProxyConnectionError';
  }
}

const DEFAULT_PROXY_PORTS: Record<ProxyProtocol, number> = {
  http: 8080,
  https: 8080,
  socks4: 1080,
  socks5: 1080,
};

/**
 * Parse an operator-supplied proxy URL.
 *
 * `socks://` is taken as SOCKS5, and a bare `host:port` is taken as an HTTP
 * proxy, because those are what people type. Anything else unrecognised is an
 * error rather than a silent fallback to a direct connection — a proxy that
 * quietly does not apply is worse than one that fails loudly, given the whole
 * point may be to keep requests off the operator's own IP.
 */
export function parseProxyUrl(value: string): ProxySpec {
  const trimmed = value.trim();
  if (!trimmed) throw new InvalidProxyError('Proxy URL is empty');

  const withScheme = /^[a-z0-9+.-]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new InvalidProxyError(`"${value}" is not a valid proxy URL`);
  }

  const scheme = url.protocol.replace(':', '').toLowerCase();
  let protocol: ProxyProtocol;
  let remoteDns = false;

  switch (scheme) {
    case 'http': protocol = 'http'; break;
    case 'https': protocol = 'https'; break;
    case 'socks':
    case 'socks5': protocol = 'socks5'; remoteDns = true; break;
    case 'socks5h': protocol = 'socks5'; remoteDns = true; break;
    case 'socks4': protocol = 'socks4'; break;
    case 'socks4a': protocol = 'socks4'; remoteDns = true; break;
    default:
      throw new InvalidProxyError(
        `Unsupported proxy scheme "${scheme}". Use http, https, socks4, socks5 or socks5h.`
      );
  }

  if (!url.hostname) throw new InvalidProxyError(`"${value}" has no proxy host`);

  const port = url.port ? Number(url.port) : DEFAULT_PROXY_PORTS[protocol];
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidProxyError(`"${value}" has an invalid proxy port`);
  }

  const spec: ProxySpec = {
    protocol,
    host: decodeURIComponent(url.hostname),
    port,
    remoteDns,
  };
  if (url.username) spec.username = decodeURIComponent(url.username);
  if (url.password) spec.password = decodeURIComponent(url.password);
  return spec;
}

/** A proxy URL with any password replaced, for logs and error messages. */
export function describeProxy(spec: ProxySpec): string {
  const auth = spec.username ? `${spec.username}:***@` : '';
  return `${spec.protocol}://${auth}${spec.host}:${spec.port}`;
}

/**
 * Read exactly `length` bytes from a socket, buffering across chunk
 * boundaries. The SOCKS handshake is a sequence of small fixed-size replies,
 * and a proxy is entitled to split them however it likes.
 */
function readBytes(socket: Socket, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);

    const onReadable = () => {
      const chunk = socket.read();
      if (chunk === null) return;
      buffered = Buffer.concat([buffered, chunk as Buffer]);
      if (buffered.length < length) return;

      cleanup();
      // Anything past what we asked for belongs to whatever comes next.
      if (buffered.length > length) socket.unshift(buffered.subarray(length));
      resolve(buffered.subarray(0, length));
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onEnd = () => { cleanup(); reject(new Error('Proxy closed the connection mid-handshake')); };
    const cleanup = () => {
      socket.removeListener('readable', onReadable);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
    };

    socket.on('readable', onReadable);
    socket.on('error', onError);
    socket.on('end', onEnd);
    onReadable();
  });
}

/** Open a plain TCP (or TLS, for an https:// proxy) socket to the proxy. */
function connectToProxy(spec: ProxySpec): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket =
      spec.protocol === 'https'
        ? tlsConnect({ host: spec.host, port: spec.port, servername: spec.host })
        : netConnect({ host: spec.host, port: spec.port });

    const onReady = () => { socket.removeListener('error', onError); resolve(socket); };
    const onError = (error: Error) => {
      socket.destroy();
      reject(new ProxyConnectionError(`Could not reach proxy: ${error.message}`, describeProxy(spec)));
    };

    socket.once(spec.protocol === 'https' ? 'secureConnect' : 'connect', onReady);
    socket.once('error', onError);
  });
}

/** HTTP CONNECT tunnel: RFC 9110 §9.3.6. */
async function openHttpTunnel(spec: ProxySpec, host: string, port: number): Promise<Socket> {
  const socket = await connectToProxy(spec);

  const target = `${host}:${port}`;
  const lines = [`CONNECT ${target} HTTP/1.1`, `Host: ${target}`, 'Proxy-Connection: keep-alive'];
  if (spec.username !== undefined) {
    const auth = Buffer.from(`${spec.username}:${spec.password ?? ''}`).toString('base64');
    lines.push(`Proxy-Authorization: Basic ${auth}`);
  }
  socket.write(lines.join('\r\n') + '\r\n\r\n');

  // The reply is a status line plus headers, terminated by a blank line.
  let head = Buffer.alloc(0);
  for (;;) {
    const chunk = await readBytes(socket, 1).catch((error: Error) => {
      socket.destroy();
      throw new ProxyConnectionError(`Proxy CONNECT failed: ${error.message}`, describeProxy(spec));
    });
    head = Buffer.concat([head, chunk]);
    if (head.length > 16384) {
      socket.destroy();
      throw new ProxyConnectionError('Proxy sent an oversized CONNECT response', describeProxy(spec));
    }
    if (head.subarray(-4).toString('latin1') === '\r\n\r\n') break;
  }

  const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head.toString('latin1'))?.[1]);
  if (status !== 200) {
    socket.destroy();
    throw new ProxyConnectionError(
      status === 407
        ? 'Proxy rejected the credentials (407)'
        : `Proxy refused CONNECT to ${target} (${status || 'unparseable response'})`,
      describeProxy(spec)
    );
  }

  return socket;
}

const SOCKS5_REPLY_ERRORS: Record<number, string> = {
  1: 'general SOCKS server failure',
  2: 'connection not allowed by ruleset',
  3: 'network unreachable',
  4: 'host unreachable',
  5: 'connection refused',
  6: 'TTL expired',
  7: 'command not supported',
  8: 'address type not supported',
};

/** SOCKS5 CONNECT: RFC 1928, with RFC 1929 username/password auth. */
async function openSocks5Tunnel(spec: ProxySpec, host: string, port: number): Promise<Socket> {
  const socket = await connectToProxy(spec);
  const fail = (message: string): never => {
    socket.destroy();
    throw new ProxyConnectionError(message, describeProxy(spec));
  };

  try {
    // Greeting: no-auth, and username/password when we have one.
    const methods = spec.username !== undefined ? [0x00, 0x02] : [0x00];
    socket.write(Buffer.from([0x05, methods.length, ...methods]));

    const greeting = await readBytes(socket, 2);
    if (greeting[0] !== 0x05) fail('Proxy did not answer as SOCKS5');

    if (greeting[1] === 0x02) {
      if (spec.username === undefined) fail('Proxy demands a username and password');
      const user = Buffer.from(spec.username ?? '', 'utf-8');
      const pass = Buffer.from(spec.password ?? '', 'utf-8');
      if (user.length > 255 || pass.length > 255) fail('SOCKS5 username or password is too long');
      socket.write(Buffer.concat([
        Buffer.from([0x01, user.length]), user,
        Buffer.from([pass.length]), pass,
      ]));
      const authReply = await readBytes(socket, 2);
      if (authReply[1] !== 0x00) fail('Proxy rejected the credentials');
    } else if (greeting[1] !== 0x00) {
      fail('Proxy offered no authentication method we support');
    }

    // CONNECT. Hostname form (0x03) when the proxy should resolve, which is
    // the point of using one against a DNS block.
    const hostBytes = Buffer.from(host, 'utf-8');
    if (hostBytes.length > 255) fail('Hostname is too long for SOCKS5');
    const portBytes = Buffer.alloc(2);
    portBytes.writeUInt16BE(port);
    socket.write(Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostBytes.length]), hostBytes, portBytes,
    ]));

    const reply = await readBytes(socket, 4);
    if (reply[1] !== 0x00) {
      fail(`Proxy refused the connection to ${host}:${port} (${SOCKS5_REPLY_ERRORS[reply[1]!] ?? `code ${reply[1]}`})`);
    }

    // Drain the bound address, whose length depends on its type.
    const addressType = reply[3];
    if (addressType === 0x01) await readBytes(socket, 4 + 2);
    else if (addressType === 0x04) await readBytes(socket, 16 + 2);
    else if (addressType === 0x03) {
      const [len] = await readBytes(socket, 1);
      await readBytes(socket, (len ?? 0) + 2);
    } else fail('Proxy replied with an address type we do not understand');

    return socket;
  } catch (error) {
    socket.destroy();
    if (error instanceof ProxyConnectionError) throw error;
    throw new ProxyConnectionError(
      `SOCKS5 handshake failed: ${(error as Error).message}`,
      describeProxy(spec)
    );
  }
}

/** SOCKS4/4a CONNECT. No authentication beyond the optional userid field. */
async function openSocks4Tunnel(spec: ProxySpec, host: string, port: number): Promise<Socket> {
  const socket = await connectToProxy(spec);
  const fail = (message: string): never => {
    socket.destroy();
    throw new ProxyConnectionError(message, describeProxy(spec));
  };

  try {
    const portBytes = Buffer.alloc(2);
    portBytes.writeUInt16BE(port);
    const userId = Buffer.from(spec.username ?? '', 'utf-8');

    const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const parts: Buffer[] = [Buffer.from([0x04, 0x01]), portBytes];
    if (isIpv4) {
      parts.push(Buffer.from(host.split('.').map(Number)));
      parts.push(userId, Buffer.from([0x00]));
    } else {
      // SOCKS4a: an address of 0.0.0.x means "the hostname follows".
      parts.push(Buffer.from([0x00, 0x00, 0x00, 0x01]));
      parts.push(userId, Buffer.from([0x00]), Buffer.from(host, 'utf-8'), Buffer.from([0x00]));
    }
    socket.write(Buffer.concat(parts));

    const reply = await readBytes(socket, 8);
    if (reply[1] !== 0x5a) fail(`Proxy refused the connection to ${host}:${port} (code ${reply[1]})`);
    return socket;
  } catch (error) {
    socket.destroy();
    if (error instanceof ProxyConnectionError) throw error;
    throw new ProxyConnectionError(
      `SOCKS4 handshake failed: ${(error as Error).message}`,
      describeProxy(spec)
    );
  }
}

/**
 * Open a socket to `host:port` through the proxy, whatever kind it is.
 *
 * Exported so the CONNECT handshake can be tested directly: an https origin
 * through an http proxy is the arrangement most operators actually run, and
 * it is otherwise only reachable from a test that can terminate TLS.
 */
export function openProxyTunnel(spec: ProxySpec, host: string, port: number): Promise<Socket> {
  switch (spec.protocol) {
    case 'socks5': return openSocks5Tunnel(spec, host, port);
    case 'socks4': return openSocks4Tunnel(spec, host, port);
    default: return openHttpTunnel(spec, host, port);
  }
}

/** Flatten whatever shape of headers a caller passed into plain entries. */
function normaliseHeaders(init: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  new Headers(init).forEach((value, key) => { out[key] = value; });
  return out;
}

/** Turn the body shapes our callers actually use into bytes. */
function encodeBody(body: BodyInit | null | undefined): Buffer | null {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return Buffer.from(body, 'utf-8');
  if (body instanceof URLSearchParams) return Buffer.from(body.toString(), 'utf-8');
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  throw new TypeError('Proxied requests only support string, URLSearchParams and buffer bodies');
}

/** Undo any Content-Encoding the origin applied; node:http does not. */
function decodeBody(response: IncomingMessage): Readable {
  const encoding = (response.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return response.pipe(createGunzip());
  if (encoding === 'deflate') return response.pipe(createInflate());
  if (encoding === 'br') return response.pipe(createBrotliDecompress());
  return response;
}

function toResponse(incoming: IncomingMessage, url: string, method: string): Response {
  const headers = new Headers();
  for (const [name, values] of Object.entries(incoming.headersDistinct)) {
    for (const value of values ?? []) headers.append(name, value);
  }

  const status = incoming.statusCode ?? 502;
  const bodyless = method === 'HEAD' || status === 204 || status === 304 || status === 205;
  if (bodyless) incoming.resume();

  const response = new Response(
    bodyless ? null : (Readable.toWeb(decodeBody(incoming)) as ReadableStream<Uint8Array>),
    { status, statusText: incoming.statusMessage ?? '', headers }
  );

  // `Response.url` is empty on a constructed response, and callers read it to
  // learn where redirects ended up (`buildResolvedDownload`).
  Object.defineProperty(response, 'url', { value: url, enumerable: true });
  return response;
}

/** One request over one freshly opened tunnel. No redirect handling. */
function requestThroughProxy(
  spec: ProxySpec,
  target: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | null,
  signal: AbortSignal | null | undefined
): Promise<Response> {
  const secure = target.protocol === 'https:';
  const port = Number(target.port || (secure ? 443 : 80));

  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));

    let request: ClientRequest | null = null;
    let tunnel: Socket | null = null;
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      request?.destroy();
      tunnel?.destroy();
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      fn();
    };

    // A plain-http target through an http proxy is the original arrangement:
    // open a socket to the proxy and ask for the absolute URI, no CONNECT.
    // Plenty of proxies only allow CONNECT to port 443, so this is the path
    // that actually works for them.
    const forward = !secure && (spec.protocol === 'http' || spec.protocol === 'https');

    const open = forward ? connectToProxy(spec) : openProxyTunnel(spec, target.hostname, port);

    open
      .then((socket) => {
        if (settled) { socket.destroy(); return; }
        tunnel = socket;

        const requestHeaders: Record<string, string> = { ...headers, host: target.host };
        if (forward && spec.username !== undefined) {
          const auth = Buffer.from(`${spec.username}:${spec.password ?? ''}`).toString('base64');
          requestHeaders['proxy-authorization'] = `Basic ${auth}`;
        }

        const send = secure ? httpsRequest : httpRequest;
        // No `agent` and a `createConnection`: node then uses our socket
        // rather than a pooled one (and sends Connection: close, which is
        // right — the tunnel is single-use).
        request = send(target, {
          method,
          headers: requestHeaders,
          ...(forward ? { path: target.href } : {}),
          createConnection: () =>
            secure
              ? tlsConnect({ socket, servername: target.hostname, ALPNProtocols: ['http/1.1'] })
              : socket,
        });

        request.on('response', (incoming) => {
          finish(() => resolve(toResponse(incoming, target.toString(), method)));
        });
        request.on('error', (error) => {
          socket.destroy();
          finish(() => reject(error));
        });

        if (body) request.write(body);
        request.end();
      })
      .catch((error) => finish(() => reject(error)));
  });
}

/** Origins are followed at most this far, matching the fetch spec's limit. */
const MAX_REDIRECTS = 20;

/**
 * `fetch`, over `proxyUrl`. Same contract as the global fetch for the subset
 * of options this codebase uses; throws `TypeError` on a network failure, as
 * fetch does, so existing error handling keeps working.
 */
export async function proxyFetch(
  input: string | URL,
  init: RequestInit = {},
  proxyUrl: string | ProxySpec
): Promise<Response> {
  const spec = typeof proxyUrl === 'string' ? parseProxyUrl(proxyUrl) : proxyUrl;

  let target = new URL(typeof input === 'string' ? input : input.toString());
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new TypeError(`Cannot proxy ${target.protocol} requests`);
  }

  let method = (init.method ?? 'GET').toUpperCase();
  let headers = normaliseHeaders(init.headers);
  let body = encodeBody(init.body);
  const redirect = init.redirect ?? 'follow';

  if (body && headers['content-length'] === undefined) {
    headers['content-length'] = String(body.length);
  }
  if (headers['accept-encoding'] === undefined) headers['accept-encoding'] = 'gzip, deflate, br';

  for (let hop = 0; ; hop++) {
    let response: Response;
    try {
      response = await requestThroughProxy(spec, target, method, headers, body, init.signal);
    } catch (error) {
      if (error instanceof ProxyConnectionError || (error as Error)?.name === 'AbortError') throw error;
      if (init.signal?.aborted) throw error;
      throw new TypeError(`Proxied request to ${target.origin} failed: ${(error as Error).message}`);
    }

    const location = response.headers.get('location');
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (!isRedirect || !location || redirect !== 'follow') {
      if (isRedirect && redirect === 'error') {
        await response.body?.cancel().catch(() => undefined);
        throw new TypeError(`Proxied request to ${target.origin} was redirected`);
      }
      return response;
    }

    if (hop >= MAX_REDIRECTS) {
      await response.body?.cancel().catch(() => undefined);
      throw new TypeError(`Proxied request to ${target.origin} redirected too many times`);
    }

    const next = new URL(location, target);
    await response.body?.cancel().catch(() => undefined);

    // Per the fetch spec: 303, and 301/302 on a POST, continue as a GET with
    // no body; a cross-origin hop drops anything credential-shaped.
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
      method = 'GET';
      body = null;
      delete headers['content-length'];
      delete headers['content-type'];
    }
    if (next.origin !== target.origin) {
      headers = Object.fromEntries(
        Object.entries(headers).filter(([name]) => !['authorization', 'cookie', 'proxy-authorization'].includes(name))
      );
    }

    target = next;
  }
}
