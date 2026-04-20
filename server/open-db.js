const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function migrateProductsTable(database) {
  const cols = database.prepare('PRAGMA table_info(products)').all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('reorder_level')) {
    database.exec(
      'ALTER TABLE products ADD COLUMN reorder_level REAL NOT NULL DEFAULT 5'
    );
  }
}

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schemaPath = path.join(__dirname, '..', 'src', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  migrateProductsTable(db);
  return db;
}

function createGetDb(dbPath) {
  let db;
  return () => {
    if (!db) db = openDatabase(dbPath);
    return db;
  };
}

module.exports = { openDatabase, createGetDb };
