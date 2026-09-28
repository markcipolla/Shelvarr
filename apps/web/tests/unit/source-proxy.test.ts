/**
 * Per-source proxying and User-Agent (E1-7).
 *
 * The proxies here are real ones, spoken to over loopback: a forwarding HTTP
 * proxy and a SOCKS5 server, both small enough to read. Mocking the transport
 * would test nothing — the whole point of the code under test is the bytes
 * that open a tunnel, and those either work against a real proxy or they do
 * not.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer as createHttpServer, request as httpRequest, type Server } from 'node:http';
import { createServer as createTcpServer, connect as netConnect, type Server as TcpServer } from 'node:net';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';

import {
  initDatabase,
  closeDatabase,
  execute,
  setSourceNetworkSettings,
} from '@shelvarr/db';
import {
  parseProxyUrl,
  proxyFetch,
  openProxyTunnel,
  InvalidProxyError,
  ProxyConnectionError,
} from '@shelvarr/services/utils/proxy-fetch';
import { sourceFetch, sourceHeaders, DEFAULT_USER_AGENT } from '@shelvarr/services/utils/source-http';

let dataDir: string;

/** Requests the origin server actually received. */
let originHits: Array<{ url: string; userAgent: string | undefined }> = [];
/** Requests the HTTP proxy was asked to forward. */
let proxyHits: string[] = [];
/** Connections the SOCKS5 proxy tunnelled. */
let socksHits: string[] = [];
/** CONNECT requests the HTTP proxy was asked to tunnel, with any auth header. */
let connectHits: Array<{ target: string; auth: string | undefined }> = [];

let origin: Server;
let httpProxy: Server;
let socksProxy: TcpServer;
let originPort = 0;
let httpProxyPort = 0;
let socksProxyPort = 0;

function listen(server: Server | TcpServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function close(server: Server | TcpServer): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * A SOCKS5 server that only does what the client under test asks of it:
 * no-auth greeting, CONNECT to a hostname, then pipe bytes both ways.
 */
function createSocksProxy(): TcpServer {
  return createTcpServer((client) => {
    let stage: 'greeting' | 'request' | 'piping' = 'greeting';
    let buffer = Buffer.alloc(0);

    client.on('data', (chunk) => {
      if (stage === 'piping') return;
      buffer = Buffer.concat([buffer, chunk]);

      if (stage === 'greeting') {
        if (buffer.length < 2) return;
        const methodCount = buffer[1]!;
        if (buffer.length < 2 + methodCount) return;
        buffer = buffer.subarray(2 + methodCount);
        client.write(Buffer.from([0x05, 0x00])); // no authentication required
        stage = 'request';
      }

      if (stage === 'request') {
        if (buffer.length < 5) return;
        const addressLength = buffer[4]!;
        const total = 4 + 1 + addressLength + 2;
        if (buffer.length < total) return;

        const host = buffer.subarray(5, 5 + addressLength).toString('utf-8');
        const port = buffer.readUInt16BE(5 + addressLength);
        const rest = buffer.subarray(total);
        socksHits.push(`${host}:${port}`);

        const upstream = netConnect({ host, port }, () => {
          // Success, bound to 0.0.0.0:0 — the client only checks the code.
          client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          if (rest.length > 0) upstream.write(rest);
          client.pipe(upstream);
          upstream.pipe(client);
          stage = 'piping';
        });
        upstream.on('error', () => client.destroy());
      }
    });

    client.on('error', () => client.destroy());
  });
}

describe('per-source proxy and User-Agent', () => {
  before(async () => {
    dataDir = join(tmpdir(), `shelvarr-proxy-${Date.now()}`);
    mkdirSync(dataDir, { recursive: true });
    initDatabase(join(dataDir, 'test.db'), { dataDir });

    origin = createHttpServer((req, res) => {
      originHits.push({ url: req.url ?? '', userAgent: req.headers['user-agent'] });
      if (req.url === '/redirect') {
        res.writeHead(302, { location: '/landed' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`served ${req.url}`);
    });

    // A forwarding HTTP proxy: the request line carries an absolute URI.
    httpProxy = createHttpServer((req, res) => {
      proxyHits.push(req.url ?? '');
      const target = new URL(req.url ?? '');
      const upstream = httpRequest(
        { host: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers: req.headers },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        }
      );
      upstream.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });

    // The CONNECT half of the same proxy. An https origin reaches its server
    // this way; the test exercises the handshake itself rather than standing
    // up a TLS origin with a certificate to go with it.
    httpProxy.on('connect', (req, clientSocket, head) => {
      connectHits.push({ target: req.url ?? '', auth: req.headers['proxy-authorization'] });

      if (req.url?.endsWith(':9') ) {
        clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }

      const [host, port] = (req.url ?? '').split(':');
      const upstream = netConnect({ host: host!, port: Number(port) }, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length > 0) upstream.write(head);
        clientSocket.pipe(upstream);
        upstream.pipe(clientSocket);
      });
      upstream.on('error', () => clientSocket.destroy());
    });

    socksProxy = createSocksProxy();

    originPort = await listen(origin);
    httpProxyPort = await listen(httpProxy);
    socksProxyPort = await listen(socksProxy);
  });

  after(async () => {
    await Promise.all([close(origin), close(httpProxy), close(socksProxy)]);
    closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    execute('DELETE FROM download_source_config', []);
    originHits = [];
    proxyHits = [];
    socksHits = [];
    connectHits = [];
  });

  describe('parsing what the operator typed', () => {
    it('reads an http proxy with credentials', () => {
      assert.deepStrictEqual(parseProxyUrl('http://bob:s3cret@proxy.lan:3128'), {
        protocol: 'http',
        host: 'proxy.lan',
        port: 3128,
        username: 'bob',
        password: 's3cret',
        remoteDns: false,
      });
    });

    it('reads socks5h as socks5 that resolves remotely', () => {
      const spec = parseProxyUrl('socks5h://127.0.0.1:1080');
      assert.strictEqual(spec.protocol, 'socks5');
      assert.strictEqual(spec.remoteDns, true);
    });

    it('assumes an http proxy when no scheme is given', () => {
      const spec = parseProxyUrl('10.0.0.5:8888');
      assert.strictEqual(spec.protocol, 'http');
      assert.strictEqual(spec.host, '10.0.0.5');
      assert.strictEqual(spec.port, 8888);
    });

    it('fills in the usual default port', () => {
      assert.strictEqual(parseProxyUrl('socks5://127.0.0.1').port, 1080);
      assert.strictEqual(parseProxyUrl('http://127.0.0.1').port, 8080);
    });

    it('refuses a scheme it cannot speak, rather than connecting directly', () => {
      assert.throws(() => parseProxyUrl('ftp://proxy.lan:21'), InvalidProxyError);
      assert.throws(() => parseProxyUrl(''), InvalidProxyError);
    });
  });

  describe('proxyFetch', () => {
    it('fetches through a forwarding HTTP proxy', async () => {
      const response = await proxyFetch(
        `http://127.0.0.1:${originPort}/book`,
        {},
        `http://127.0.0.1:${httpProxyPort}`
      );

      assert.strictEqual(response.status, 200);
      assert.strictEqual(await response.text(), 'served /book');
      assert.deepStrictEqual(proxyHits, [`http://127.0.0.1:${originPort}/book`]);
    });

    it('tunnels through a SOCKS5 proxy', async () => {
      const response = await proxyFetch(
        `http://127.0.0.1:${originPort}/via-socks`,
        {},
        `socks5://127.0.0.1:${socksProxyPort}`
      );

      assert.strictEqual(await response.text(), 'served /via-socks');
      assert.deepStrictEqual(socksHits, [`127.0.0.1:${originPort}`]);
    });

    it('follows a redirect the same way fetch would', async () => {
      const response = await proxyFetch(
        `http://127.0.0.1:${originPort}/redirect`,
        {},
        `socks5://127.0.0.1:${socksProxyPort}`
      );

      assert.strictEqual(response.status, 200);
      assert.strictEqual(await response.text(), 'served /landed');
      assert.strictEqual(response.url, `http://127.0.0.1:${originPort}/landed`);
      assert.deepStrictEqual(originHits.map((h) => h.url), ['/redirect', '/landed']);
    });

    it('sends a body, and reports what the server said', async () => {
      const response = await proxyFetch(
        `http://127.0.0.1:${originPort}/login`,
        { method: 'POST', body: new URLSearchParams({ email: 'a@b.c' }) },
        `http://127.0.0.1:${httpProxyPort}`
      );

      assert.strictEqual(await response.text(), 'served /login');
    });

    it('fails loudly when the proxy is not there', async () => {
      // Port 1 on loopback: nothing listens there.
      await assert.rejects(
        proxyFetch(`http://127.0.0.1:${originPort}/never`, {}, 'http://127.0.0.1:1'),
        /proxy/i
      );
      assert.deepStrictEqual(originHits, []);
    });

    it('opens a CONNECT tunnel, which is how an https origin is reached', async () => {
      const socket = await openProxyTunnel(
        parseProxyUrl(`http://reader:s3cret@127.0.0.1:${httpProxyPort}`),
        '127.0.0.1',
        originPort
      );

      // The socket is a plain pipe to the origin now; speak HTTP/1.1 on it.
      const body = await new Promise<string>((resolve, reject) => {
        let received = '';
        socket.on('data', (chunk) => { received += chunk.toString('utf-8'); });
        socket.on('end', () => resolve(received));
        socket.on('error', reject);
        socket.write(`GET /tunnelled HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
      });

      assert.match(body, /served \/tunnelled/);
      assert.strictEqual(connectHits[0]?.target, `127.0.0.1:${originPort}`);
      assert.strictEqual(
        connectHits[0]?.auth,
        `Basic ${Buffer.from('reader:s3cret').toString('base64')}`
      );
    });

    it('reports a proxy that refuses the CONNECT', async () => {
      await assert.rejects(
        openProxyTunnel(parseProxyUrl(`http://127.0.0.1:${httpProxyPort}`), '127.0.0.1', 9),
        (error: Error) => {
          assert.ok(error instanceof ProxyConnectionError);
          assert.match(error.message, /refused CONNECT/);
          // The password never appears in what gets logged or surfaced.
          assert.ok(!error.proxy.includes('s3cret'));
          return true;
        }
      );
    });

    it('honours an abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await assert.rejects(
        proxyFetch(`http://127.0.0.1:${originPort}/aborted`, { signal: controller.signal }, `http://127.0.0.1:${httpProxyPort}`)
      );
      assert.deepStrictEqual(originHits, []);
    });
  });

  describe('sourceFetch', () => {
    it('goes direct when the source has no proxy', async () => {
      await sourceFetch('libgen', `http://127.0.0.1:${originPort}/direct`);

      assert.deepStrictEqual(proxyHits, []);
      assert.deepStrictEqual(originHits.map((h) => h.url), ['/direct']);
    });

    it('uses the proxy for that source only', async () => {
      setSourceNetworkSettings('annas', { proxyUrl: `http://127.0.0.1:${httpProxyPort}` });

      await sourceFetch('annas', `http://127.0.0.1:${originPort}/annas-search`);
      await sourceFetch('libgen', `http://127.0.0.1:${originPort}/libgen-search`);
      await sourceFetch('zlibrary', `http://127.0.0.1:${originPort}/zlib-search`);

      assert.deepStrictEqual(proxyHits, [`http://127.0.0.1:${originPort}/annas-search`]);
      assert.deepStrictEqual(originHits.map((h) => h.url), [
        '/annas-search',
        '/libgen-search',
        '/zlib-search',
      ]);
    });

    it('sends the shared default User-Agent when the source has no override', async () => {
      await sourceFetch('libgen', `http://127.0.0.1:${originPort}/ua`);
      assert.strictEqual(originHits[0]?.userAgent, DEFAULT_USER_AGENT);
    });

    it('sends the source’s own User-Agent when one is configured', async () => {
      setSourceNetworkSettings('annas', { userAgent: 'Shelvarr/1.0 (+https://example.test)' });

      await sourceFetch('annas', `http://127.0.0.1:${originPort}/ua-annas`);
      await sourceFetch('libgen', `http://127.0.0.1:${originPort}/ua-libgen`);

      assert.strictEqual(originHits[0]?.userAgent, 'Shelvarr/1.0 (+https://example.test)');
      assert.strictEqual(originHits[1]?.userAgent, DEFAULT_USER_AGENT);
    });

    it('keeps the per-source User-Agent when the request goes through a proxy', async () => {
      setSourceNetworkSettings('annas', {
        proxyUrl: `socks5://127.0.0.1:${socksProxyPort}`,
        userAgent: 'Shelvarr/proxied',
      });

      await sourceFetch('annas', `http://127.0.0.1:${originPort}/both`);

      assert.deepStrictEqual(socksHits, [`127.0.0.1:${originPort}`]);
      assert.strictEqual(originHits[0]?.userAgent, 'Shelvarr/proxied');
    });

    it('lets an explicit User-Agent in the call win', async () => {
      setSourceNetworkSettings('annas', { userAgent: 'Shelvarr/configured' });

      await sourceFetch('annas', `http://127.0.0.1:${originPort}/explicit`, {
        headers: { 'User-Agent': 'Something/else' },
      });

      assert.strictEqual(originHits[0]?.userAgent, 'Something/else');
    });

    it('offers the same User-Agent to callers that make their own request', () => {
      setSourceNetworkSettings('zlibrary', { userAgent: 'Shelvarr/zlib' });

      assert.deepStrictEqual(sourceHeaders('zlibrary', { Accept: 'text/html' }), {
        'User-Agent': 'Shelvarr/zlib',
        Accept: 'text/html',
      });
      assert.strictEqual(sourceHeaders('libgen')['User-Agent'], DEFAULT_USER_AGENT);
      assert.strictEqual(sourceHeaders(undefined)['User-Agent'], DEFAULT_USER_AGENT);
    });
  });
});
