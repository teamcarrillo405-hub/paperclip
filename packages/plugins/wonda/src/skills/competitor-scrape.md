# Competitor Scrape & Positioning Report

Scrape {competitorUrls}, analyze their marketing, and generate a comparison
report plus 5 social posts that position us better.

## Inputs

- Competitor URLs: `{competitorUrls}`
- Our brand: `{ourBrand}`
- Our value props: `{valueProps}`

## Steps

1. For each competitor URL, fetch the landing page and extract:
   - Brand/product summary (1–2 sentences)
   - Positioning and tone
   - Top 5 keywords / phrases
   - Primary call-to-action
2. Identify gaps and opportunities where we can position our brand more
   compellingly (feature gaps, underserved personas, messaging whitespace).
3. Produce a markdown comparison report at `report.md` in the output
   directory.
4. Generate exactly **five** social posts (platform-agnostic but max 280
   characters each) that highlight our differentiation. Save them as
   `posts.json` — an array of `{ platform, copy, hashtags[] }` objects.
5. Emit a final `result.json` with `{ competitors, opportunities, posts }`.

## Output

- `report.md` — narrative comparison
- `posts.json` — 5 positioning posts
- `result.json` — structured summary
