const path = require('node:path')
const Database = require('better-sqlite3')
const { parsePostContent } = require('./post-content')

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
    user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
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

  CREATE TABLE IF NOT EXISTS post_likes (
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

`)

db.exec('DROP TABLE IF EXISTS sessions')

let postColumnNames = db.prepare('PRAGMA table_info(posts)').all().map((column) => column.name)
if (postColumnNames.includes('created_by') && !postColumnNames.includes('user_id')) {
  db.exec('ALTER TABLE posts RENAME COLUMN created_by TO user_id')
  postColumnNames = postColumnNames.map((column) =>
    column === 'created_by' ? 'user_id' : column,
  )
}
if (!postColumnNames.includes('user_id')) {
  db.exec(`
    ALTER TABLE posts
    ADD COLUMN user_id INTEGER REFERENCES users (id) ON DELETE SET NULL
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

const sampleIdeaPosts = [
  {
    title: 'Build Motivation That Lasts',
    subtitle: '2026-10-10',
    description:
      'Practical ways to stay consistent with your goals, even when motivation comes and goes.',
    content: [
      'Motivation can help you get started, but it is not always there every day. Make your goal easier to act on by breaking it into a small task you can complete in fifteen minutes. A short walk, one page of reading, or one focused work session is enough to keep the promise you made to yourself.',
      'Choose a regular time, track the days you show up, and make it easy to begin. When you miss a day, restart with the next small step instead of waiting for a perfect Monday. Consistency grows when progress feels manageable.',
    ],
  },
  {
    title: 'Turn Your Skills Into Extra Income',
    subtitle: '2026-10-10',
    description:
      'A grounded starting point for exploring side income using skills and resources you already have.',
    content: [
      'Start by listing things you can already do that solve a real problem: tutoring, writing, design, organizing, repairing, or helping a local business with its online presence. Ask a few people what they need before spending money on tools, courses, or inventory.',
      'Try one small paid project, agree on the work and price clearly, and learn from the experience. Extra income takes effort and is never guaranteed, but testing a simple service can help you discover whether people value what you offer.',
    ],
  },
  {
    title: 'Make Success a System',
    subtitle: '2026-10-10',
    description:
      'Replace vague ambitions with repeatable habits, useful feedback, and milestones you can actually measure.',
    content: [
      'Success means different things to different people, so begin by defining what matters to you. Turn that definition into a measurable milestone, then identify the regular actions most likely to move you toward it.',
      'Review your progress once a week. Keep what is working, adjust what is not, and ask for feedback when you feel stuck. Big achievements often come from ordinary actions repeated over time, not from one shortcut or sudden breakthrough.',
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

const sampleIdeasSeeded = db
  .prepare("SELECT value FROM app_settings WHERE key = 'sample_idea_posts_seeded'")
  .get()

if (!sampleIdeasSeeded) {
  const insertSampleIdeas = db.prepare(`
    INSERT INTO posts (title, subtitle, description, content)
    VALUES (@title, @subtitle, @description, @content)
  `)
  const seedSampleIdeas = db.transaction(() => {
    for (const post of sampleIdeaPosts) {
      insertSampleIdeas.run({ ...post, content: JSON.stringify(post.content) })
    }
    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('sample_idea_posts_seeded', 'true')",
    ).run()
  })
  seedSampleIdeas()
}

const storedPosts = db.prepare('SELECT id, content FROM posts').all()
const updatePostContent = db.prepare('UPDATE posts SET content = ? WHERE id = ?')
const migratePostContent = db.transaction(() => {
  for (const post of storedPosts) {
    const normalizedContent = JSON.stringify(parsePostContent(post.content, post.id))
    if (normalizedContent !== post.content) {
      updatePostContent.run(normalizedContent, post.id)
    }
  }
})
migratePostContent()

module.exports = db