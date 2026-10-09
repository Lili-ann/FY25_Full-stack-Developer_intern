const assert = require('node:assert/strict')
const { after, test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const jwt = require('jsonwebtoken')

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-auth-test-'))
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'auth-test.db')
process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-testing'

const { app, db } = require('./index')
const server = app.listen(0)
const serverListening = new Promise((resolve, reject) => {
  server.once('listening', resolve)
  server.once('error', reject)
})

after(async () => {
  if (server.listening) {
    server.closeAllConnections()
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  db.close()
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

test('registers and logs in accounts with JWT-protected identity endpoint', async () => {
  await serverListening
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  async function request(route, options = {}, token) {
    const headers = { ...options.headers }
    if (token) headers.authorization = `Bearer ${token}`
    const response = await fetch(`${baseUrl}${route}`, { ...options, headers })
    const body = response.status === 204 ? null : await response.json()
    return { response, body }
  }

  const unauthenticated = await request('/api/auth/me')
  assert.equal(unauthenticated.response.status, 401)

  const registration = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      password: 'correct horse battery staple',
    }),
  })

  assert.equal(registration.response.status, 201)
  assert.deepEqual(registration.body.user, {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
  })
  assert.equal(typeof registration.body.token, 'string')
  assert.equal(jwt.decode(registration.body.token).sub, '1')
  assert.match(
    db.prepare('SELECT password_hash FROM users WHERE id = 1').get().password_hash,
    /^\$2[ab]\$/,
  )

  const authenticatedUser = await request(
    '/api/auth/me',
    {},
    registration.body.token,
  )
  assert.equal(authenticatedUser.response.status, 200)
  assert.equal(authenticatedUser.body.user.email, 'test@example.com')

  const unauthenticatedPosts = await request('/api/posts')
  assert.equal(unauthenticatedPosts.response.status, 401)

  const initialPosts = await request('/api/posts', {}, registration.body.token)
  assert.equal(initialPosts.response.status, 200)
  assert.equal(initialPosts.body.posts.length, 2)
  assert.deepEqual(initialPosts.body.posts[0].content, [
    'Focus can feel hard to find when every notification and new task asks for our attention. Instead of trying to do everything at once, choose one thing that matters and give it your full attention.',
    'A short pause, a clear workspace, and a small, realistic plan can make it easier to begin. Progress does not have to be dramatic; a little uninterrupted time can be enough to build momentum.',
  ])

  const postInput = {
    title: 'API Test Post',
    subtitle: '2026-10-09',
    description: 'Testing database-backed blog post creation.',
    content: ['First paragraph.', 'Second paragraph.'],
  }
  const createdPost = await request('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(postInput),
  }, registration.body.token)
  assert.equal(createdPost.response.status, 201)
  assert.equal(createdPost.body.post.title, postInput.title)
  assert.deepEqual(createdPost.body.post.content, postInput.content)
  assert.equal(createdPost.body.post.created_by, registration.body.user.id)

  const createdPostId = createdPost.body.post.id
  const fetchedPost = await request(
    `/api/posts/${createdPostId}`,
    {},
    registration.body.token,
  )
  assert.equal(fetchedPost.response.status, 200)
  assert.equal(fetchedPost.body.post.id, createdPostId)

  const updatedInput = {
    ...postInput,
    title: 'Updated API Test Post',
    content: ['Updated content.'],
  }
  const updatedPost = await request(`/api/posts/${createdPostId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(updatedInput),
  }, registration.body.token)
  assert.equal(updatedPost.response.status, 200)
  assert.equal(updatedPost.body.post.title, updatedInput.title)
  assert.deepEqual(updatedPost.body.post.content, updatedInput.content)

  const invalidPost = await request('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...postInput, subtitle: 'not-a-date' }),
  }, registration.body.token)
  assert.equal(invalidPost.response.status, 400)

  const deletedPost = await request(`/api/posts/${createdPostId}`, {
    method: 'DELETE',
  }, registration.body.token)
  assert.equal(deletedPost.response.status, 204)
  const missingPost = await request(
    `/api/posts/${createdPostId}`,
    {},
    registration.body.token,
  )
  assert.equal(missingPost.response.status, 404)

  const invalidToken = await request('/api/auth/me', {}, 'invalid.token.value')
  assert.equal(invalidToken.response.status, 401)

  const duplicateRegistration = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test User',
      email: 'TEST@example.com',
      password: 'correct horse battery staple',
    }),
  })
  assert.equal(duplicateRegistration.response.status, 409)

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'TEST@example.com',
      password: 'correct horse battery staple',
    }),
  })
  assert.equal(login.response.status, 200)
  assert.equal(login.body.user.email, 'test@example.com')
  assert.equal(
    (await request('/api/auth/me', {}, login.body.token)).response.status,
    200,
  )

  const invalidLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'wrong password',
    }),
  })
  assert.equal(invalidLogin.response.status, 401)

  const decodedToken = jwt.decode(login.body.token)
  assert.ok(decodedToken.exp > Math.floor(Date.now() / 1000))
  assert.equal((await request('/api/auth/me', {}, login.body.token)).response.status, 200)
})
