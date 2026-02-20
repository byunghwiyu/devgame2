import type { FastifyInstance } from "fastify";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";

export async function promotionRoutes(app: FastifyInstance) {
  app.post<{ Body: { mercId: string; route: "A" | "B" } }>("/promotion/start", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const mercId = String(request.body?.mercId ?? "");
    const route = request.body?.route === "B" ? "B" : "A";

    const merc = await prisma.mercenary.findFirst({ where: { id: mercId, userId } });
    if (!merc) return reply.code(404).send({ ok: false, error: "MERC_NOT_FOUND" });

    const rule = dataRegistry.promotionRules.find((r) => r.gradeFrom === merc.grade && r.route === route);
    if (!rule) return reply.code(400).send({ ok: false, error: "PROMOTION_RULE_NOT_FOUND" });
    if (merc.level < rule.requiredLevel) return reply.code(400).send({ ok: false, error: "PROMOTION_LEVEL_TOO_LOW" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.credits < rule.costCredits) return reply.code(400).send({ ok: false, error: "NOT_ENOUGH_CREDITS" });

    const inProgress = await prisma.promotionJob.findFirst({ where: { mercenaryId: mercId, status: "IN_PROGRESS" } });
    if (inProgress) return reply.code(400).send({ ok: false, error: "PROMOTION_ALREADY_IN_PROGRESS" });

    const now = new Date();
    const endAt = new Date(now.getTime() + rule.timeSeconds * 1000);

    const job = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { credits: { decrement: rule.costCredits } } });
      return tx.promotionJob.create({
        data: {
          userId,
          mercenaryId: mercId,
          route,
          gradeFrom: rule.gradeFrom,
          gradeTo: rule.gradeTo,
          multiplierBonus: rule.multiplierBonus,
          startAt: now,
          endAt,
          status: "IN_PROGRESS",
        },
      });
    });

    return { ok: true, data: job };
  });

  app.get("/promotion/status", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    const jobs = await prisma.promotionJob.findMany({ where: { userId }, orderBy: { startAt: "desc" }, take: 20 });
    return { ok: true, data: jobs };
  });

  app.post<{ Body: { jobId: string } }>("/promotion/claim", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const job = await prisma.promotionJob.findFirst({ where: { id: request.body?.jobId, userId } });
    if (!job) return reply.code(404).send({ ok: false, error: "PROMOTION_JOB_NOT_FOUND" });
    if (job.status !== "IN_PROGRESS") return reply.code(400).send({ ok: false, error: "PROMOTION_ALREADY_CLAIMED" });
    if (job.endAt.getTime() > Date.now()) return reply.code(400).send({ ok: false, error: "PROMOTION_NOT_FINISHED" });

    await prisma.$transaction(async (tx) => {
      await tx.mercenary.update({
        where: { id: job.mercenaryId },
        data: {
          grade: job.gradeTo,
          promotionRoute: job.route,
          promotionBonus: { increment: job.multiplierBonus },
        },
      });
      await tx.promotionJob.update({ where: { id: job.id }, data: { status: "CLAIMED", claimedAt: new Date() } });
    });

    return { ok: true, data: { mercenaryId: job.mercenaryId, gradeTo: job.gradeTo, bonus: job.multiplierBonus } };
  });
}
