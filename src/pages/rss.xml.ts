import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

// Post bodies as compiled HTML, keyed by file path. getCollection can't return
// rendered HTML without the Container API, so the body is read here instead.
const bodies = import.meta.glob<{ compiledContent: () => Promise<string> }>(
  "../content/blog/*.md",
);

export async function GET(context: APIContext) {
  const site = context.site;
  if (!site) throw new Error("`site` must be set in astro.config.mjs");
  const base = site.href.replace(/\/$/, "");

  // Same source of truth as the blog list: the validated collection.
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  const items = await Promise.all(
    posts.map(async (post) => {
      const load = bodies[`../content/blog/${post.id}.md`];
      if (!load) throw new Error(`Missing blog body: ${post.id}`);
      const html = await (await load()).compiledContent();
      return {
        title: post.data.title,
        pubDate: post.data.pubDate,
        link: `/blog/${post.id}/`,
        // Make root-relative href/src absolute (skip protocol-relative //).
        content: html.replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`),
      };
    }),
  );

  return rss({
    title: "honb.in",
    description: "Satoshi Honda のブログ",
    site,
    items,
  });
}
