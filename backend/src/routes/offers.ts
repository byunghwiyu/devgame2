import type { FastifyInstance } from "fastify";
import { ECONOMY_CONFIG } from "../config/economy.js";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";
import { createOfferTemplateId, makeSeed, previewTalentTagFromSeed } from "../services/game.js";

async function refillOffers(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("user not found");
  const office = dataRegistry.getOfficeLevel(user.officeLevel);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + office.offerResetSeconds * 1000);

  const upserts = Array.from({ length: office.offerCount }).map((_, idx) =>
    prisma.offer.upsert({
      where: { userId_slotIndex: { userId, slotIndex: idx } },
      update: {
        templateId: createOfferTemplateId(office.minGrade, office.maxGrade),
        expiresAt,
        seed: makeSeed(),
      },
      create: {
        userId,
        slotIndex: idx,
        templateId: createOfferTemplateId(office.minGrade, office.maxGrade),
        expiresAt,
        seed: makeSeed(),
      },
    }),
  );
  await prisma.$transaction(upserts);
}

async function ensureOffers(userId: string): Promise<void> {
  const offers = await prisma.offer.findMany({ where: { userId }, orderBy: { slotIndex: "asc" } });
  const now = new Date();
  const hasUnknownTemplate = offers.some((o) => !dataRegistry.getTemplateOrNull(o.templateId));
  if (
    offers.length < ECONOMY_CONFIG.offerDefaultCount ||
    offers.some((o) => o.expiresAt.getTime() <= now.getTime()) ||
    hasUnknownTemplate
  ) {
    await refillOffers(userId);
  }
}

export async function offerRoutes(app: FastifyInstance) {
  app.get("/offers", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    await ensureOffers(userId);
    const offers = await prisma.offer.findMany({ where: { userId }, orderBy: { slotIndex: "asc" } });

    return {
      ok: true,
      data: offers.map((o) => {
        const t = dataRegistry.getTemplate(o.templateId);
        const talentTag = previewTalentTagFromSeed(o.seed);
        const talent = dataRegistry.getTalent(talentTag);
        return {
          slotIndex: o.slotIndex,
          templateId: o.templateId,
          name: t.name,
          imageUrl: t.imageUrl,
          grade: t.grade,
          roleTag: t.roleTag,
          recruitCostCredits: t.recruitCostCredits,
          traitLine: t.traitLine,
          talentTag,
          talentName: talent?.name ?? null,
          expiresAt: o.expiresAt,
        };
      }),
    };
  });

  app.post("/offers/reroll", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ ok: false, error: "USER_NOT_FOUND" });

    const office = dataRegistry.getOfficeLevel(user.officeLevel);
    if (user.credits < office.rerollCostCredits) {
      return reply.code(400).send({ ok: false, error: "NOT_ENOUGH_CREDITS" });
    }

    await prisma.user.update({ where: { id: userId }, data: { credits: { decrement: office.rerollCostCredits } } });
    await refillOffers(userId);
    const refreshed = await prisma.offer.findMany({ where: { userId }, orderBy: { slotIndex: "asc" } });
    return { ok: true, data: refreshed };
  });
}
