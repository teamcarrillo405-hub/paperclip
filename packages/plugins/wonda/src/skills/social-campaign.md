# Social Media Campaign

Create a {tone} social media campaign about {topic} for {platforms}.
Generate images, captions, and a posting schedule.

## Inputs

- Topic: `{topic}`
- Platforms: `{platforms}`
- Tone: `{tone}`
- Brand voice / persona (optional): `{brandVoice}`

## Steps

1. Draft a short campaign brief (2–3 sentences) summarizing the angle.
2. For each platform in `{platforms}`:
   - Generate a platform-appropriate hero image via `wonda image` (aspect
     ratio tuned per platform — square for Instagram, landscape for LinkedIn,
     9:16 for TikTok, etc.).
   - Write the post caption following the `{tone}` voice. Keep within the
     platform's native character limit.
   - Suggest 3–6 hashtags.
3. Propose a 7-day posting schedule with one post per platform per day at
   typical high-engagement times.
4. Emit `result.json` with `{ campaignName, posts: [...], assets: [...], schedule: [...] }`.

## Output

- One image per platform (in `images/`)
- `result.json` — structured campaign payload
