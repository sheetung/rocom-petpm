import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
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
      user_key TEXT NOT NULL UNIQUE,
      contact_id TEXT NOT NULL,
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  if (!hasColumn(db, "egg_requests", "user_id")) {
    db.exec("ALTER TABLE egg_requests ADD COLUMN user_id INTEGER");
  }

  backfillLegacyUsers(db);

  const petCount = db.prepare("SELECT COUNT(*) AS count FROM pets").get().count;
  if (petCount > 0) {
    return;
  }

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

function backfillLegacyUsers(db) {
  const legacyRows = db.prepare(`
    SELECT id, contact_id
    FROM egg_requests
    WHERE user_id IS NULL OR user_id = 0
  `).all();

  if (!legacyRows.length) {
    return;
  }

  const insertUser = db.prepare("INSERT OR IGNORE INTO users (user_key, contact_id) VALUES (?, ?)");
  const selectUser = db.prepare("SELECT id FROM users WHERE user_key = ?");
  const updateRequest = db.prepare("UPDATE egg_requests SET user_id = ? WHERE id = ?");

  const transaction = db.transaction(() => {
    for (const row of legacyRows) {
      const legacyKey = String(row.contact_id || `legacy-${row.id}`).trim();
      insertUser.run(legacyKey, String(row.contact_id || legacyKey));
      const userId = selectUser.get(legacyKey)?.id;
      if (userId) {
        updateRequest.run(userId, row.id);
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
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    groups: groupMap.get(row.id) || []
  }));
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

  if (!group || group === "全部") {
    return pets;
  }

  return pets.filter((pet) => pet.groups.includes(group));
}

export function findPetMatches(db, petName) {
  const rows = listPets(db);
  const pet = rows.find((item) => item.name === petName);
  if (!pet) {
    return { pet: null, matches: [] };
  }

  const matches = rows.filter((candidate) => {
    if (candidate.id === pet.id) {
      return false;
    }
    return candidate.groups.some((group) => pet.groups.includes(group));
  });

  return { pet, matches };
}

export function listRequests(db, { keyword = "", wantedPet = "", userKey = "" } = {}) {
  let sql = `
    SELECT er.*, u.user_key AS userKey, u.contact_id AS userContactId
    FROM egg_requests er
    LEFT JOIN users u ON u.id = er.user_id
    WHERE er.status = 'open'
  `;
  const params = [];

  if (keyword) {
    sql += " AND (er.wanted_pet LIKE ? OR er.offered_pet LIKE ? OR er.contact_id LIKE ? OR er.note LIKE ? OR u.user_key LIKE ?)";
    const search = `%${keyword}%`;
    params.push(search, search, search, search, search);
  }

  if (wantedPet) {
    sql += " AND er.wanted_pet = ?";
    params.push(wantedPet);
  }

  if (userKey) {
    sql += " AND u.user_key = ?";
    params.push(userKey);
  }

  sql += " ORDER BY datetime(er.created_at) DESC, er.id DESC";
  return db.prepare(sql).all(...params);
}

export function createOrGetUser(db, { userKey, contactId }) {
  db.prepare(`
    INSERT INTO users (user_key, contact_id)
    VALUES (?, ?)
    ON CONFLICT(user_key) DO UPDATE SET contact_id = excluded.contact_id
  `).run(userKey, contactId);

  return db.prepare("SELECT id, user_key, contact_id FROM users WHERE user_key = ?").get(userKey);
}

export function createRequest(db, payload) {
  const user = createOrGetUser(db, {
    userKey: payload.userKey,
    contactId: payload.contactId
  });

  return db.prepare(`
    INSERT INTO egg_requests (user_id, wanted_pet, offered_pet, contact_id, note, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).run(
    user.id,
    payload.wantedPet,
    payload.offeredPet || null,
    payload.contactId,
    payload.note || null
  );
}

export function deleteRequest(db, { requestId, userKey }) {
  const request = db.prepare(`
    SELECT er.id
    FROM egg_requests er
    INNER JOIN users u ON u.id = er.user_id
    WHERE er.id = ? AND u.user_key = ?
  `).get(requestId, userKey);

  if (!request) {
    return { deleted: false };
  }

  db.prepare("DELETE FROM egg_requests WHERE id = ?").run(requestId);
  return { deleted: true };
}
