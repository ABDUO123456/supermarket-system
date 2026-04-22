const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db;

function migrateProductsTable(database) {
  const cols = database.prepare('PRAGMA table_info(products)').all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('reorder_level')) {
    database.exec(
      'ALTER TABLE products ADD COLUMN reorder_level REAL NOT NULL DEFAULT 5'
    );
  }
}

function initDatabase(electronApp) {
  const userData = electronApp.getPath('userData');
  const dbPath = path.join(userData, 'supermarket.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  migrateProductsTable(db);
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

module.exports = { initDatabase, getDb };
