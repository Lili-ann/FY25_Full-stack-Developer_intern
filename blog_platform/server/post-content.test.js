const assert = require('node:assert/strict')
const test = require('node:test')
const { parsePostContent } = require('./post-content')

test('parses well-formed post content without changing paragraphs', () => {
  assert.deepEqual(parsePostContent('["First paragraph.","Second paragraph."]', 1), [
    'First paragraph.',
    'Second paragraph.',
  ])
})

test('repairs raw line breaks inside stored JSON paragraph strings', () => {
  const malformed = '["First paragraph.\n\nSecond paragraph."]'
  assert.deepEqual(parsePostContent(malformed, 2), [
    'First paragraph.\n\nSecond paragraph.',
  ])
})

test('recovers paragraphs from legacy content template literals', () => {
  const malformed = `["Description",
    content: \`
      First paragraph.

      Second paragraph.
    \`]`
  assert.deepEqual(parsePostContent(malformed, 3), [
    'First paragraph.',
    'Second paragraph.',
  ])
})

test('reports unsupported or unrecoverable post content', () => {
  assert.throws(
    () => parsePostContent('not valid post content', 4),
    /Post 4 contains invalid stored content/,
  )
  assert.throws(
    () => parsePostContent('{"paragraph":"not an array"}', 5),
    /Post 5 content must be an array/,
  )
})
