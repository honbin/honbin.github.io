// Single source of truth for the published post order: drafts excluded, newest
// first. Shared by the home page, the blog list, and the RSS feed so the three
// never drift apart. Callers slice as needed.
import { getCollection } from 'astro:content';

export async function getSortedPosts() {
  return (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );
}
