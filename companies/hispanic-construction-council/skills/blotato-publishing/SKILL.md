---
name: blotato-publishing
description: How HCC schedules social posts and retrieves analytics through Blotato, including which platforms it does and does not cover. Use when scheduling any post or video, or when pulling performance data.
metadata:
  paperclip:
    tags:
      - publishing
      - analytics
      - tooling
---

# Publishing and Analytics via Blotato

Blotato is HCC's social scheduling and analytics layer. It offers a REST API and
an MCP server, so Claude Code agents can drive it directly once it is connected.

## Setup (one time, by the President)

Blotato needs an API key, available from the Blotato dashboard. It reaches this
company as the `BLOTATO_API_KEY` secret.

The MCP server is the preferred integration for these agents — it exposes
publishing, scheduling, comment/DM management, and analytics as tools. Wire it
the same way the Obsidian MCP server is wired in
`docs/guides/obsidian-second-brain.md`: an MCP config file referenced from the
agent's **Extra args** field as `--mcp-config,<path>`. Blotato also ships n8n and
Make.com nodes if a non-agent path is ever wanted.

Consult Blotato's own documentation (help.blotato.com) for current endpoints and
tool names rather than assuming a shape — the API evolves.

## Platform coverage — the important part

**Blotato publishes to:** X, LinkedIn, Facebook, Instagram, TikTok, YouTube,
Threads, Bluesky, Pinterest.

**Blotato does NOT publish to: Reddit or Substack.**

Both are on HCC's target platform list. This is a real gap, not an oversight to
work around silently:

- Schedule everything Blotato supports through Blotato
- For Reddit and Substack, prepare the content and either use a separately
  configured path or hand it to the President for manual posting
- **Always state in your task comment when content is pending a manual step.**
  A week where Reddit and Substack quietly got nothing is a week the goal moved
  backward without anyone noticing

## Analytics coverage — the other important part

Blotato's analytics endpoints **return no LinkedIn metrics**, even though it
publishes to LinkedIn. Since LinkedIn is central to HCC's strategy:

- Pull Blotato analytics for the platforms it covers
- Source LinkedIn numbers separately (LinkedIn's native page analytics)
- Reddit and Substack are also outside Blotato's analytics
- **Never report a cross-platform total that silently omits a platform.** State
  coverage explicitly: which platforms the number includes and which are missing

## Publishing practice

- Write natively per platform. Blotato can distribute one payload widely; that
  does not mean it should. The same idea, rewritten for each platform's register,
  outperforms one text copy-pasted six times.
- Schedule ahead. Monday/Tuesday/Thursday posts and holiday posts should be
  queued before the day they run, not written at post time.
- Verify the schedule landed. A queued post that silently failed is indis-
  tinguishable from a post that was never written, until the analytics are empty.
- Attach media deliberately — the image or video is usually what earns the stop.

## Analytics practice

- Pull on a schedule (the Growth Analyst's Friday review) rather than ad hoc, so
  week-over-week comparisons are consistent.
- Record snapshots durably — the Obsidian vault or a sheet — so trends survive
  beyond one review.
- Track against the targets: 15 comments and 100 likes per post.
- Correlate, but do not confuse correlation with cause. Note what changed and
  what moved; label causal claims as hypotheses to test.

## Never

- Use Blotato or any tool to buy, farm, or simulate engagement
- Publish to a platform HCC has not authorized
- Store the API key in the package, in a task comment, or in the vault
