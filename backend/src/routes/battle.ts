import type { FastifyInstance } from "fastify";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";
import { battleService } from "../services/battle.js";

function toPartyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

export async function battleRoutes(app: FastifyInstance) {
  app.get("/battle/config", async () => {
    return {
      ok: true,
      data: {
        maxPartySize: Math.max(1, Math.floor(dataRegistry.getDefineValue("maxPartySize", 3))),
        teamSlotCount: Math.max(1, Math.floor(dataRegistry.getDefineValue("teamSlotCount", 4))),
      },
    };
  });

  app.get("/battle/current", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    try {
      const state = await battleService.getCurrent(userId);
      return { ok: true, data: state };
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message || "BATTLE_CURRENT_FAILED" });
    }
  });

  app.post<{ Body: { locationId: string; partyIds: string[] } }>("/battle/start", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    try {
      const locationId = String(request.body?.locationId ?? "");
      const maxPartySize = Math.max(1, Math.floor(dataRegistry.getDefineValue("maxPartySize", 3)));
      const partyIds = toPartyIds(request.body?.partyIds ?? []).slice(0, maxPartySize);
      if (!locationId || partyIds.length < 1) {
        return reply.code(400).send({ ok: false, error: "INVALID_BATTLE_REQUEST" });
      }
      const state = await battleService.startBattle(userId, locationId, partyIds);
      return { ok: true, data: state };
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message || "BATTLE_START_FAILED" });
    }
  });

  app.get<{ Querystring: { sessionId: string } }>("/battle/state", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    try {
      const sessionId = String(request.query?.sessionId ?? "");
      if (!sessionId) return reply.code(400).send({ ok: false, error: "SESSION_ID_REQUIRED" });
      const state = await battleService.getState(userId, sessionId);
      return { ok: true, data: state };
    } catch (e) {
      return reply.code(404).send({ ok: false, error: (e as Error).message || "BATTLE_NOT_FOUND" });
    }
  });

  app.post<{ Body: { sessionId: string } }>("/battle/retreat", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    try {
      const sessionId = String(request.body?.sessionId ?? "");
      if (!sessionId) return reply.code(400).send({ ok: false, error: "SESSION_ID_REQUIRED" });
      const state = await battleService.retreat(userId, sessionId);
      return { ok: true, data: state };
    } catch (e) {
      return reply.code(404).send({ ok: false, error: (e as Error).message || "BATTLE_NOT_FOUND" });
    }
  });

  app.post<{ Body: { sessionId: string } }>("/battle/close", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    try {
      const sessionId = String(request.body?.sessionId ?? "");
      if (!sessionId) return reply.code(400).send({ ok: false, error: "SESSION_ID_REQUIRED" });
      await battleService.close(userId, sessionId);
      return { ok: true, data: { closed: true } };
    } catch (e) {
      return reply.code(404).send({ ok: false, error: (e as Error).message || "BATTLE_NOT_FOUND" });
    }
  });
}
