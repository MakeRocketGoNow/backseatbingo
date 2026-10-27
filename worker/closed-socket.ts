/**
 * Complete a WebSocket upgrade and close it at once with `code`. A refused
 * handshake reaches the browser as a bare 1006 close, which the client treats
 * as lost signal and retries forever; a close code tells it to stop.
 */
export function closedSocket(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  const server = pair[1];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}
