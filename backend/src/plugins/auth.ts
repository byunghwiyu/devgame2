import type { FastifyReply, FastifyRequest } from "fastify";

export type JwtPayload = { userId: string };

export async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | undefined> {
  try {
    const payload = await request.jwtVerify<JwtPayload>();
    return payload.userId;
  } catch {
    reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
    return undefined;
  }
}
