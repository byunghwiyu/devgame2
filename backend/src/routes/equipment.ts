import type { FastifyInstance } from "fastify";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";

export async function equipmentRoutes(app: FastifyInstance) {
  app.get("/equipments", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    const list = await prisma.equipment.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return { ok: true, data: list };
  });

  app.post<{ Body: { mercId: string; equipId: string; slotIndex: number } }>("/equip", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const mercId = String(request.body?.mercId ?? "");
    const equipId = String(request.body?.equipId ?? "");
    const slotIndex = Number(request.body?.slotIndex ?? -1);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 3) {
      return reply.code(400).send({ ok: false, error: "INVALID_SLOT_INDEX" });
    }

    const merc = await prisma.mercenary.findFirst({ where: { id: mercId, userId } });
    if (!merc) return reply.code(404).send({ ok: false, error: "MERC_NOT_FOUND" });

    const equip = await prisma.equipment.findFirst({ where: { id: equipId, userId } });
    if (!equip) return reply.code(404).send({ ok: false, error: "EQUIP_NOT_FOUND" });

    await prisma.$transaction(async (tx) => {
      await tx.equipment.updateMany({ where: { userId, equippedMercId: mercId, slotIndex }, data: { equippedMercId: null, slotIndex: null } });
      await tx.equipment.update({ where: { id: equipId }, data: { equippedMercId: mercId, slotIndex } });
    });

    return { ok: true };
  });

  app.post<{ Body: { equipId: string } }>("/unequip", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const equipId = String(request.body?.equipId ?? "");
    const equip = await prisma.equipment.findFirst({ where: { id: equipId, userId } });
    if (!equip) return reply.code(404).send({ ok: false, error: "EQUIP_NOT_FOUND" });

    await prisma.equipment.update({ where: { id: equipId }, data: { equippedMercId: null, slotIndex: null } });
    return { ok: true };
  });
}
