const path = require('node:path')
const Database = require('better-sqlite3')

const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'blog.db')
const db = new Database(databasePath)

db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    description TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

`)

db.exec('DROP TABLE IF EXISTS sessions')

const postColumns = db.prepare('PRAGMA table_info(posts)').all()
if (!postColumns.some((column) => column.name === 'created_by')) {
  db.exec(`
    ALTER TABLE posts
    ADD COLUMN created_by INTEGER REFERENCES users (id) ON DELETE SET NULL
  `)
}

const seedPosts = [
  {
    title: 'Finding Your Focus',
    subtitle: '2023-06-15',
    description:
      'A few simple ways to make room for deeper work and bring a little more intention to your day.',
    content: [
      'Focus can feel hard to find when every notification and new task asks for our attention. Instead of trying to do everything at once, choose one thing that matters and give it your full attention.',
      'A short pause, a clear workspace, and a small, realistic plan can make it easier to begin. Progress does not have to be dramatic; a little uninterrupted time can be enough to build momentum.',
    ],
  },
  {
    title: 'The Beauty of Small Moments',
    subtitle: '2023-06-10',
    description:
      'A reminder to slow down, notice the everyday details, and find inspiration in the world around you.',
    content: [
      'Some of the moments we remember most are also the quietest: warm light across a room, a familiar song, or a conversation that makes us laugh. They are easy to miss when we are already thinking about what comes next.',
      'Taking a moment to notice what is around us can make an ordinary day feel a little richer. Inspiration is not always somewhere far away; sometimes it is already here.',
    ],
  },
]

const postCount = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count
const initialPostsSeeded = db
  .prepare("SELECT value FROM app_settings WHERE key = 'initial_posts_seeded'")
  .get()

if (!initialPostsSeeded && postCount === 0) {
  const insertPost = db.prepare(`
    INSERT INTO posts (title, subtitle, description, content)
    VALUES (@title, @subtitle, @description, @content)
  `)
  const seedInitialPosts = db.transaction(() => {
    for (const post of seedPosts) {
      insertPost.run({ ...post, content: JSON.stringify(post.content) })
    }
    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('initial_posts_seeded', 'true')",
    ).run()
  })
  seedInitialPosts()
} else if (!initialPostsSeeded) {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('initial_posts_seeded', 'true')",
  ).run()
}

module.exports = db