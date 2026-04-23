# Product Launch Campaign

Generate a complete product launch campaign for {productName}: hero image,
3 social posts, 1 short video script, and email subject lines.

## Inputs

- Product name: `{productName}`
- Tagline / pitch (optional): `{pitch}`
- Target audience (optional): `{audience}`
- Launch date (optional): `{launchDate}`

## Steps

1. Generate a **hero image** (1200x630 landscape) that captures the product
   concept. Save to `images/hero.png`.
2. Write **three social posts** — one each for Instagram, LinkedIn, and X.
   Tune voice per platform. Include hashtags.
3. Write **one short promo video script** — 20–30 seconds, structured as
   hook → value prop → CTA. Save as `video/script.md`.
4. Write **five email subject lines** testing different angles (urgency,
   curiosity, benefit, social proof, personalization).
5. Emit `result.json` with `{ heroImage, posts, videoScript, emailSubjects }`.

## Output

- `images/hero.png`
- `video/script.md`
- `result.json` — structured launch bundle
