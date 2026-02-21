import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { account?: string; email?: string; password?: string; nickname?: string } }>("/auth/signup", async (request, reply) => {
    const account = String(request.body?.account ?? request.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(request.body?.password ?? "");
    const nickname = String(request.body?.nickname ?? "").trim();

    if (!/^[a-z0-9._-]{3,24}$/.test(account)) {
      return reply.code(400).send({ ok: false, error: "INVALID_ACCOUNT" });
    }
    if (password.length < 6) {
      return reply.code(400).send({ ok: false, error: "PASSWORD_TOO_SHORT" });
    }

    const exists = await prisma.user.findUnique({ where: { email: account } });
    if (exists) {
      return reply.code(409).send({ ok: false, error: "ACCOUNT_ALREADY_EXISTS" });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        // Temporary: reuse email column as account identifier until email verification is introduced.
        email: account,
        passwordHash,
        nickname: nickname || null,
        credits: 1000,
        materialA: 0,
        materialB: 0,
        officeLevel: 1,
        lastLoginAt: new Date(),
      },
    });

    const token = await reply.jwtSign({ userId: user.id });
    return { ok: true, data: { token } };
  });

  app.post<{ Body: { account?: string; email?: string; password?: string } }>("/auth/login", async (request, reply) => {
    const account = String(request.body?.account ?? request.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(request.body?.password ?? "");
    if (!account || !password) {
      return reply.code(400).send({ ok: false, error: "INVALID_LOGIN_INPUT" });
    }

    const user = await prisma.user.findUnique({ where: { email: account } });
    if (!user?.passwordHash) {
      return reply.code(401).send({ ok: false, error: "LOGIN_FAILED" });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ ok: false, error: "LOGIN_FAILED" });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = await reply.jwtSign({ userId: user.id });
    return { ok: true, data: { token } };
  });

  // Keep guest endpoint temporarily for compatibility with older clients/tools.
  app.post("/auth/guest", async (_request, reply) => {
    const user = await prisma.user.create({
      data: {
        credits: 1000,
        materialA: 0,
        materialB: 0,
        officeLevel: 1,
        lastLoginAt: new Date(),
      },
    });

    const token = await reply.jwtSign({ userId: user.id });
    return { ok: true, data: { token } };
  });
}
