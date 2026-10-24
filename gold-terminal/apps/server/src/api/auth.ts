import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Bearer-token guard for mutating endpoints. Fails closed: when no token is
 * configured, every guarded request is refused. Tokens are compared as
 * SHA-256 digests with a constant-time comparison so neither the length nor
 * the content leaks through timing.
 */
export function adminGuard(token: string | undefined) {
  const expected = token ? digest(token) : null;
  return async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
    if (!expected) {
      return reply.code(503).send({ error: "admin_token_not_configured", detail: "Set ADMIN_API_TOKEN on the server to enable this endpoint." });
    }
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match || !timingSafeEqual(digest(match[1]!), expected)) {
      return reply
        .code(401)
        .header("WWW-Authenticate", 'Bearer realm="gold-terminal"')
        .send({ error: "unauthorized", detail: match ? "Invalid admin token." : "Admin token required." });
    }
  };
}

function digest(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}
