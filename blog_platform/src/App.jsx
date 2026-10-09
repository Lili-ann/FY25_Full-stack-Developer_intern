import { useState } from 'react'
import './App.css'

const posts = [
  {
    id: 'finding-your-focus',
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
    id: 'small-moments',
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

function AuthPage() {
  const [mode, setMode] = useState('login')
  const isRegistering = mode === 'register'

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="auth-home-link" href="/">
          ← Back to blog
        </a>
        <p className="auth-eyebrow">A place for thoughtful stories</p>
        <h1 id="auth-title">{isRegistering ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-intro">
          {isRegistering
            ? 'Join the community and make yourself at home.'
            : 'Sign in to continue to your account.'}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            className={`auth-tab${!isRegistering ? ' active' : ''}`}
            id="login-tab"
            type="button"
            role="tab"
            aria-selected={!isRegistering}
            aria-controls="auth-form"
            onClick={() => setMode('login')}
          >
            Log in
          </button>
          <button
            className={`auth-tab${isRegistering ? ' active' : ''}`}
            id="register-tab"
            type="button"
            role="tab"
            aria-selected={isRegistering}
            aria-controls="auth-form"
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        <form
          id="auth-form"
          className="auth-form"
          role="tabpanel"
          aria-labelledby={isRegistering ? 'register-tab' : 'login-tab'}
          onSubmit={(event) => event.preventDefault()}
        >
          {isRegistering && (
            <label>
              Name
              <input
                autoComplete="name"
                name="name"
                placeholder="Your name"
                required
                type="text"
              />
            </label>
          )}
          <label>
            Email
            <input
              autoComplete="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </label>
          <label>
            Password
            <input
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              name="password"
              placeholder="Enter your password"
              required
              type="password"
            />
          </label>
          <button className="auth-submit" type="button">
            {isRegistering ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="auth-note">Demo screen only — account access is not enabled.</p>
      </section>
    </main>
  )
}

function App() {
  const [blogPosts, setBlogPosts] = useState(posts)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newPost, setNewPost] = useState(null)
  const [commentText, setCommentText] = useState('')
  const [comments, setComments] = useState([])
  const postId = new URLSearchParams(window.location.search).get('post')
  const authMode = new URLSearchParams(window.location.search).get('auth')
  const selectedPost = blogPosts.find((post) => post.id === postId)

  function startCreating() {
    setNewPost({
      title: '',
      subtitle: new Date().toISOString().slice(0, 10),
      description: '',
      content: [],
    })
    setCreating(true)
  }

  function createPost(event) {
    event.preventDefault()
    const slug =
      newPost.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'new-post'

    setBlogPosts((currentPosts) => [
      ...currentPosts,
      { ...newPost, id: `${slug}-${Date.now()}` },
    ])
    setCreating(false)
    setNewPost(null)
  }

  function startEditing() {
    setDraft({ ...selectedPost, content: [...selectedPost.content] })
    setEditing(true)
  }

  function savePost(event) {
    event.preventDefault()
    setBlogPosts((currentPosts) =>
      currentPosts.map((post) => (post.id === postId ? draft : post)),
    )
    setEditing(false)
    setDraft(null)
  }

  function deletePost() {
    if (!window.confirm(`Delete "${selectedPost.title}"? This cannot be undone.`)) {
      return
    }

    setBlogPosts((currentPosts) =>
      currentPosts.filter((post) => post.id !== postId),
    )
    const url = new URL(window.location.href)
    url.searchParams.delete('post')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function submitComment(event) {
    event.preventDefault()
    const content = commentText.trim()
    if (!content) return

    setComments((currentComments) => [
      ...currentComments,
      { id: `${Date.now()}-${currentComments.length}`, content },
    ])
    setCommentText('')
  }

  if (authMode) {
    return <AuthPage />
  }

  if (postId) {
    return (
      <main className="blog-home post-detail">
        <a className="back-link" href="/">
          ← All posts
        </a>
        {selectedPost ? (
            editing ? (
              <form className="post-editor" onSubmit={savePost}>
                <label>
                  Title
                  <input
                    required
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={draft.subtitle}
                    onChange={(event) =>
                      setDraft({ ...draft, subtitle: event.target.value })
                    }
                  />
                </label>
                <label>
                  Description
                  <textarea
                    required
                    rows="3"
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </label>
                <label>
                  Blog content
                  <textarea
                    required
                    rows="10"
                    value={draft.content.join('\n\n')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        content: event.target.value
                          .split(/\n\s*\n/)
                          .filter((paragraph) => paragraph.trim()),
                      })
                    }
                  />
                </label>
                <div className="editor-actions">
                  <button className="action-button" type="submit">
                    Save
                  </button>
                  <button
                    className="action-button secondary"
                    type="button"
                    onClick={() => {
                      setEditing(false)
                      setDraft(null)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <article>
                <div className="article-actions">
                  <button
                    className="action-button"
                    type="button"
                    onClick={startEditing}
                  >
                    Edit
                  </button>
                  <button
                    className="action-button danger"
                    type="button"
                    onClick={deletePost}
                  >
                    Delete
                  </button>
                </div>
                <header className="detail-header">
                  <p className="post-subtitle">{selectedPost.subtitle}</p>
                  <h1>{selectedPost.title}</h1>
                  <p className="detail-description">{selectedPost.description}</p>
                </header>
                <div className="article-body">
                  {selectedPost.content.map((paragraph, index) => (
                    <p key={`${selectedPost.id}-${index}`}>{paragraph}</p>
                  ))}
                </div>

                <section className="comments-section">
                  <h2>Comments</h2>
                  {comments.length === 0 ? (
                    <p className="no-comments">
                      No comments yet. Be the first to share your thoughts!
                    </p>
                  ) : (
                    <ul className="comment-list">
                      {comments.map((comment) => (
                        <li className="comment-item" key={comment.id}>
                          {comment.content}
                        </li>
                      ))}
                    </ul>
                  )}

                  <form className="comment-form" onSubmit={submitComment}>
                    <label className="visually-hidden" htmlFor="comment-content">
                      Comment
                    </label>
                    <textarea
                      id="comment-content"
                      required
                      rows="4"
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder="Write a comment..."
                    />
                    <button className="action-button" type="submit">
                      Post comment
                    </button>
                  </form>
                </section>
              </article>
            )
          ) : (
            <h1 className="not-found">Post not found</h1>
        )}
      </main>
    )
  }

  return (
    <main className="blog-home">
      <header className="page-header">
        <h1>blog</h1>
      </header>

      <div className="create-post-actions">
        <a className="account-link" href="/?auth=login">
          Log in / Register
        </a>
        <button
          className="action-button"
          type="button"
          onClick={startCreating}
          disabled={creating}
        >
          Create new blog
        </button>
      </div>

      {creating && (
        <form className="post-editor create-post-editor" onSubmit={createPost}>
          <label>
            Title
            <input
              required
              value={newPost.title}
              onChange={(event) =>
                setNewPost({ ...newPost, title: event.target.value })
              }
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={newPost.subtitle}
              onChange={(event) =>
                setNewPost({ ...newPost, subtitle: event.target.value })
              }
            />
          </label>
          <label>
            Description
            <textarea
              required
              rows="3"
              value={newPost.description}
              onChange={(event) =>
                setNewPost({ ...newPost, description: event.target.value })
              }
            />
          </label>
          <label>
            Blog content
            <textarea
              required
              rows="10"
              value={newPost.content.join('\n\n')}
              onChange={(event) =>
                setNewPost({
                  ...newPost,
                  content: event.target.value
                    .split(/\n\s*\n/)
                    .filter((paragraph) => paragraph.trim()),
                })
              }
            />
          </label>
          <div className="editor-actions">
            <button className="action-button" type="submit">
              Create post
            </button>
            <button
              className="action-button secondary"
              type="button"
              onClick={() => {
                setCreating(false)
                setNewPost(null)
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="post-list" aria-label="Latest blog posts">
        {blogPosts.map((post, index) => (
          <article className="post" id={post.id} key={post.id}>
            <span className="post-number" aria-hidden="true">
              0{index + 1}
            </span>
            <div className="post-content">

              <h2>{post.title}</h2>

              <p className="post-subtitle" style={{ fontStyle: 'italic'}} >{post.subtitle}</p>
              <p>{post.description}</p>

              <a className="read-more"style={{ textDecoration: 'underline', color:'blue'}} href={`/?post=${post.id}`}>
                Read more <span aria-hidden="true"></span>
              </a>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

export default App
