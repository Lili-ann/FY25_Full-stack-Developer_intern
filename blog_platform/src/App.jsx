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

function App() {
  const postId = new URLSearchParams(window.location.search).get('post')
  const selectedPost = posts.find((post) => post.id === postId)

  if (postId) {
    return (
      <main className="blog-home post-detail">
        <a className="back-link" href="/">
          ← All posts
        </a>
        {selectedPost ? (
          <article>
            <header className="detail-header">
              <p className="post-subtitle">{selectedPost.subtitle}</p>
              <h1>{selectedPost.title}</h1>
              <p className="detail-description">{selectedPost.description}</p>
            </header>
            <div className="article-body">
              {selectedPost.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>
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

      <section className="post-list" aria-label="Latest blog posts">
        {posts.map((post, index) => (
          <article className="post" id={post.id} key={post.id}>
            <span className="post-number" aria-hidden="true">
              0{index + 1}
            </span>
            <div className="post-content">
              <h2>{post.title}</h2>
              <p className="post-subtitle">{post.subtitle}</p>
              <p>{post.description}</p>
              <a className="read-more" href={`/?post=${post.id}`}>
                Read more <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

export default App
