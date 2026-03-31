import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  completeRequest,
  createRequest,
  findPetMatches,
  findUserByToken,
  getDb,
  initializeDatabase,
  listEggGroups,
  listPets,
  listRequests,
  loginUser,
  registerUser
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

async function requireAuth(request, reply) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = findUserByToken(db, token);
  if (!user) {
    reply.code(401);
    return null;
  }
  return user;
}

app.get("/api/health", async () => ({ ok: true }));
app.post("/api/auth/register", async (request, reply) => {
  try {
    const body = request.body || {};
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    const contactId = String(body.contactId || "").trim();
    if (!username || !password || !contactId) {
      reply.code(400);
      return { message: "username, password and contactId are required" };
    }
    return registerUser(db, { username, password, contactId });
  } catch (error) {
    reply.code(400);
    return { message: error.message };
  }
});
app.post("/api/auth/login", async (request, reply) => {
  try {
    const body = request.body || {};
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    if (!username || !password) {
      reply.code(400);
      return { message: "username and password are required" };
    }
    return loginUser(db, { username, password });
  } catch (error) {
    reply.code(401);
    return { message: error.message };
  }
});
app.get("/api/auth/me", async (request, reply) => {
  const user = await requireAuth(request, reply);
  if (!user) {
    return { message: "Unauthorized" };
  }
  return { user };
});
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
  const { keyword = "", wantedPet = "", username = "", status = "open" } = request.query;
  return { requests: listRequests(db, { keyword, wantedPet, username, status }) };
});
app.post("/api/requests", async (request, reply) => {
  const user = await requireAuth(request, reply);
  if (!user) {
    return { message: "Unauthorized" };
  }
  const body = request.body || {};
  const wantedPet = String(body.wantedPet || "").trim();
  const offeredPet = String(body.offeredPet || "").trim();
  const note = String(body.note || "").trim();
  if (!wantedPet) {
    reply.code(400);
    return { message: "wantedPet is required" };
  }
  createRequest(db, { userId: user.id, wantedPet, offeredPet, contactId: user.contactId, note });
  reply.code(201);
  return { ok: true };
});
app.patch("/api/requests/:id/complete", async (request, reply) => {
  const user = await requireAuth(request, reply);
  if (!user) {
    return { message: "Unauthorized" };
  }
  const requestId = Number(request.params.id);
  if (!requestId) {
    reply.code(400);
    return { message: "request id is required" };
  }
  const result = completeRequest(db, { requestId, userId: user.id });
  if (!result.completed) {
    reply.code(404);
    return { message: "request not found or already completed" };
  }
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
