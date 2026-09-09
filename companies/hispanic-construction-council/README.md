# Hispanic Construction Council — Agent Company

A Paperclip agent company that runs content, research publication, and audience
growth for the [Hispanic Construction Council](https://www.hispanicconstructioncouncil.org),
a national 501(c)(3) nonprofit advancing Hispanic construction professionals and
businesses through original research, industry programs, and advocacy.

The President of HCC is the human board member. Every agent reports up to the
Executive Director, who reports to the board.

## Goals

- **100,000 social media subscribers** across LinkedIn, Facebook, Instagram, X,
  Reddit, and Substack
- **2,000 new members in 12 months** (~167/month)
- Be the most credible, personable source on Hispanic participation in
  construction
- Publish the national research the organization's website commits to

## How the company operates

**Hub-and-spoke.** The Executive Director holds strategy, the weekly plan, and
the goal math, and dispatches to five specialists who own distinct workstreams
and report results back. Work runs in parallel, not in a line.

The one hard dependency: the Content & Research Lead sets the week's theme and
verified source material on Monday, and the Social Media Manager, Video Producer,
and Community Engagement Specialist all draw from it — so five agents sound like
one organization.

```
President (human board member)
└── Executive Director
    ├── Content & Research Lead
    ├── Social Media Manager
    ├── Community Engagement Specialist
    ├── Video Producer
    └── Growth Analyst
```

## Org chart

| Agent | Title | Reports to | Skills |
| --- | --- | --- | --- |
| `executive-director` | Executive Director | — (board) | hcc-brand-voice, hcc-editorial-standards, paperclip |
| `content-research-lead` | Content & Research Lead | executive-director | hcc-brand-voice, hcc-editorial-standards, national-report-production, paperclip |
| `social-media-manager` | Social Media Manager | executive-director | hcc-brand-voice, hcc-editorial-standards, blotato-publishing, hcc-engagement-standards, paperclip |
| `community-engagement` | Community Engagement Specialist | executive-director | hcc-brand-voice, hcc-engagement-standards, paperclip |
| `video-producer` | Video Producer | executive-director | hcc-brand-voice, hcc-editorial-standards, blotato-publishing, paperclip |
| `growth-analyst` | Growth Analyst | executive-director | blotato-publishing, hcc-engagement-standards, paperclip |

### What each agent does

- **Executive Director** — sets the weekly plan, keeps the goal math honest,
  escalates policy positions and reports to the President.
- **Content & Research Lead** — the Wednesday article, the weekly theme, and the
  quarterly national reports. Owns sourcing.
- **Social Media Manager** — Monday/Tuesday/Thursday posts across six platforms,
  holiday posts, and the monthly membership campaign.
- **Community Engagement Specialist** — 5+ substantive comments weekly, replies
  on HCC's own posts, LinkedIn connection outreach.
- **Video Producer** — one video per week, cut for social, YouTube, and TikTok.
- **Growth Analyst** — the Friday review. The function that does not spin.

## Weekly cadence

| Day | What | Owner |
| --- | --- | --- |
| Mon 7:00 | Weekly planning | Executive Director |
| Mon 7:30 | Set weekly theme | Content & Research Lead |
| Mon 9:00 | Social post | Social Media Manager |
| Tue 9:00 | Social post | Social Media Manager |
| Tue 10:00 | Weekly video | Video Producer |
| Wed 6:00 | Long-form article + images | Content & Research Lead |
| Thu 9:00 | Social post | Social Media Manager |
| Thu 14:00 | Holiday planning (1 week ahead) | Social Media Manager |
| Mon–Fri 11:00 | Engagement round | Community Engagement Specialist |
| Mon/Wed/Fri 13:00 | LinkedIn outreach | Community Engagement Specialist |
| Fri 14:00 | Analytics review | Growth Analyst |
| 1st of month | Membership campaign | Social Media Manager |
| Quarterly | National report | Content & Research Lead |

All times America/Los_Angeles.

## Skills

Custom to this package:

| Skill | Purpose |
| --- | --- |
| `hcc-brand-voice` | Voice, audience, language, and visual identity |
| `hcc-editorial-standards` | Sourcing, fact-checking, corrections, sensitive topics |
| `blotato-publishing` | Scheduling and analytics via Blotato, and its coverage gaps |
| `hcc-engagement-standards` | Engagement targets and how to earn them honestly |
| `national-report-production` | The quarterly research report process |

Referenced: `paperclip` (Paperclip's built-in coordination skill).

## Before you run this

Three things need filling in:

1. **Brand palette.** `skills/hcc-brand-voice/SKILL.md` has a placeholder block
   for HCC's colors, typefaces, and logo rules. It could not be populated
   automatically because the HCC site was unreachable from the environment where
   this package was generated. Fill it in before any graphic or video ships —
   agents are instructed not to invent brand colors.
2. **`BLOTATO_API_KEY`.** Required for the publishing and analytics agents.
3. **Reddit and Substack publishing path.** See below.

## Two tooling constraints, documented up front

**Blotato does not publish to Reddit or Substack.** It covers X, LinkedIn,
Facebook, Instagram, TikTok, YouTube, Threads, Bluesky, and Pinterest. Both
missing platforms are on HCC's target list, so agents are instructed to prepare
that content and flag it as pending a manual step rather than silently dropping
two platforms from the week.

**Blotato's analytics return no LinkedIn metrics.** LinkedIn is one of HCC's most
important channels, so the Growth Analyst sources those numbers separately and is
instructed never to report a cross-platform total that silently omits a platform.

## Non-negotiables

Every agent operates under these:

1. Never fabricate a statistic, quote, source, or finding
2. Never buy, farm, or fake engagement
3. Never state a policy position the board has not taken
4. Never disclose confidential member or organizational information
5. When a claim is uncertain, say so or leave it out

## Getting started

```bash
paperclipai company import --from companies/hispanic-construction-council
```

Then, in Paperclip:

1. Fill in the brand palette in `hcc-brand-voice`
2. Add `BLOTATO_API_KEY` as a company secret
3. Confirm each agent is on the Claude Code (local) adapter with subscription
   login (no `ANTHROPIC_API_KEY` set — that would switch to API-key billing)
4. Set monthly budgets per agent
5. Wire the Obsidian vault per
   [`docs/guides/obsidian-second-brain.md`](../../docs/guides/obsidian-second-brain.md)
6. Review and approve the routine schedules before enabling them

## References

- [Agent Companies specification](https://agentcompanies.io/specification)
- [Paperclip](https://github.com/paperclipai/paperclip)
- [Hispanic Construction Council](https://www.hispanicconstructioncouncil.org)

## License

MIT — see [LICENSE](LICENSE).
