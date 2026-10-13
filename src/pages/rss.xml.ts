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
  // Cap at the 20 most recent posts to bound the full-content feed's growth.
  const posts = (await getCollection("blog", ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, 20);

  const items = await Promise.all(
    posts.map(async (post) => {
      const load = bodies[`../content/blog/${post.id}.md`];
      if (!load) throw new Error(`Missing blog body: ${post.id}`);
      const html = await (await load()).compiledContent();
      const url = `${base}/blog/${post.id}/`;
      return {
        title: post.data.title,
        pubDate: post.data.pubDate,
        link: `/blog/${post.id}/`,
        content: html
          // Make root-relative href/src absolute (skip protocol-relative //).
          .replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`)
          // Resolve in-page anchors against the post (readers resolve # against their own page).
          .replace(/href="#/g, `href="${url}#`),
      };
    }),
  );

  return rss({
    title: "honb.in",
    description: "Satoshi Honda のブログ",
    site,
    items,
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>`,
  });
}
