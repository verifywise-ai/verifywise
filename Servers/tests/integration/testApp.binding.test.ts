/**
 * Guards the fix for a cross-suite flake: supertest built its URL as
 * `http://127.0.0.1:<port>` while `serverAddress` bound the wildcard address
 * via `listen(0)`. On macOS a wildcard bind may be granted an ephemeral port
 * an unrelated process already holds on 127.0.0.1, and the more specific bind
 * wins the connection — so the request was answered by that foreign process
 * (observed as a bodiless 401). Binding loopback explicitly makes the
 * collision impossible; the OS refuses such a port with EADDRINUSE.
 */
import type { AddressInfo } from "net";
import { createTestApp, testRequest } from "./setup";

describe("test app server binding", () => {
  it("binds 127.0.0.1 specifically, not the wildcard address", async () => {
    const server = await createTestApp({ bypassAuth: true });
    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
  });

  it("routes supertest requests to this server rather than a foreign listener", async () => {
    const server = await createTestApp({ bypassAuth: true });
    let hits = 0;
    server.on("request", () => {
      hits += 1;
    });

    await testRequest(server).get("/api/__no_such_route__");

    expect(hits).toBe(1);
  });
});
