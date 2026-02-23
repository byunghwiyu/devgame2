import type { FastifyInstance } from "fastify";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";
import { prisma } from "../plugins/prisma.js";

export async function locationRoutes(app: FastifyInstance) {
  app.get("/locations", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { officeLevel: true } });
    const officeLevel = user?.officeLevel ?? 1;
    const list = dataRegistry.locations
      .map((loc) => ({ ...loc, isOpen: loc.isOpen && loc.difficulty <= officeLevel }))
      .sort((a, b) => a.difficulty - b.difficulty);
    return { ok: true, data: list };
  });
}
