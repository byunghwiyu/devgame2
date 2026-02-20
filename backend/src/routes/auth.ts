import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";

export async function authRoutes(app: FastifyInstance) {
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
