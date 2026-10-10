# Blog Cloud

Blog Cloud is a responsive blog application built with React and Vite on the
frontend and an Express API backed by SQLite. Users can register and sign in,
publish and manage their own posts, comment on posts, like posts, and upload a
profile image.

## Requirements

- Node.js and npm
- A modern browser

## Run locally

Install dependencies in both the frontend project and the backend:

```powershell
# From the project root
npm install

# Install the API dependencies
Set-Location server
npm install
```

Start the API and frontend in separate terminals. From the project root, start
the backend:

```powershell
Set-Location server
npm run dev
```

In a second terminal, start the Vite development server:

```powershell
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). Vite
proxies `/api` requests to the API at `http://localhost:3001`.

The backend creates `server/blog.db` and the required tables automatically.
For local development, it creates and stores a JWT signing secret in
`server/.jwt-secret` the first time it starts. Both files are ignored by Git.
For production, set `JWT_SECRET` to a secret of at least 32 bytes before
starting the backend; the server does not generate a production secret.

To use a different SQLite database, set `DATABASE_PATH` before starting the
backend. The API port can be changed with `PORT` (default `3001`).

## Useful commands

Run from the project root:

```powershell
npm run dev
npm run lint
npm run build
npm run preview
```

Run backend tests from `server`:

```powershell
npm test
```

## Project structure

```text
blog_platform/
├── src/
│   ├── App.jsx          # React views, authentication, posts, comments, likes
│   ├── App.css          # Responsive application styles
│   ├── index.css        # Global styles
│   └── main.jsx         # React application entry point
├── server/
│   ├── index.js         # Express API, JWT authentication and authorization
│   ├── db.js            # SQLite schema, migrations and sample post seeds
│   ├── post-content.js  # Legacy post content parsing and migration support
│   ├── auth.test.js     # API integration tests
│   └── post-content.test.js
├── index.html
├── vite.config.js       # Development server and /api proxy
└── package.json         # Frontend scripts and dependencies
```

## Backend API

All API routes are under `/api`. Except for registration and login, every
endpoint requires a valid JWT in the request header:

```http
Authorization: Bearer <token>
```

Registration and login return the token. The frontend stores it in
`sessionStorage` and sends it on authenticated API requests. Tokens are signed
with HS256 and expire after one hour.

Successful responses use JSON unless the endpoint returns `204 No Content`.
Errors use a JSON object with an `error` message. Common status codes include
`400` for invalid input, `401` for missing or invalid authentication, `403`
for a forbidden operation, and `404` for a missing post or comment.

### Authentication and profile

| Method | Endpoint | Auth | Purpose |
|---|---|---:|---|
| `POST` | `/api/auth/register` | No | Create an account; returns `{ user, token }`. |
| `POST` | `/api/auth/login` | No | Sign in; returns `{ user, token }`. |
| `GET` | `/api/auth/me` | Yes | Return the current user's profile. |
| `PUT` | `/api/auth/profile-image` | Yes | Save the current user's profile image. |

Registration expects `name`, `email`, and `password`. Names are limited to 80
characters; passwords must be at least 8 characters and no more than 72 UTF-8
bytes. Passwords are hashed with bcrypt before storage.

Profile image uploads expect a JSON body containing a base64 data URI:

```json
{
  "image": "data:image/png;base64,<base64-encoded-image>"
}
```

JPEG, PNG, and WebP images up to 2 MiB are accepted. The server checks the
declared format and file signature before saving the image in the user's
`profile_image` database column.

### Posts

| Method | Endpoint | Auth | Purpose |
|---|---|---:|---|
| `GET` | `/api/posts` | Yes | List posts, author names, like counts, and whether the current user liked each post. |
| `GET` | `/api/posts/:postId` | Yes | Fetch one post with current-user like state. |
| `POST` | `/api/posts` | Yes | Create a post owned by the current user. |
| `PUT` | `/api/posts/:postId` | Yes | Edit a post; only its author may edit it. |
| `DELETE` | `/api/posts/:postId` | Yes | Delete a post; only its author may delete it. |

Create and update requests use this shape:

```json
{
  "title": "A post title",
  "subtitle": "2026-10-10",
  "description": "A short summary of the post.",
  "content": ["First paragraph.", "Second paragraph."]
}
```

The `subtitle` field is a `YYYY-MM-DD` date. `content` is an array of
non-empty paragraphs.

### Likes

| Method | Endpoint | Auth | Purpose |
|---|---|---:|---|
| `POST` | `/api/posts/:postId/like` | Yes | Like a post. Returns `{ liked, like_count }`. |
| `DELETE` | `/api/posts/:postId/like` | Yes | Remove the current user's like. Returns `{ liked, like_count }`. |

Each user can have at most one like per post. Likes are stored separately from
posts and are removed automatically if the post or user is deleted.

### Comments

| Method | Endpoint | Auth | Purpose |
|---|---|---:|---|
| `GET` | `/api/posts/:postId/comments` | Yes | List a post's comments with author names and timestamps. |
| `POST` | `/api/posts/:postId/comments` | Yes | Add a comment using `{ "content": "..." }`. |
| `PUT` | `/api/posts/:postId/comments/:commentId` | Yes | Edit a comment if you wrote it or authored its post. |
| `DELETE` | `/api/posts/:postId/comments/:commentId` | Yes | Delete a comment; only the post's author may delete it. |

Comments are limited to 5,000 characters. The API enforces all ownership rules;
hiding controls in the frontend is not used as an authorization mechanism.

### Example API interaction

With the backend running, register and save the returned token:

```sh
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alex Example","email":"alex@example.com","password":"example-password-123"}'
```

Use the returned token to list posts:

```sh
curl http://localhost:3001/api/posts \
  -H "Authorization: Bearer <token>"
```

## Design decisions

- **React and Vite:** The frontend is a single-page React application. URL query
  parameters select post-detail and profile views without a separate routing
  dependency. Vite provides local development and proxies API requests.
- **Express and SQLite:** The API and database run locally with a small
  dependency footprint. SQLite creates the schema and applies compatibility
  migrations at startup. Local database files are not committed.
- **JWT authentication:** API access is stateless and uses short-lived,
  one-hour bearer tokens. Passwords are stored as bcrypt hashes. Production
  deployments must supply their own `JWT_SECRET`.
- **Ownership enforced by the API:** Post authors alone can edit or delete
  their posts. Comment authors can edit their own comments; the parent post's
  author can also edit comments and is the only user allowed to delete them.
- **Relational ownership and engagement:** Posts reference their author through
  `posts.user_id`; comments and likes reference both their post and user.
  Composite keys prevent duplicate likes.
- **Profile images stored as data URIs:** To keep local setup simple, validated
  small JPEG, PNG, or WebP images are stored in SQLite rather than requiring
  an external image service.
- **Client-side discovery:** Homepage search and five-post pagination operate
  on the loaded post list. The profile's Posts and Liked tabs filter that same
  list using its author and current-user like fields.
- **Responsive, accessible UI:** Layouts adapt at desktop, tablet, and mobile
  widths, and interactive controls provide keyboard focus states and labels.
