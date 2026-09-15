import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { admin } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/**
 * Model Context Protocol endpoint, so an assistant can read this server's
 * logs and status directly.
 *
 * Off until the box is ticked in Settings → Advanced, and then reachable only
 * with the token that page shows. Point a client at it with:
 *
 *   claude mcp add --transport http shelvarr http://<host>/api/mcp \
 *     --header "Authorization: Bearer <token>"
 *
 * Only the JSON half of the Streamable HTTP transport is implemented: this
 * server never initiates a message, so there is no SSE stream to open and no
 * session to keep. See `packages/services/src/admin/mcp.ts`.
 */
export async function POST(request: NextRequest) {
  const auth = admin.authoriseAdminRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // The spec has clients send the negotiated revision on every request after
  // initialize, and servers turn away one they do not speak with a 400.
  const protocolVersion = request.headers.get('mcp-protocol-version');
  if (protocolVersion && !admin.isSupportedMcpProtocolVersion(protocolVersion)) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: `Unsupported MCP-Protocol-Version: ${protocolVersion}. This server speaks ${admin.MCP_PROTOCOL_VERSION}.`,
        },
      },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(admin.mcpParseError(), { status: 400 });
  }

  const response = admin.handleMcpBody(body);

  // A notification gets no reply, which JSON-RPC spells as an empty 202.
  if (response === null) return new NextResponse(null, { status: 202 });

  return NextResponse.json(response, {
    headers: { 'MCP-Protocol-Version': admin.MCP_PROTOCOL_VERSION },
  });
}

/**
 * The transport lets a client open an SSE stream here for server-initiated
 * messages. We have none, so the spec's answer is 405.
 */
export async function GET() {
  return new NextResponse('This MCP endpoint does not offer an event stream', { status: 405 });
}
