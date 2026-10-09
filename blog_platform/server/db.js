const path = require('node:path')
const Database = require('better-sqlite3')

const databasePath = path.join(__dirname, 'blog.db')
const db = new Database(databasePath)

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    description TEXT NOT NULL,
    content TEXT NOT NULL,
    comments TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

const postColumns = db.prepare('PRAGMA table_info(posts)').all()
if (!postColumns.some((column) => column.name === 'comments')) {
  db.exec("ALTER TABLE posts ADD COLUMN comments TEXT NOT NULL DEFAULT ''")
}

module.exports = db