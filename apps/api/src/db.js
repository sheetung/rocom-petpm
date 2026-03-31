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

    CREATE TABLE IF NOT EXISTS egg_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wanted_pet TEXT NOT NULL,
      offered_pet TEXT,
      contact_id TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

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

export function listRequests(db, { keyword = "", wantedPet = "" } = {}) {
  let sql = "SELECT * FROM egg_requests WHERE status = 'open'";
  const params = [];

  if (keyword) {
    sql += " AND (wanted_pet LIKE ? OR offered_pet LIKE ? OR contact_id LIKE ? OR note LIKE ?)";
    const search = `%${keyword}%`;
    params.push(search, search, search, search);
  }

  if (wantedPet) {
    sql += " AND wanted_pet = ?";
    params.push(wantedPet);
  }

  sql += " ORDER BY datetime(created_at) DESC, id DESC";
  return db.prepare(sql).all(...params);
}

export function createRequest(db, payload) {
  return db.prepare(`
    INSERT INTO egg_requests (wanted_pet, offered_pet, contact_id, note, status)
    VALUES (?, ?, ?, ?, 'open')
  `).run(
    payload.wantedPet,
    payload.offeredPet || null,
    payload.contactId,
    payload.note || null
  );
}
