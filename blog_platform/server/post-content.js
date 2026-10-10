function escapeControlCharactersInJson(value) {
  let result = ''
  let inString = false
  let escaped = false

  for (const character of value) {
    const code = character.charCodeAt(0)
    if (inString && !escaped && code <= 0x1f) {
      result += JSON.stringify(character).slice(1, -1)
      continue
    }

    result += character
    if (inString && escaped) {
      escaped = false
    } else if (inString && character === '\\') {
      escaped = true
    } else if (character === '"') {
      inString = !inString
    }
  }

  return result
}

function parsePostContent(value, postId) {
  let parsed

  try {
    parsed = JSON.parse(value)
  } catch (initialError) {
    const legacyTemplate = value.match(/\bcontent:\s*`([\s\S]*)$/)
    if (legacyTemplate) {
      const templateContent = legacyTemplate[1].replace(/`?\s*"?\s*\]\s*$/, '')
      parsed = templateContent
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    } else {
      try {
        parsed = JSON.parse(escapeControlCharactersInJson(value))
      } catch {
        throw new Error(`Post ${postId} contains invalid stored content.`, {
          cause: initialError,
        })
      }
    }
  }

  if (!Array.isArray(parsed) || parsed.some((paragraph) => typeof paragraph !== 'string')) {
    throw new Error(`Post ${postId} content must be an array of text paragraphs.`)
  }

  return parsed
}

module.exports = { parsePostContent }
