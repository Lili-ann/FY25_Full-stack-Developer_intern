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

app.use(express.json({ limit: '10kb' }))

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
