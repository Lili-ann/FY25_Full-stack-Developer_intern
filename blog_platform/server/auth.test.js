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
