import { useEffect, useState } from 'react'
import './App.css'

async function requestApi(url, options = {}) {
  const token = sessionStorage.getItem('blog.jwt')
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) return null

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('The server returned an invalid response.')
  }

  if (!response.ok) {
    const error = new Error(result.error || 'The request could not be completed.')
    error.status = response.status
    throw error
  }
  return result
}

function AuthPage({ onAuthenticated, initialMode }) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isRegistering = mode === 'register'

  async function submitAuth(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const { user, token } = await requestApi(
        `/api/auth/${isRegistering ? 'register' : 'login'}`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...(isRegistering ? { name } : {}),
            email,
            password,
          }),
        },
      )
      onAuthenticated(user, token)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
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
            onClick={() => {
              setMode('login')
              setError('')
            }}
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
            onClick={() => {
              setMode('register')
              setError('')
            }}
          >
            Register
          </button>
        </div>

        <form
          id="auth-form"
          className="auth-form"
          role="tabpanel"
          aria-labelledby={isRegistering ? 'register-tab' : 'login-tab'}
          onSubmit={submitAuth}
        >
          {isRegistering && (
            <label>
              Name
              <input
                autoComplete="name"
                name="name"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              required
              type="password"
            />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting
              ? 'Please wait…'
              : isRegistering
                ? 'Create account'
                : 'Log in'}
          </button>
        </form>

        <p className="auth-note">
          Create an account or sign in to access the blog.
        </p>
      </section>
    </main>
  )
}

function AccountControls({ user, onLogout }) {
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <div className="account-controls">
      <div className="account-menu">
        <button
          className="account-profile"
          type="button"
          aria-label={`Account options for ${user.name}`}
          aria-haspopup="true"
        >
          <span className="account-avatar" aria-hidden="true">{initials}</span>
          <span className="account-name">{user.name}</span>
        </button>
        <div className="account-menu-options">
          <a className="account-menu-item" href="/?profile=1">
            View profile
          </a>
          <button
            className="account-menu-item account-logout"
            type="button"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [authStatus, setAuthStatus] = useState(() =>
    sessionStorage.getItem('blog.jwt') ? 'loading' : 'unauthenticated',
  )
  const [authUser, setAuthUser] = useState(null)
  const [authError, setAuthError] = useState('')
  const [blogPosts, setBlogPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [postsError, setPostsError] = useState('')
  const [postBusy, setPostBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newPost, setNewPost] = useState(null)
  const [commentText, setCommentText] = useState('')
  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [postSearch, setPostSearch] = useState('')
  const searchParams = new URLSearchParams(window.location.search)
  const postId = searchParams.get('post')
  const isProfilePage = searchParams.get('profile') === '1'
  const [profileTab, setProfileTab] = useState(
    searchParams.get('tab') === 'liked' ? 'liked' : 'posts',
  )
  const initialAuthMode =
    new URLSearchParams(window.location.search).get('auth') === 'register'
      ? 'register'
      : 'login'
  const selectedPost = blogPosts.find((post) => post.id === postId)
  const normalizedPostSearch = postSearch.trim().toLocaleLowerCase()
  const filteredPosts = normalizedPostSearch
    ? blogPosts.filter((post) =>
        [
          post.title,
          post.description,
          post.author_name,
          post.subtitle,
          ...post.content,
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedPostSearch),
      )
    : blogPosts

  useEffect(() => {
    let active = true
    if (!sessionStorage.getItem('blog.jwt')) return undefined

    requestApi('/api/auth/me')
      .then(({ user }) => {
        if (!active) return
        setAuthUser(user)
        setAuthStatus('authenticated')
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          sessionStorage.removeItem('blog.jwt')
          setAuthStatus('unauthenticated')
        } else {
          setAuthError(error.message)
          setAuthStatus('error')
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated') return undefined
    let active = true

    requestApi('/api/posts')
      .then(({ posts: fetchedPosts }) => {
        if (active) {
          setBlogPosts(fetchedPosts)
          setPostsError('')
        }
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          sessionStorage.removeItem('blog.jwt')
          setAuthUser(null)
          setAuthStatus('unauthenticated')
        } else {
          setPostsError(error.message)
        }
      })
      .finally(() => {
        if (active) setPostsLoading(false)
      })

    return () => {
      active = false
    }
  }, [authStatus])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !postId || postsLoading) {
      return undefined
    }
    if (!selectedPost) return undefined

    let active = true
    requestApi(`/api/posts/${postId}/comments`)
      .then(({ comments: fetchedComments }) => {
        if (active) {
          setComments(fetchedComments)
          setCommentsError('')
        }
      })
      .catch((error) => {
        if (!active) return
        setCommentsError(error.message)
        if (error.status === 401) {
          sessionStorage.removeItem('blog.jwt')
          setAuthUser(null)
          setAuthStatus('unauthenticated')
        }
      })
      .finally(() => {
        if (active) setCommentsLoading(false)
      })

    return () => {
      active = false
    }
  }, [authStatus, postId, postsLoading, selectedPost])

  function handleAuthenticated(user, token) {
    sessionStorage.setItem('blog.jwt', token)
    setAuthUser(user)
    setPostsLoading(true)
    setAuthStatus('authenticated')
    const url = new URL(window.location.href)
    url.searchParams.delete('auth')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function logout() {
    sessionStorage.removeItem('blog.jwt')
    setAuthUser(null)
    setAuthStatus('unauthenticated')
    setEditing(false)
  }

  function handlePostError(error) {
    setPostsError(error.message)
    if (error.status === 401) {
      sessionStorage.removeItem('blog.jwt')
      setAuthUser(null)
      setAuthStatus('unauthenticated')
    }
  }

  function handleCommentError(error) {
    setCommentsError(error.message)
    if (error.status === 401) {
      sessionStorage.removeItem('blog.jwt')
      setAuthUser(null)
      setAuthStatus('unauthenticated')
    }
  }

  function startCreating() {
    setNewPost({
      title: '',
      subtitle: new Date().toISOString().slice(0, 10),
      description: '',
      content: [],
    })
    setCreating(true)
  }

  async function createPost(event) {
    event.preventDefault()
    setPostBusy(true)
    setPostsError('')
    try {
      const { post } = await requestApi('/api/posts', {
        method: 'POST',
        body: JSON.stringify(newPost),
      })
      setBlogPosts((currentPosts) => [...currentPosts, post])
      setCreating(false)
      setNewPost(null)
    } catch (error) {
      handlePostError(error)
    } finally {
      setPostBusy(false)
    }
  }

  function startEditing() {
    setDraft({ ...selectedPost, content: [...selectedPost.content] })
    setEditing(true)
  }

  async function savePost(event) {
    event.preventDefault()
    setPostBusy(true)
    setPostsError('')
    try {
      const { post } = await requestApi(`/api/posts/${postId}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      })
      setBlogPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id === post.id ? post : currentPost,
        ),
      )
      setEditing(false)
      setDraft(null)
    } catch (error) {
      handlePostError(error)
    } finally {
      setPostBusy(false)
    }
  }

  async function deletePost() {
    if (!window.confirm(`Delete "${selectedPost.title}"? This cannot be undone.`)) {
      return
    }

    setPostBusy(true)
    setPostsError('')
    try {
      await requestApi(`/api/posts/${postId}`, { method: 'DELETE' })
      setBlogPosts((currentPosts) =>
        currentPosts.filter((post) => post.id !== postId),
      )
      const url = new URL(window.location.href)
      url.searchParams.delete('post')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    } catch (error) {
      handlePostError(error)
    } finally {
      setPostBusy(false)
    }
  }

  async function togglePostLike() {
    if (!selectedPost || likeBusy) return

    setLikeBusy(true)
    setPostsError('')
    try {
      const { liked, like_count: likeCount } = await requestApi(
        `/api/posts/${postId}/like`,
        { method: selectedPost.liked_by_user ? 'DELETE' : 'POST' },
      )
      setBlogPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? { ...post, liked_by_user: liked, like_count: likeCount }
            : post,
        ),
      )
    } catch (error) {
      handlePostError(error)
    } finally {
      setLikeBusy(false)
    }
  }

  function selectProfileTab(tab) {
    setProfileTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('profile', '1')
    url.searchParams.set('tab', tab)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  async function submitComment(event) {
    event.preventDefault()
    const content = commentText.trim()
    if (!content) return

    setCommentBusy(true)
    setCommentsError('')
    try {
      const { comment } = await requestApi(`/api/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      setComments((currentComments) => [...currentComments, comment])
      setCommentText('')
    } catch (error) {
      handleCommentError(error)
    } finally {
      setCommentBusy(false)
    }
  }

  async function saveComment(commentId) {
    const content = editingCommentText.trim()
    if (!content) return

    setCommentBusy(true)
    setCommentsError('')
    try {
      const { comment } = await requestApi(
        `/api/posts/${postId}/comments/${commentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ content }),
        },
      )
      setComments((currentComments) =>
        currentComments.map((item) => (item.id === comment.id ? comment : item)),
      )
      setEditingCommentId(null)
      setEditingCommentText('')
    } catch (error) {
      handleCommentError(error)
    } finally {
      setCommentBusy(false)
    }
  }

  async function deleteComment(commentId) {
    if (!window.confirm('Delete this comment?')) return

    setCommentBusy(true)
    setCommentsError('')
    try {
      await requestApi(`/api/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
      })
      setComments((currentComments) =>
        currentComments.filter((comment) => comment.id !== commentId),
      )
    } catch (error) {
      handleCommentError(error)
    } finally {
      setCommentBusy(false)
    }
  }

  if (authStatus === 'loading') {
    return <main className="auth-page"><p>Checking your account…</p></main>
  }

  if (authStatus === 'error') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Cannot connect</h1>
          <p className="auth-error" role="alert">{authError}</p>
          <p className="auth-note">Start the backend server, then reload this page.</p>
          <button className="auth-submit" type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      </main>
    )
  }

  if (authStatus === 'unauthenticated') {
    return (
      <AuthPage
        initialMode={initialAuthMode}
        onAuthenticated={handleAuthenticated}
      />
    )
  }

  if (isProfilePage) {
    const initials = authUser.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
    const profilePosts = blogPosts.filter((post) =>
      profileTab === 'liked'
        ? Boolean(post.liked_by_user)
        : post.user_id === authUser.id,
    )

    return (
      <main className="blog-home profile-page">
        <a className="back-link" href="/">
          ← Back to blog
        </a>
        <section className="profile-card" aria-label={`${authUser.name}'s profile`}>
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">{initials}</span>
            <h1>{authUser.name}</h1>
            <p>{authUser.email}</p>
          </div>
          <div className="profile-tabs" role="tablist" aria-label="Profile sections">
            <button
              className={`profile-tab${profileTab === 'posts' ? ' active' : ''}`}
              id="profile-posts-tab"
              type="button"
              role="tab"
              aria-selected={profileTab === 'posts'}
              aria-controls="profile-posts-panel"
              onClick={() => selectProfileTab('posts')}
            >
              Posts
            </button>
            <button
              className={`profile-tab${profileTab === 'liked' ? ' active' : ''}`}
              id="profile-liked-tab"
              type="button"
              role="tab"
              aria-selected={profileTab === 'liked'}
              aria-controls="profile-posts-panel"
              onClick={() => selectProfileTab('liked')}
            >
              Liked
            </button>
          </div>
          <section
            className="profile-posts"
            id="profile-posts-panel"
            role="tabpanel"
            aria-labelledby={profileTab === 'posts' ? 'profile-posts-tab' : 'profile-liked-tab'}
          >
            {postsLoading ? (
              <p role="status">Loading posts…</p>
            ) : profilePosts.length === 0 ? (
              <p className="profile-empty">
                {profileTab === 'posts'
                  ? 'You have not created any posts yet.'
                  : 'You have not liked any posts yet.'}
              </p>
            ) : (
              <ul className="profile-post-list">
                {profilePosts.map((post) => (
                  <li className="profile-post-item" key={post.id}>
                    <a href={`/?post=${post.id}`}>
                      <h2>{post.title}</h2>
                      <p>{post.description}</p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </main>
    )
  }

  if (postId) {
    return (
      <main className="blog-home post-detail">
        <a className="back-link" href="/">
          ← All posts
        </a>
        {authError && <p className="auth-error" role="alert">{authError}</p>}
        {postsError && <p className="auth-error" role="alert">{postsError}</p>}
        {postsLoading ? (
          <p role="status">Loading posts…</p>
        ) : selectedPost ? (
            editing ? (
              <form className="post-editor" onSubmit={savePost} aria-busy={postBusy}>
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
                  <button className="action-button" type="submit" disabled={postBusy}>
                    {postBusy ? 'Saving…' : 'Save'}
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
                    className={`like-button${selectedPost.liked_by_user ? ' liked' : ''}`}
                    type="button"
                    onClick={togglePostLike}
                    disabled={likeBusy}
                    aria-pressed={Boolean(selectedPost.liked_by_user)}
                    aria-label={`${selectedPost.liked_by_user ? 'Unlike' : 'Like'} post; ${selectedPost.like_count || 0} likes`}
                  >
                    <span aria-hidden="true">
                      {selectedPost.liked_by_user ? '♥' : '♡'}
                    </span>
                    {selectedPost.liked_by_user ? 'Liked' : 'Like'}
                    <span className="like-count">{selectedPost.like_count || 0}</span>
                  </button>
                  {selectedPost.user_id === authUser.id && (
                    <div className="article-owner-actions">
                      <button
                        className="action-button"
                        type="button"
                        onClick={startEditing}
                        disabled={postBusy}
                      >
                        Edit
                      </button>
                      <button
                        className="action-button danger"
                        type="button"
                        onClick={deletePost}
                        disabled={postBusy}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                <header className="detail-header">
                  <h1>{selectedPost.title}</h1>
                  <p className="post-author">
                    Created by: {selectedPost.author_name || 'Unknown author'}
                  </p>
                  <p className="post-subtitle">{selectedPost.subtitle}</p>
                  <p className="detail-description">{selectedPost.description}</p>
                </header>
                <div className="article-body">
                  {selectedPost.content.map((paragraph, index) => (
                    <p key={`${selectedPost.id}-${index}`}>{paragraph}</p>
                  ))}
                </div>

                <section className="comments-section">
                  <h2>Comments</h2>
                  {commentsError && (
                    <p className="auth-error" role="alert">
                      {commentsError}
                    </p>
                  )}
                  {commentsLoading ? (
                    <p role="status">Loading comments…</p>
                  ) : comments.length === 0 ? (
                    <p className="no-comments">
                      No comments yet. Be the first to share your thoughts!
                    </p>
                  ) : (
                    <ul className="comment-list">
                      {comments.map((comment) => (
                        <li className="comment-item" key={comment.id}>
                          <div className="comment-meta">
                            <strong>{comment.author_name}</strong>
                            <time dateTime={`${comment.created_at.replace(' ', 'T')}Z`}>
                              {new Date(`${comment.created_at.replace(' ', 'T')}Z`).toLocaleString()}
                            </time>
                          </div>
                          {editingCommentId === comment.id ? (
                            <div className="comment-edit">
                              <label
                                className="visually-hidden"
                                htmlFor={`edit-comment-${comment.id}`}
                              >
                                Edit comment
                              </label>
                              <textarea
                                id={`edit-comment-${comment.id}`}
                                maxLength={5000}
                                rows="4"
                                value={editingCommentText}
                                onChange={(event) =>
                                  setEditingCommentText(event.target.value)
                                }
                              />
                              <div className="comment-actions">
                                <button
                                  className="action-button"
                                  type="button"
                                  disabled={commentBusy}
                                  onClick={() => saveComment(comment.id)}
                                >
                                  {commentBusy ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  className="action-button secondary"
                                  type="button"
                                  disabled={commentBusy}
                                  onClick={() => {
                                    setEditingCommentId(null)
                                    setEditingCommentText('')
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="comment-content">{comment.content}</p>
                              {(comment.user_id === authUser.id ||
                                selectedPost.user_id === authUser.id) && (
                                <div className="comment-actions">
                                  <button
                                    className="comment-action"
                                    type="button"
                                    disabled={commentBusy}
                                    onClick={() => {
                                      setEditingCommentId(comment.id)
                                      setEditingCommentText(comment.content)
                                    }}
                                  >
                                    Edit
                                  </button>
                                  {selectedPost.user_id === authUser.id && (
                                    <button
                                      className="comment-action danger-text"
                                      type="button"
                                      disabled={commentBusy}
                                      onClick={() => deleteComment(comment.id)}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
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
                      maxLength={5000}
                      rows="4"
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder="Write a comment..."
                    />
                    <button
                      className="action-button"
                      type="submit"
                      disabled={commentBusy || commentsLoading}
                    >
                      {commentBusy ? 'Posting…' : 'Post comment'}
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
        <h1>Your Blog Cloud</h1>
        <AccountControls user={authUser} onLogout={logout} />
      </header>

      <div className="create-post-actions">
        <form
          className="post-search"
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="visually-hidden" htmlFor="post-search-input">
            Search blog posts
          </label>
          <span className="post-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.2 4.2" />
            </svg>
          </span>
          <input
            id="post-search-input"
            type="search"
            value={postSearch}
            onChange={(event) => setPostSearch(event.target.value)}
            placeholder="Search posts..."
            autoComplete="off"
          />
          {postSearch && (
            <button
              className="post-search-clear"
              type="button"
              aria-label="Clear search"
              onClick={() => setPostSearch('')}
            >
              ×
            </button>
          )}
        </form>
        <button
          className="action-button"
          type="button"
          onClick={startCreating}
          disabled={creating}
        >
          + Create new blog
        </button>
      </div>
      {postsError && (
        <p className="auth-error" role="alert">
          {postsError}
        </p>
      )}

      {creating && (
        <form className="post-editor create-post-editor" onSubmit={createPost} aria-busy={postBusy}>
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
            <button className="action-button" type="submit" disabled={postBusy}>
              {postBusy ? 'Creating…' : 'Create post'}
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
        {postsLoading ? (
          <p role="status">Loading posts…</p>
        ) : blogPosts.length === 0 ? (
          <p>No posts yet. Create the first blog post.</p>
        ) : filteredPosts.length === 0 ? (
          <p className="post-search-empty" role="status">
            No posts found for “{postSearch.trim()}”.
          </p>
        ) : filteredPosts.map((post) => (
          <article className="post" id={post.id} key={post.id}>
            <div className="post-content">
              <h2>{post.title}</h2>
              <p className="post-author">
                Created by: {post.author_name || 'Unknown author'}
              </p>
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
