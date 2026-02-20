import type { Dispatch } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { ECONOMY_CONFIG } from "../config/economy.js";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";
import { calcDispatchChance, calcEquipBonus, calcMercPower, levelUpWithExp } from "../services/game.js";

function toPartyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

export async function dispatchRoutes(app: FastifyInstance) {
  app.post<{ Body: { locationId: string; partyIds: string[] } }>("/dispatch/start", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const locationId = String(request.body?.locationId ?? "");
    const partyIds = toPartyIds(request.body?.partyIds ?? []).slice(0, ECONOMY_CONFIG.maxPartySize);
    if (!locationId || partyIds.length < 1) {
      return reply.code(400).send({ ok: false, error: "INVALID_DISPATCH_REQUEST" });
    }

    const existing = await prisma.dispatch.findFirst({ where: { userId, status: "IN_PROGRESS" } });
    if (existing) return reply.code(400).send({ ok: false, error: "DISPATCH_ALREADY_IN_PROGRESS" });

    const location = dataRegistry.getLocation(locationId);
    const mercs = await prisma.mercenary.findMany({ where: { userId, id: { in: partyIds } } });
    if (mercs.length !== partyIds.length) return reply.code(400).send({ ok: false, error: "INVALID_PARTY_MEMBERS" });
    if (mercs.some((m) => m.isDispatched)) return reply.code(400).send({ ok: false, error: "MERC_ALREADY_DISPATCHED" });

    const equips = await prisma.equipment.findMany({ where: { userId, equippedMercId: { in: partyIds } } });
    const partyPower = mercs.reduce((sum, merc) => {
      const tpl = dataRegistry.getTemplate(merc.templateId);
      const equipBonus = calcEquipBonus(equips.filter((e) => e.equippedMercId === merc.id));
      return sum + calcMercPower(merc, tpl.baseStat, equipBonus);
    }, 0);

    const successChance = calcDispatchChance(partyPower, location.difficulty);
    const success = Math.random() <= successChance;
    const rewardRate = success ? 1 : 0.35;

    const rewardCredits = Math.floor(location.baseCreditReward * rewardRate);
    const rewardExp = Math.floor(location.baseExpReward * rewardRate);
    const rewardMaterialA = Math.floor(location.materialAReward * rewardRate);
    const rewardMaterialB = Math.floor(location.materialBReward * rewardRate);

    const now = new Date();
    const endAt = new Date(now.getTime() + location.dispatchSeconds * 1000);

    const dispatch = await prisma.$transaction(async (tx) => {
      await tx.mercenary.updateMany({ where: { id: { in: partyIds }, userId }, data: { isDispatched: true } });
      return tx.dispatch.create({
        data: {
          userId,
          partyIds: partyIds,
          locationId,
          startAt: now,
          endAt,
          status: "IN_PROGRESS",
          successChance,
          successResult: success,
          rewardCredits,
          rewardExp,
          rewardMaterialA,
          rewardMaterialB,
        },
      });
    });

    return { ok: true, data: dispatch };
  });

  app.get("/dispatch/status", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const latest = await prisma.dispatch.findFirst({ where: { userId }, orderBy: { startAt: "desc" } });
    if (!latest) return { ok: true, data: null };

    const nowMs = Date.now();
    const remainsMs = Math.max(0, latest.endAt.getTime() - nowMs);
    return {
      ok: true,
      data: {
        ...latest,
        remainsSeconds: Math.ceil(remainsMs / 1000),
        claimable: latest.status === "IN_PROGRESS" && remainsMs <= 0,
      },
    };
  });

  app.post<{ Body: { dispatchId?: string } }>("/dispatch/claim", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const dispatch: Dispatch | null = request.body?.dispatchId
      ? await prisma.dispatch.findFirst({ where: { id: request.body.dispatchId, userId } })
      : await prisma.dispatch.findFirst({ where: { userId, status: "IN_PROGRESS" }, orderBy: { startAt: "desc" } });

    if (!dispatch) return reply.code(404).send({ ok: false, error: "DISPATCH_NOT_FOUND" });
    if (dispatch.status !== "IN_PROGRESS") return reply.code(400).send({ ok: false, error: "DISPATCH_ALREADY_CLAIMED" });
    if (dispatch.endAt.getTime() > Date.now()) return reply.code(400).send({ ok: false, error: "DISPATCH_NOT_FINISHED" });

    const partyIds = toPartyIds(dispatch.partyIds);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: { increment: dispatch.rewardCredits },
          materialA: { increment: dispatch.rewardMaterialA },
          materialB: { increment: dispatch.rewardMaterialB },
        },
      });

      const mercs = await tx.mercenary.findMany({ where: { id: { in: partyIds }, userId } });
      for (const merc of mercs) {
        const gained = levelUpWithExp(merc.level, merc.exp, dispatch.rewardExp);
        await tx.mercenary.update({
          where: { id: merc.id },
          data: { level: gained.level, exp: gained.exp, isDispatched: false },
        });
      }

      await tx.dispatch.update({ where: { id: dispatch.id }, data: { status: "CLAIMED", claimedAt: new Date() } });
    });

    return {
      ok: true,
      data: {
        success: dispatch.successResult,
        rewardCredits: dispatch.rewardCredits,
        rewardExp: dispatch.rewardExp,
        rewardMaterialA: dispatch.rewardMaterialA,
        rewardMaterialB: dispatch.rewardMaterialB,
      },
    };
  });
}
