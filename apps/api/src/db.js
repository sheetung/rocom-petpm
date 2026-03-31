import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, "../../../data/pets.json");
const dbPath = path.resolve(__dirname, "../storage/app.db");

function ensureStorage() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function loadSeedPets() {
  const raw = fs.readFileSync(dataPath, "utf8");
  return JSON.parse(raw);
}

function hasColumn(db, tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }
  const [salt, digest] = storedHash.split(":");
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(digest, "hex");
  return original.length === candidate.length && timingSafeEqual(original, candidate);
}

function createSessionToken(username) {
  return createHash("sha256").update(`${username}:${Date.now()}:${randomBytes(12).toString("hex")}`).digest("hex");
}

export function getDb() {
  ensureStorage();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

export function initializeDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS egg_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS pet_egg_groups (
      pet_id INTEGER NOT NULL,
      egg_group_id INTEGER NOT NULL,
      PRIMARY KEY (pet_id, egg_group_id),
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
      FOREIGN KEY (egg_group_id) REFERENCES egg_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      contact_id TEXT NOT NULL DEFAULT '',
      user_key TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS egg_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      wanted_pet TEXT NOT NULL,
      offered_pet TEXT,
      contact_id TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  if (!hasColumn(db, "users", "username")) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
  }
  if (!hasColumn(db, "users", "password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }
  if (!hasColumn(db, "users", "contact_id")) {
    db.exec("ALTER TABLE users ADD COLUMN contact_id TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn(db, "egg_requests", "user_id")) {
    db.exec("ALTER TABLE egg_requests ADD COLUMN user_id INTEGER");
  }
  if (!hasColumn(db, "egg_requests", "completed_at")) {
    db.exec("ALTER TABLE egg_requests ADD COLUMN completed_at TEXT");
  }

  migrateLegacyUsers(db);

  const petCount = db.prepare("SELECT COUNT(*) AS count FROM pets").get().count;
  if (petCount === 0) {
    seedPets(db);
  }
}

function migrateLegacyUsers(db) {
  const rows = db.prepare(`
    SELECT id, user_key, contact_id
    FROM users
    WHERE username IS NULL AND user_key IS NOT NULL
  `).all();

  const updateUser = db.prepare("UPDATE users SET username = ?, contact_id = COALESCE(NULLIF(contact_id, ''), ?), password_hash = COALESCE(password_hash, '') WHERE id = ?");
  const txn = db.transaction(() => {
    for (const row of rows) {
      updateUser.run(String(row.user_key).trim(), row.contact_id || String(row.user_key).trim(), row.id);
    }
  });
  txn();

  const legacyRequests = db.prepare(`
    SELECT id, contact_id
    FROM egg_requests
    WHERE user_id IS NULL OR user_id = 0
  `).all();
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, contact_id, user_key)
    VALUES (?, '', ?, ?)
    ON CONFLICT(username) DO NOTHING
  `);
  const selectUser = db.prepare("SELECT id FROM users WHERE username = ?");
  const updateRequest = db.prepare("UPDATE egg_requests SET user_id = ? WHERE id = ?");
  const txn2 = db.transaction(() => {
    for (const row of legacyRequests) {
      const legacyUsername = String(row.contact_id || `legacy-${row.id}`).trim();
      insertUser.run(legacyUsername, row.contact_id || legacyUsername, legacyUsername);
      const userId = selectUser.get(legacyUsername)?.id;
      if (userId) {
        updateRequest.run(userId, row.id);
      }
    }
  });
  txn2();
}

function seedPets(db) {
  const pets = loadSeedPets();
  const insertEggGroup = db.prepare("INSERT OR IGNORE INTO egg_groups (name) VALUES (?)");
  const insertPet = db.prepare("INSERT INTO pets (name) VALUES (?)");
  const insertJoin = db.prepare("INSERT INTO pet_egg_groups (pet_id, egg_group_id) VALUES (?, ?)");
  const selectPet = db.prepare("SELECT id FROM pets WHERE name = ?");
  const selectEggGroup = db.prepare("SELECT id FROM egg_groups WHERE name = ?");

  const transaction = db.transaction(() => {
    for (const pet of pets) {
      insertPet.run(pet.name);
      const petId = selectPet.get(pet.name).id;
      for (const group of pet.groups) {
        insertEggGroup.run(group);
        const eggGroupId = selectEggGroup.get(group).id;
        insertJoin.run(petId, eggGroupId);
      }
    }
  });
  transaction();
}

function groupsByPetId(db) {
  const rows = db.prepare(`
    SELECT peg.pet_id AS petId, eg.name AS groupName
    FROM pet_egg_groups peg
    INNER JOIN egg_groups eg ON eg.id = peg.egg_group_id
    ORDER BY eg.name ASC
  `).all();
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.petId) || [];
    current.push(row.groupName);
    map.set(row.petId, current);
  }
  return map;
}

function attachGroups(rows, groupMap) {
  return rows.map((row) => ({ id: row.id, name: row.name, groups: groupMap.get(row.id) || [] }));
}

export function listEggGroups(db) {
  return db.prepare("SELECT name FROM egg_groups ORDER BY name ASC").all().map((row) => row.name);
}

export function listPets(db, { search = "", group = "" } = {}) {
  let sql = "SELECT id, name FROM pets WHERE 1 = 1";
  const params = [];
  if (search) {
    sql += " AND name LIKE ?";
    params.push(`%${search}%`);
  }
  sql += " ORDER BY name ASC";
  const rows = db.prepare(sql).all(...params);
  const pets = attachGroups(rows, groupsByPetId(db));
  return !group || group === "全部" ? pets : pets.filter((pet) => pet.groups.includes(group));
}

export function findPetMatches(db, petName) {
  const rows = listPets(db);
  const pet = rows.find((item) => item.name === petName);
  if (!pet) return { pet: null, matches: [] };
  const matches = rows.filter((candidate) => candidate.id !== pet.id && candidate.groups.some((group) => pet.groups.includes(group)));
  return { pet, matches };
}

export function listRequests(db, { keyword = "", wantedPet = "", username = "", status = "open" } = {}) {
  let sql = `
    SELECT er.*, u.username, u.contact_id AS userContactId
    FROM egg_requests er
    LEFT JOIN users u ON u.id = er.user_id
    WHERE 1 = 1
  `;
  const params = [];
  if (status && status !== "all") {
    sql += " AND er.status = ?";
    params.push(status);
  }
  if (keyword) {
    sql += " AND (er.wanted_pet LIKE ? OR er.offered_pet LIKE ? OR er.contact_id LIKE ? OR er.note LIKE ? OR u.username LIKE ?)";
    const search = `%${keyword}%`;
    params.push(search, search, search, search, search);
  }
  if (wantedPet) {
    sql += " AND er.wanted_pet = ?";
    params.push(wantedPet);
  }
  if (username) {
    sql += " AND u.username = ?";
    params.push(username);
  }
  sql += " ORDER BY datetime(COALESCE(er.completed_at, er.created_at)) DESC, er.id DESC";
  return db.prepare(sql).all(...params);
}

export function registerUser(db, { username, password, contactId }) {
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    throw new Error("username already exists");
  }
  const passwordHash = hashPassword(password);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, contact_id, user_key)
    VALUES (?, ?, ?, ?)
  `).run(username, passwordHash, contactId, username);
  const user = db.prepare("SELECT id, username, contact_id FROM users WHERE id = ?").get(result.lastInsertRowid);
  const token = createSession(db, user.id);
  return { user, token };
}

export function loginUser(db, { username, password }) {
  const user = db.prepare("SELECT id, username, password_hash, contact_id FROM users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("invalid credentials");
  }
  const token = createSession(db, user.id);
  return {
    user: { id: user.id, username: user.username, contactId: user.contact_id },
    token
  };
}

function createSession(db, userId) {
  const token = createSessionToken(String(userId));
  db.prepare("INSERT INTO user_sessions (user_id, token) VALUES (?, ?)").run(userId, token);
  return token;
}

export function findUserByToken(db, token) {
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.username, u.contact_id AS contactId
    FROM user_sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
    ORDER BY s.id DESC
    LIMIT 1
  `).get(token) || null;
}

export function createRequest(db, payload) {
  return db.prepare(`
    INSERT INTO egg_requests (user_id, wanted_pet, offered_pet, contact_id, note, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).run(payload.userId, payload.wantedPet, payload.offeredPet || null, payload.contactId, payload.note || null);
}

export function completeRequest(db, { requestId, userId }) {
  const request = db.prepare(`
    SELECT id
    FROM egg_requests
    WHERE id = ? AND user_id = ? AND status = 'open'
  `).get(requestId, userId);
  if (!request) {
    return { completed: false };
  }
  db.prepare("UPDATE egg_requests SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(requestId);
  return { completed: true };
}
