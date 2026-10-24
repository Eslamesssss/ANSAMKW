import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { adminGuard } from "../../src/api/auth";

describe("adminGuard", () => {
  it("compares tokens case-sensitively and accepts any Bearer casing", async () => {
    const app = Fastify();
    const token = "AbCdEf".repeat(6);
    app.get("/x", { preHandler: adminGuard(token) }, async () => ({ ok: true }));
    expect((await app.inject({ url: "/x", headers: { authorization: `bearer ${token}` } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/x", headers: { authorization: `Bearer ${token.toLowerCase()}` } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/x", headers: { authorization: `Bearer ${token}extra` } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/x", headers: { authorization: `Bearer ${token} extra` } })).statusCode).toBe(401);
    await app.close();
  });
});
