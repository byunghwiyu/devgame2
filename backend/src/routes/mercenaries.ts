import type { FastifyInstance } from "fastify";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";
import { calcEquipBonus, calcMercPower } from "../services/game.js";

export async function mercenaryRoutes(app: FastifyInstance) {
  app.get("/mercenaries", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const mercs = await prisma.mercenary.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    const equips = await prisma.equipment.findMany({ where: { userId } });

    const list = mercs.map((m) => {
      const tpl = dataRegistry.getTemplateOrNull(m.templateId);
      const equipped = equips.filter((e) => e.equippedMercId === m.id);
      const equipBonus = calcEquipBonus(equipped);
      const baseStat = tpl?.baseStat ?? 40;
      const power = calcMercPower(m, baseStat, equipBonus);
      const talent = dataRegistry.getTalent(m.talentTag);
      return {
        id: m.id,
        templateId: m.templateId,
        name: tpl?.name ?? m.templateId,
        imageUrl: tpl?.imageUrl ?? "",
        grade: m.grade,
        roleTag: tpl?.roleTag ?? m.roleTag,
        level: m.level,
        exp: m.exp,
        promotionRoute: m.promotionRoute,
        promotionBonus: m.promotionBonus,
        isDispatched: m.isDispatched,
        power,
        traitLine: tpl?.traitLine ?? "Template data missing",
        talentTag: m.talentTag,
        talentName: talent?.name ?? null,
        talentDescription: talent?.description ?? null,
      };
    });

    return { ok: true, data: list };
  });
}
