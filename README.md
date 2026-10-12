# honb.in

Personal site & blog, built with Astro. Deployed to GitHub Pages (custom domain: honb.in) via GitHub Actions.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # output to dist/
```

## Add a post

Create `src/content/blog/<slug>.md` with frontmatter:

- Required: `title`, `pubDate`
- Optional: `description`, `updatedDate`, `draft`

Set `draft: true` to exclude a post from the published site.

Use a descriptive slug for the filename (e.g. `my-new-post.md`). Use a date-only `pubDate` by default; include a time when publishing multiple posts on the same day.

## Deploy

Push to `main` to build and deploy via GitHub Actions.

Custom domain is configured via `public/CNAME`.
