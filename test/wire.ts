// A TCP proxy in front of the database that counts the round trips a client makes, by reading the frontend messages of
// the Postgres protocol: one for every simple Query, and one for every Sync, which ends a statement sent with bind
// parameters. It reads message frames, not chunks, so how TCP cuts the stream does not change the count.

import { connect as tcpConnect, createServer, type Socket } from "node:net";
import type { TestContext } from "node:test";

const QUERY = 0x51; // 'Q'
const SYNC = 0x53; // 'S'
const PROTOCOL_3 = 196608;
/** A message's length field: four bytes, counting itself and not the type byte before it. */
const LENGTH_BYTES = 4;

/** Starts the proxy in front of the database of url; returns the URL through it and the round trips counted so far. */
export async function countingProxy(t: TestContext, url: string): Promise<{ url: string; roundTrips: () => number }> {
  const target = new URL(url);
  let roundTrips = 0;
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    const upstream = tcpConnect(Number(target.port || "5432"), target.hostname);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("error", () => undefined);
      socket.on("close", () => sockets.delete(socket));
    }
    let pending = Buffer.alloc(0);
    // Until the startup message, packets carry no type byte: an SSL or GSS request may come first.
    let started = false;
    client.on("data", (chunk: Buffer) => {
      upstream.write(chunk);
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        const header = started ? 1 + LENGTH_BYTES : LENGTH_BYTES;
        if (pending.length < header) return;
        const length = pending.readInt32BE(header - LENGTH_BYTES);
        const size = header - LENGTH_BYTES + length;
        if (pending.length < size) return;
        if (!started) started = pending.readInt32BE(LENGTH_BYTES) === PROTOCOL_3;
        else if (pending[0] === QUERY || pending[0] === SYNC) roundTrips += 1;
        pending = pending.subarray(size);
      }
    });
    upstream.on("data", (chunk: Buffer) => client.write(chunk));
    client.on("end", () => upstream.end());
    upstream.on("end", () => client.end());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the proxy has no port");
  const through = new URL(url);
  through.hostname = "127.0.0.1";
  through.port = String(address.port);
  return { url: through.toString(), roundTrips: () => roundTrips };
}
