// Use the first prose paragraph as a fallback description for posts that lack a
// hand-written one. Shared by the post page (social/meta) and the RSS feed.
export function excerpt(md: string, max = 150): string | undefined {
  const block = md
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith('#') && !s.startsWith('```') && !s.startsWith('!['));
  if (!block) return undefined;
  const text = block
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined; // avoid emitting an empty description tag
  return text.length > max ? text.slice(0, max) + '…' : text;
}
