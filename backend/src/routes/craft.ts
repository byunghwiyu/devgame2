import type { FastifyInstance } from "fastify";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";

export async function craftRoutes(app: FastifyInstance) {
  app.get("/recipes", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    return { ok: true, data: dataRegistry.recipes };
  });

  app.post<{ Body: { recipeId: string } }>("/craft/start", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const recipe = dataRegistry.getRecipe(String(request.body?.recipeId ?? ""));
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ ok: false, error: "USER_NOT_FOUND" });

    if (user.credits < recipe.costCredits || user.materialA < recipe.costMaterialA || user.materialB < recipe.costMaterialB) {
      return reply.code(400).send({ ok: false, error: "NOT_ENOUGH_RESOURCES" });
    }

    const now = new Date();
    const endAt = new Date(now.getTime() + recipe.craftSeconds * 1000);

    const job = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: { decrement: recipe.costCredits },
          materialA: { decrement: recipe.costMaterialA },
          materialB: { decrement: recipe.costMaterialB },
        },
      });

      return tx.craftJob.create({
        data: {
          userId,
          recipeId: recipe.recipeId,
          resultEquipType: recipe.resultEquipType,
          resultGrade: recipe.resultGrade,
          resultStatValue: recipe.statValue,
          startAt: now,
          endAt,
          status: "IN_PROGRESS",
        },
      });
    });

    return { ok: true, data: job };
  });

  app.get("/craft/status", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    const jobs = await prisma.craftJob.findMany({ where: { userId }, orderBy: { startAt: "desc" }, take: 20 });
    return { ok: true, data: jobs };
  });

  app.post<{ Body: { jobId: string } }>("/craft/claim", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const job = await prisma.craftJob.findFirst({ where: { id: request.body?.jobId, userId } });
    if (!job) return reply.code(404).send({ ok: false, error: "CRAFT_JOB_NOT_FOUND" });
    if (job.status !== "IN_PROGRESS") return reply.code(400).send({ ok: false, error: "CRAFT_ALREADY_CLAIMED" });
    if (job.endAt.getTime() > Date.now()) return reply.code(400).send({ ok: false, error: "CRAFT_NOT_FINISHED" });

    const equip = await prisma.$transaction(async (tx) => {
      const created = await tx.equipment.create({
        data: {
          userId,
          type: job.resultEquipType,
          grade: job.resultGrade,
          statValue: job.resultStatValue,
        },
      });
      await tx.craftJob.update({ where: { id: job.id }, data: { status: "CLAIMED", claimedAt: new Date() } });
      return created;
    });

    return { ok: true, data: equip };
  });
}
