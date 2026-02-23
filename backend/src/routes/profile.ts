import type { FastifyInstance } from "fastify";
import { ECONOMY_CONFIG } from "../config/economy.js";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";

export async function profileRoutes(app: FastifyInstance) {
  app.get("/profile", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ ok: false, error: "USER_NOT_FOUND" });

    const now = new Date();
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - user.lastLoginAt.getTime()) / 1000));
    const appliedSec = Math.min(elapsedSec, ECONOMY_CONFIG.offline.capSeconds);
    const reward = Math.floor(appliedSec * ECONOMY_CONFIG.offline.baseRatePerSec);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        credits: { increment: reward },
        lastLoginAt: now,
      },
    });

    return {
      ok: true,
      data: {
        user: {
          id: updated.id,
          credits: updated.credits,
          materialA: updated.materialA,
          materialB: updated.materialB,
          officeLevel: updated.officeLevel,
          lastLoginAt: updated.lastLoginAt,
        },
        offlineReward: {
          elapsedAppliedSeconds: appliedSec,
          rewardGranted: reward,
          baseRatePerSec: ECONOMY_CONFIG.offline.baseRatePerSec,
          capSeconds: ECONOMY_CONFIG.offline.capSeconds,
        },
      },
    };
  });

  app.post("/profile/cheat-credits", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: 100000 } },
      select: { credits: true },
    });

    return {
      ok: true,
      data: {
        gained: 100000,
        credits: updated.credits,
      },
    };
  });
}
