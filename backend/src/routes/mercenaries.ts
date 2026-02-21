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
      const tpl = dataRegistry.getTemplate(m.templateId);
      const equipped = equips.filter((e) => e.equippedMercId === m.id);
      const equipBonus = calcEquipBonus(equipped);
      const power = calcMercPower(m, tpl.baseStat, equipBonus);
      const talent = dataRegistry.getTalent(m.talentTag);
      return {
        id: m.id,
        templateId: m.templateId,
        name: tpl.name,
        grade: m.grade,
        roleTag: m.roleTag,
        level: m.level,
        exp: m.exp,
        promotionRoute: m.promotionRoute,
        promotionBonus: m.promotionBonus,
        isDispatched: m.isDispatched,
        power,
        traitLine: tpl.traitLine,
        talentTag: m.talentTag,
        talentName: talent?.name ?? null,
        talentDescription: talent?.description ?? null,
      };
    });

    return { ok: true, data: list };
  });
}
