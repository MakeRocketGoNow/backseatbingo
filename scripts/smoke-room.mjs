// End-to-end smoke test for the room Worker. Run `pnpm api` first, then
// `node scripts/smoke-room.mjs`. Uses Node's built-in fetch and WebSocket.

const BASE = process.env.BASE ?? 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = () => crypto.randomUUID();

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/rooms/ZZZZ`);
      if (r.status === 404) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`Worker not reachable at ${BASE}`);
}

function connect(code, tok) {
  const ws = new WebSocket(`${WS_BASE}/api/rooms/${code}/ws?token=${tok}`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    const w = waiters.shift();
    if (w) w(msg);
    else inbox.push(msg);
  });
  let seq = 0;
  const client = {
    ws,
    send: (action) => {
      seq += 1;
      ws.send(JSON.stringify({ ...action, seq }));
      return seq;
    },
    next: () =>
      inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve) => waiters.push(resolve)),
    /** Drain until a message matching pred arrives (with a timeout). */
    until: async (pred, label) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const msg = await Promise.race([client.next(), sleep(5000).then(() => null)]);
        if (msg === null) break;
        if (pred(msg)) return msg;
      }
      throw new Error(`timed out waiting for ${label}`);
    },
    open: () => new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
    }),
    closed: () => new Promise((resolve) => ws.addEventListener('close', (e) => resolve(e.code), { once: true })),
  };
  return client;
}

const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
  console.log('  ok:', msg);
};

const pack = {
  id: 'smoke',
  name: 'Smoke pack',
  description: '',
  free: true,
  minAge: 0,
  items: Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, text: `Item ${i}` })),
};

async function main() {
  await waitForServer();
  const hostToken = token();
  const guestToken = token();

  console.log('create room');
  const created = await fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: hostToken,
      name: 'Dad',
      settings: { mode: 'spotit', listLength: 'quick', pattern: 'line', approvals: 'auto' },
      pack,
    }),
  });
  assert(created.status === 201, `create returns 201 (got ${created.status})`);
  const { code } = await created.json();
  assert(/^[A-HJ-NP-Z]{4}$/.test(code), `code ${code} is 4 unambiguous letters`);

  const bad = await fetch(`${BASE}/api/rooms`, { method: 'POST', body: '{"nope":1}', headers: { 'content-type': 'application/json' } });
  assert(bad.status === 400, 'invalid create body is rejected');

  const info = await (await fetch(`${BASE}/api/rooms/${code}`)).json();
  assert(info.status === 'lobby' && info.players === 1, 'info shows lobby with 1 player');

  console.log('host connects');
  const host = connect(code, hostToken);
  await host.open();
  let st = await host.until((m) => m.type === 'state', 'host state on connect');
  assert(st.you === st.state.hostId, 'host is recognised by token');
  assert(st.state.players[0].connected === true, 'host shows connected');

  console.log('guest joins');
  const guest = connect(code, guestToken);
  await guest.open();
  guest.send({ type: 'claim', itemId: 'x' });
  const notJoined = await guest.until((m) => m.type === 'error', 'error before join');
  assert(notJoined.code === 'not-joined', 'acting before join is rejected');
  const joinSeq = guest.send({ type: 'join', name: 'Kid' });
  st = await guest.until((m) => m.type === 'state' && m.ack === joinSeq, 'guest state with ack');
  assert(st.state.players.length === 2 && st.you !== st.state.hostId, 'guest is in the room as a non-host');
  const hostView = await host.until((m) => m.type === 'state' && m.state.players.length === 2, 'host sees guest');
  assert(hostView.state.players[1].name === 'Kid', 'host sees the guest name');

  console.log('guest cannot start, host starts');
  guest.send({ type: 'start' });
  const notHost = await guest.until((m) => m.type === 'error', 'not-host error');
  assert(notHost.code === 'not-host', 'guest start is rejected');
  host.send({ type: 'start' });
  st = await host.until((m) => m.type === 'state' && m.state.status === 'playing', 'playing');
  assert(st.state.game.mode === 'spotit' && st.state.game.items.length === 15, 'quick list of 15 drawn');
  const first = st.state.game.items[0].id;

  console.log('claims race');
  guest.send({ type: 'claim', itemId: first });
  st = await guest.until((m) => m.type === 'state' && m.state.game.claims[first], 'guest claim lands');
  assert(st.state.game.claims[first].playerId === st.you, 'guest owns the claim');
  host.send({ type: 'claim', itemId: first });
  const lost = await host.until((m) => m.type === 'error', 'host loses race');
  assert(lost.code === 'rejected' && lost.message === 'Kid got it', `loser toast says who got it (${lost.message})`);

  console.log('guest reconnects');
  guest.ws.close();
  await guest.closed();
  st = await host.until((m) => m.type === 'state' && m.state.players[1].connected === false, 'host sees guest offline');
  const guest2 = connect(code, guestToken);
  await guest2.open();
  st = await guest2.until((m) => m.type === 'state', 'state restored on reconnect');
  assert(st.state.game.claims[first] && st.state.players[1].connected === true, 'claims and connection restored');

  console.log('host closes');
  host.send({ type: 'close' });
  st = await guest2.until((m) => m.type === 'state' && m.state.status === 'closed', 'closed broadcast');
  const closeCode = await guest2.closed();
  assert(closeCode === 4000, `socket closed with 4000 (got ${closeCode})`);
  const gone = await fetch(`${BASE}/api/rooms/${code}`);
  assert(gone.status === 404, 'closed room is gone');

  console.log('\nSMOKE PASS');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nSMOKE FAIL:', e.message);
  process.exit(1);
});
