const { randomBytes } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const bcrypt = require('bcryptjs')
const express = require('express')
const jwt = require('jsonwebtoken')
const db = require('./db')

const app = express()
const tokenLifetime = '1h'

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    if (Buffer.byteLength(process.env.JWT_SECRET) < 32) {
      throw new Error('JWT_SECRET must contain at least 32 bytes.')
    }
    return process.env.JWT_SECRET
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production.')
  }

  const secretPath = path.join(__dirname, '.jwt-secret')
  try {
    const storedSecret = fs.readFileSync(secretPath, 'utf8').trim()
    if (Buffer.byteLength(storedSecret) < 32) {
      throw new Error('The local JWT secret must contain at least 32 bytes.')
    }
    return storedSecret
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const generatedSecret = randomBytes(48).toString('hex')
  try {
    fs.writeFileSync(secretPath, generatedSecret, { flag: 'wx', mode: 0o600 })
    console.warn('Generated a local JWT signing secret in server/.jwt-secret.')
    return generatedSecret
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return fs.readFileSync(secretPath, 'utf8').trim()
  }
}

const jwtSecret = getJwtSecret()

app.use(express.json({ limit: '128kb' }))

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
})

function createToken(user) {
  return jwt.sign({ sub: String(user.id) }, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: tokenLifetime,
  })
}

function requireAuth(request, response, next) {
  const authorization = request.get('authorization')
  const [scheme, token, extra] = authorization?.split(' ') ?? []
  if (scheme !== 'Bearer' || !token || extra) {
    return response.status(401).json({ error: 'Authentication is required.' })
  }

  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
    if (
      typeof payload !== 'object' ||
      typeof payload.sub !== 'string' ||
      !/^[1-9]\d*$/.test(payload.sub)
    ) {
      return response.status(401).json({ error: 'Authentication token is invalid.' })
    }

    const user = db
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(Number(payload.sub))
    if (!user) {
      return response.status(401).json({ error: 'Authentication token is invalid.' })
    }
    request.authUser = user
    return next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return response.status(401).json({ error: 'Authentication token is invalid or expired.' })
    }
    return next(error)
  }
}

function serializePost(post) {
  return { ...post, id: String(post.id), content: JSON.parse(post.content) }
}

const selectPostById = db.prepare(`
  SELECT posts.id, posts.title, posts.subtitle, posts.description, posts.content,
         posts.user_id, posts.created_at, users.name AS author_name,
         (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) AS like_count,
         EXISTS (
           SELECT 1 FROM post_likes
           WHERE post_likes.post_id = posts.id AND post_likes.user_id = ?
         ) AS liked_by_user
  FROM posts
  LEFT JOIN users ON users.id = posts.user_id
  WHERE posts.id = ?
`)

function parsePostId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function validatePost(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const subtitle = typeof body?.subtitle === 'string' ? body.subtitle.trim() : ''
  const description =
    typeof body?.description === 'string' ? body.description.trim() : ''
  const content = Array.isArray(body?.content)
    ? body.content.map((paragraph) =>
        typeof paragraph === 'string' ? paragraph.trim() : '',
      )
    : []

  if (!title || title.length > 200) {
    return { error: 'Title is required and must be 200 characters or fewer.' }
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(subtitle) ||
    Number.isNaN(Date.parse(`${subtitle}T00:00:00Z`)) ||
    new Date(`${subtitle}T00:00:00Z`).toISOString().slice(0, 10) !== subtitle
  ) {
    return { error: 'Enter a valid post date.' }
  }
  if (!description || description.length > 2000) {
    return { error: 'Description is required and must be 2,000 characters or fewer.' }
  }
  if (
    content.length === 0 ||
    content.some((paragraph) => !paragraph || paragraph.length > 20000) ||
    content.join('').length > 100000
  ) {
    return { error: 'Add blog content with non-empty paragraphs under 20,000 characters each.' }
  }

  return { data: { title, subtitle, description, content: JSON.stringify(content) } }
}

app.post('/api/auth/register', async (request, response, next) => {
  const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
  const email =
    typeof request.body?.email === 'string'
      ? request.body.email.trim().toLowerCase()
      : ''
  const password =
    typeof request.body?.password === 'string' ? request.body.password : ''

  if (!name || name.length > 80) {
    return response.status(400).json({ error: 'Name is required and must be 80 characters or fewer.' })
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Enter a valid email address.' })
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return response.status(400).json({ error: 'Password must be at least 8 characters and no more than 72 bytes.' })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const result = db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name, email, passwordHash)
    const user = db
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(result.lastInsertRowid)
    return response.status(201).json({ user, token: createToken(user) })
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return response.status(409).json({ error: 'An account with this email already exists.' })
    }
    return next(error)
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  const email =
    typeof request.body?.email === 'string'
      ? request.body.email.trim().toLowerCase()
      : ''
  const password =
    typeof request.body?.password === 'string' ? request.body.password : ''
  if (!email || !password) {
    return response.status(400).json({ error: 'Email and password are required.' })
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return response.status(400).json({ error: 'Password must be no more than 72 bytes.' })
  }

  try {
    const user = db
      .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
      .get(email)
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return response.status(401).json({ error: 'Email or password is incorrect.' })
    }
    return response.json({ user: publicUser(user), token: createToken(user) })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/auth/me', requireAuth, (request, response) => {
  return response.json({ user: publicUser(request.authUser) })
})

app.get('/api/posts', requireAuth, (request, response) => {
  const posts = db
    .prepare(`
      SELECT posts.id, posts.title, posts.subtitle, posts.description, posts.content,
             posts.user_id, posts.created_at, users.name AS author_name,
             (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) AS like_count,
             EXISTS (
               SELECT 1 FROM post_likes
               WHERE post_likes.post_id = posts.id AND post_likes.user_id = @user_id
             ) AS liked_by_user
      FROM posts
      LEFT JOIN users ON users.id = posts.user_id
      ORDER BY posts.id
    `)
    .all({ user_id: request.authUser.id })
    .map(serializePost)
  return response.json({ posts })
})

app.get('/api/posts/:postId', requireAuth, (request, response) => {
  const id = parsePostId(request.params.postId)
  if (!id) return response.status(400).json({ error: 'Post ID is invalid.' })

  const post = selectPostById.get(request.authUser.id, id)
  if (!post) return response.status(404).json({ error: 'Post not found.' })
  return response.json({ post: serializePost(post) })
})

app.post('/api/posts/:postId/like', requireAuth, (request, response) => {
  const id = parsePostId(request.params.postId)
  if (!id) return response.status(400).json({ error: 'Post ID is invalid.' })
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) {
    return response.status(404).json({ error: 'Post not found.' })
  }

  db.prepare('INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)')
    .run(id, request.authUser.id)
  const likeCount = db
    .prepare('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?')
    .get(id).count
  return response.json({ liked: true, like_count: likeCount })
})

app.delete('/api/posts/:postId/like', requireAuth, (request, response) => {
  const id = parsePostId(request.params.postId)
  if (!id) return response.status(400).json({ error: 'Post ID is invalid.' })
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) {
    return response.status(404).json({ error: 'Post not found.' })
  }

  db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')
    .run(id, request.authUser.id)
  const likeCount = db
    .prepare('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?')
    .get(id).count
  return response.json({ liked: false, like_count: likeCount })
})

app.post('/api/posts', requireAuth, (request, response) => {
  const result = validatePost(request.body)
  if (result.error) return response.status(400).json({ error: result.error })

  const insert = db.prepare(`
    INSERT INTO posts (title, subtitle, description, content, user_id)
    VALUES (@title, @subtitle, @description, @content, @user_id)
  `)
  const created = insert.run({
    ...result.data,
    user_id: request.authUser.id,
  })
  const post = selectPostById.get(request.authUser.id, created.lastInsertRowid)
  return response.status(201).json({ post: serializePost(post) })
})

app.put('/api/posts/:postId', requireAuth, (request, response) => {
  const id = parsePostId(request.params.postId)
  if (!id) return response.status(400).json({ error: 'Post ID is invalid.' })

  const existingPost = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id)
  if (!existingPost) return response.status(404).json({ error: 'Post not found.' })
  if (existingPost.user_id !== request.authUser.id) {
    return response.status(403).json({ error: 'Only the post author can edit this post.' })
  }

  const result = validatePost(request.body)
  if (result.error) return response.status(400).json({ error: result.error })

  const update = db.prepare(`
    UPDATE posts
    SET title = @title, subtitle = @subtitle, description = @description, content = @content
    WHERE id = @id AND user_id = @user_id
  `)
  const updated = update.run({ ...result.data, id, user_id: request.authUser.id })
  if (updated.changes === 0) return response.status(404).json({ error: 'Post not found.' })

  const post = selectPostById.get(request.authUser.id, id)
  return response.json({ post: serializePost(post) })
})

app.delete('/api/posts/:postId', requireAuth, (request, response) => {
  const id = parsePostId(request.params.postId)
  if (!id) return response.status(400).json({ error: 'Post ID is invalid.' })

  const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id)
  if (!post) return response.status(404).json({ error: 'Post not found.' })
  if (post.user_id !== request.authUser.id) {
    return response.status(403).json({ error: 'Only the post author can delete this post.' })
  }

  const deleted = db
    .prepare('DELETE FROM posts WHERE id = ? AND user_id = ?')
    .run(id, request.authUser.id)
  if (deleted.changes === 0) return response.status(404).json({ error: 'Post not found.' })
  return response.status(204).end()
})

function serializeComment(comment) {
  return {
    ...comment,
    id: String(comment.id),
    post_id: String(comment.post_id),
    user_id: Number(comment.user_id),
  }
}

function validateComment(body) {
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content || content.length > 5000) {
    return { error: 'Comment is required and must be 5,000 characters or fewer.' }
  }
  return { content }
}

const selectCommentsByPost = db.prepare(`
  SELECT comments.id, comments.post_id, comments.user_id, comments.content,
         comments.created_at, users.name AS author_name
  FROM comments
  JOIN users ON users.id = comments.user_id
  WHERE comments.post_id = ?
  ORDER BY comments.created_at, comments.id
`)

function canManageComment(commentId, postId, userId) {
  const comment = db.prepare(`
    SELECT comments.user_id, posts.user_id AS post_user_id
    FROM comments
    JOIN posts ON posts.id = comments.post_id
    WHERE comments.id = ? AND comments.post_id = ?
  `).get(commentId, postId)

  if (!comment) return { exists: false, allowed: false }
  return {
    exists: true,
    canEdit: comment.user_id === userId || comment.post_user_id === userId,
    canDelete: comment.post_user_id === userId,
  }
}

app.get('/api/posts/:postId/comments', requireAuth, (request, response) => {
  const postId = parsePostId(request.params.postId)
  if (!postId) return response.status(400).json({ error: 'Post ID is invalid.' })
  if (!selectPostById.get(request.authUser.id, postId)) {
    return response.status(404).json({ error: 'Post not found.' })
  }

  const comments = selectCommentsByPost.all(postId).map(serializeComment)
  return response.json({ comments })
})

app.post('/api/posts/:postId/comments', requireAuth, (request, response) => {
  const postId = parsePostId(request.params.postId)
  if (!postId) return response.status(400).json({ error: 'Post ID is invalid.' })
  if (!selectPostById.get(request.authUser.id, postId)) {
    return response.status(404).json({ error: 'Post not found.' })
  }

  const result = validateComment(request.body)
  if (result.error) return response.status(400).json({ error: result.error })

  const created = db
    .prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)')
    .run(postId, request.authUser.id, result.content)
  const comment = db
    .prepare(`
      SELECT comments.id, comments.post_id, comments.user_id, comments.content,
             comments.created_at, users.name AS author_name
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.id = ?
    `)
    .get(created.lastInsertRowid)
  return response.status(201).json({ comment: serializeComment(comment) })
})

app.put('/api/posts/:postId/comments/:commentId', requireAuth, (request, response) => {
  const postId = parsePostId(request.params.postId)
  const commentId = parsePostId(request.params.commentId)
  if (!postId || !commentId) {
    return response.status(400).json({ error: 'Post or comment ID is invalid.' })
  }

  const result = validateComment(request.body)
  if (result.error) return response.status(400).json({ error: result.error })

  const updated = db.prepare(`
    UPDATE comments
    SET content = ?
    WHERE id = ? AND post_id = ?
      AND (
        user_id = ? OR EXISTS (
          SELECT 1 FROM posts
          WHERE posts.id = comments.post_id AND posts.user_id = ?
        )
      )
  `).run(result.content, commentId, postId, request.authUser.id, request.authUser.id)
  if (updated.changes === 0) {
    const permission = canManageComment(commentId, postId, request.authUser.id)
    if (!permission.exists) return response.status(404).json({ error: 'Comment not found.' })
    return response.status(403).json({ error: 'You can only edit your own comments or comments on your post.' })
  }

  const comment = db
    .prepare(`
      SELECT comments.id, comments.post_id, comments.user_id, comments.content,
             comments.created_at, users.name AS author_name
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.id = ?
    `)
    .get(commentId)
  return response.json({ comment: serializeComment(comment) })
})

app.delete('/api/posts/:postId/comments/:commentId', requireAuth, (request, response) => {
  const postId = parsePostId(request.params.postId)
  const commentId = parsePostId(request.params.commentId)
  if (!postId || !commentId) {
    return response.status(400).json({ error: 'Post or comment ID is invalid.' })
  }

  const deleted = db.prepare(`
    DELETE FROM comments
    WHERE id = ? AND post_id = ?
      AND EXISTS (
        SELECT 1 FROM posts
        WHERE posts.id = comments.post_id AND posts.user_id = ?
      )
  `).run(commentId, postId, request.authUser.id)
  if (deleted.changes === 0) {
    const permission = canManageComment(commentId, postId, request.authUser.id)
    if (!permission.exists) return response.status(404).json({ error: 'Comment not found.' })
    return response.status(403).json({ error: 'Only the post author can delete comments.' })
  }
  return response.status(204).end()
})

app.use((error, request, response, next) => {
  console.error(error)
  if (response.headersSent) return next(error)
  const status = Number.isInteger(error.status) ? error.status : 500
  return response.status(status).json({
    error: status >= 500 ? 'An unexpected server error occurred.' : error.message,
  })
})

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001
  const server = app.listen(port, () => {
    console.log(`Blog authentication API listening on http://localhost:${port}`)
  })

  function close() {
    server.close(() => db.close())
  }

  process.on('SIGINT', close)
  process.on('SIGTERM', close)
}

module.exports = { app, db }
