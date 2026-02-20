import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { env } from "./config/env.js";
import { dataRegistry } from "./data/registry.js";
import { authRoutes } from "./routes/auth.js";
import { profileRoutes } from "./routes/profile.js";
import { offerRoutes } from "./routes/offers.js";
import { recruitRoutes } from "./routes/recruit.js";
import { mercenaryRoutes } from "./routes/mercenaries.js";
import { locationRoutes } from "./routes/locations.js";
import { dispatchRoutes } from "./routes/dispatch.js";
import { promotionRoutes } from "./routes/promotion.js";
import { craftRoutes } from "./routes/craft.js";
import { equipmentRoutes } from "./routes/equipment.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: env.jwtSecret });

app.get("/health", async () => ({ ok: true, message: "OK" }));

try {
  dataRegistry.loadAll();
} catch (e) {
  app.log.error(e, "DataRegistry load failed");
  process.exit(1);
}

await app.register(authRoutes);
await app.register(profileRoutes);
await app.register(offerRoutes);
await app.register(recruitRoutes);
await app.register(mercenaryRoutes);
await app.register(locationRoutes);
await app.register(dispatchRoutes);
await app.register(promotionRoutes);
await app.register(craftRoutes);
await app.register(equipmentRoutes);

const start = async () => {
  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    app.log.info(`server running on :${env.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
