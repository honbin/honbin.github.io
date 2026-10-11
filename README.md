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
- Optional: `description`, `updatedDate`, `sourceUrl`, `draft`

Set `draft: true` to exclude a post from the published site.

## Deploy

Push to `main` to build and deploy via GitHub Actions.

Custom domain is configured via `public/CNAME`.
