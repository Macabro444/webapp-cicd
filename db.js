const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { instrumentarSqlite } = require("./telemetria");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "webapp.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = instrumentarSqlite(new Database(DB_PATH));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    categoria_id INTEGER,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
  );
`);

// Semilla minima para que la API no arranque vacia.
const count = db.prepare("SELECT COUNT(*) AS c FROM categorias").get().c;
if (count === 0) {
  db.prepare("INSERT INTO categorias (nombre) VALUES (?)").run("General");
}

module.exports = { db, DB_PATH, DATA_DIR };
