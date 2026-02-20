import type { FastifyInstance } from "fastify";
import { dataRegistry } from "../data/registry.js";
import { requireUserId } from "../plugins/auth.js";

export async function locationRoutes(app: FastifyInstance) {
  app.get("/locations", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    return { ok: true, data: dataRegistry.locations };
  });
}
