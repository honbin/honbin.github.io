import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { excerpt } from "../utils/excerpt";
import { getSortedPosts } from "../utils/posts";

// Post bodies as compiled HTML, keyed by file path. getCollection can't return
// rendered HTML without the Container API, so the body is read here instead.
const bodies = import.meta.glob<{ compiledContent: () => Promise<string> }>(
  "../content/blog/*.md",
);

export async function GET(context: APIContext) {
  const site = context.site;
  if (!site) throw new Error("`site` must be set in astro.config.mjs");
  const base = site.href.replace(/\/$/, "");

  // Cap at the 20 most recent posts to bound the full-content feed's growth.
  const posts = (await getSortedPosts()).slice(0, 20);

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
        // Emit a summary before the full content:encoded so readers that key off
        // <description> show an excerpt rather than the whole post (or nothing).
        description: post.data.description ?? excerpt(post.body ?? ""),
        content: html
          // Make root-relative href/src absolute (skip protocol-relative //).
          .replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`)
          // Resolve in-page anchors against the post (readers resolve # against their own page).
          .replace(/href="#/g, `href="${url}#`)
          // Let feed readers control code block colors instead of using Shiki's inline styles.
          .replace(/\s+style="[^"]*"/g, ""),
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
