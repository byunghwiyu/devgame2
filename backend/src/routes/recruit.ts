import type { FastifyInstance } from "fastify";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";
import { createOfferTemplateId, makeSeed, previewTalentTagFromSeed } from "../services/game.js";

export async function recruitRoutes(app: FastifyInstance) {
  app.post<{ Body: { slotIndex: number } }>("/recruit", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const slotIndex = Number(request.body?.slotIndex);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 3) {
      return reply.code(400).send({ ok: false, error: "INVALID_SLOT_INDEX" });
    }

    const offer = await prisma.offer.findUnique({ where: { userId_slotIndex: { userId, slotIndex } } });
    if (!offer) return reply.code(404).send({ ok: false, error: "OFFER_NOT_FOUND" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ ok: false, error: "USER_NOT_FOUND" });

    const template = dataRegistry.getTemplate(offer.templateId);
    const talentTag = previewTalentTagFromSeed(offer.seed);
    if (user.credits < template.recruitCostCredits) {
      return reply.code(400).send({ ok: false, error: "NOT_ENOUGH_CREDITS" });
    }

    const office = dataRegistry.getOfficeLevel(user.officeLevel);
    const expiresAt = new Date(Date.now() + office.offerResetSeconds * 1000);

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { credits: { decrement: template.recruitCostCredits } } });
      const merc = await tx.mercenary.create({
        data: {
          userId,
          templateId: template.templateId,
          roleTag: template.roleTag,
          grade: template.grade,
          level: 1,
          exp: 0,
          talentTag,
          promotionBonus: 0,
          isDispatched: false,
        },
      });

      await tx.offer.update({
        where: { userId_slotIndex: { userId, slotIndex } },
        data: {
          templateId: createOfferTemplateId(office.minGrade, office.maxGrade),
          expiresAt,
          seed: makeSeed(),
        },
      });

      return merc;
    });

    return { ok: true, data: result };
  });
}
