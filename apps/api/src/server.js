import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRequest,
  findPetMatches,
  getDb,
  initializeDatabase,
  listEggGroups,
  listPets,
  listRequests
} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDistPath = path.resolve(__dirname, "../../web/dist");

const app = Fastify({ logger: true });
const db = getDb();
initializeDatabase(db);

await app.register(cors, { origin: true });

if (fs.existsSync(webDistPath)) {
  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: "/",
    decorateReply: false
  });
}

app.get("/api/health", async () => ({ ok: true }));
app.get("/api/egg-groups", async () => ({ groups: listEggGroups(db) }));
app.get("/api/pets", async (request) => {
  const { search = "", group = "" } = request.query;
  return { pets: listPets(db, { search, group }) };
});
app.get("/api/breed/matches", async (request) => {
  const { petName = "" } = request.query;
  return findPetMatches(db, String(petName || "").trim());
});
app.get("/api/requests", async (request) => {
  const { keyword = "", wantedPet = "" } = request.query;
  return { requests: listRequests(db, { keyword, wantedPet }) };
});
app.post("/api/requests", async (request, reply) => {
  const body = request.body || {};
  const wantedPet = String(body.wantedPet || "").trim();
  const offeredPet = String(body.offeredPet || "").trim();
  const contactId = String(body.contactId || "").trim();
  const note = String(body.note || "").trim();

  if (!wantedPet || !contactId) {
    reply.code(400);
    return { message: "wantedPet and contactId are required" };
  }

  createRequest(db, { wantedPet, offeredPet, contactId, note });
  reply.code(201);
  return { ok: true };
});

app.setNotFoundHandler(async (request, reply) => {
  const indexFile = path.join(webDistPath, "index.html");
  if (!fs.existsSync(indexFile) || request.url.startsWith("/api/")) {
    reply.code(404);
    return { message: "Not found" };
  }
  reply.type("text/html; charset=utf-8");
  return reply.send(fs.createReadStream(indexFile));
});

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
