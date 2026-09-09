---
name: oauth-capacity-budget
description: How much work HCC's agents can actually do on one Claude subscription, and what to cut first when capacity runs short. Use at the start of every heartbeat, when planning the week, and whenever a run is slow, throttled, or refused for capacity reasons.
metadata:
  paperclip:
    tags:
      - capacity
      - governance
      - budget
---

# OAuth Capacity Budget

## The fact this whole rule rests on

**All six HCC agents run on one Claude subscription.** There is no per-agent
allowance. Every heartbeat — the Executive Director's Monday planning, the
Wednesday article, every social post, every comment, every video — draws from
the same pool as everything else.

That means capacity is a **company-level shared resource**, and the failure mode
is not "one agent gets slow." It is: five cheap runs early in the day consume
the window, and the Wednesday article — the thing HCC actually promised the
public — has nothing left to run on.

Capacity planning is therefore not an optimization. It is how HCC keeps its
commitments.

## The signal

Paperclip's Claude Code (local) adapter reads live usage from Anthropic's OAuth
usage endpoint and surfaces these windows, each with a used-percent (0–100) and
a reset timestamp:

| Window | What it governs |
| --- | --- |
| **Current session** | A rolling ~5-hour bucket. This is the binding constraint day to day. |
| **Current week (all models)** | The 7-day ceiling across everything. |
| **Current week (Sonnet only)** | Sonnet's own weekly ceiling. |
| **Current week (Opus only)** | Opus's own weekly ceiling — **separate from Sonnet's**. |
| **Extra usage** | Paid overage, in real money, if the plan permits it. |

Read the windows rather than guessing. Do not hardcode message counts or
token estimates into any plan — the percentages are the truth, and plan limits
differ by subscription tier and change over time.

## Capacity modes

Check the **Current session** window at the start of each heartbeat and pick the
mode:

| Session used | Mode | Behavior |
| --- | --- | --- |
| **under 60%** | **Normal** | Run everything as scheduled. |
| **60–79%** | **Guarded** | Run Tier 1 and Tier 2. Defer Tier 3 to the next window. |
| **80–94%** | **Priority-only** | Run Tier 1 only. Everything else waits for the reset. |
| **95% or more** | **Freeze** | Start nothing new. Note the reset time and stop. |

If a run is already in flight when a threshold is crossed, finish it — a
half-written article costs the capacity without producing the deliverable.

## Priority tiers

**Tier 1 — public commitments.** Miss these and HCC breaks a promise:

- The Wednesday article
- Posts already scheduled to publish that day
- Holiday posts, on the holiday
- A national report inside the President's review or publication window
- Replies to people who commented on HCC's posts (silence damages trust)

**Tier 2 — the growth engine.** Slippable by a day, not by a week:

- The weekly video
- Engagement rounds and the 5-comment minimum
- LinkedIn outreach
- The monthly membership campaign
- The Friday analytics review

**Tier 3 — internal work.** Defer freely:

- Planning refinement beyond the week's decisions
- Exploratory research with no publication date
- Backlog grooming, vault tidying, source-library maintenance

## The weekly guard

The 5-hour window recovers; the week does not. So:

- If **Current week (all models)** passes **85% before Thursday**, the week is
  over-provisioned. The Executive Director cuts Tier 3 for the remainder,
  reduces Tier 2 to essentials, and protects the Wednesday article and the
  day's scheduled posts.
- Never let the week's early cheap work starve Wednesday. An article that
  doesn't ship because Monday's engagement round burned the budget is a
  self-inflicted miss.
- Report the cut in the Friday review, with what was dropped and why.

## Two levers that genuinely extend capacity

**1. Model routing.** Sonnet and Opus have *separate* weekly ceilings. Running
everything on one model wastes the other's headroom. Default the routine cadence
— social posts, engagement, outreach, holiday planning — to Sonnet, and reserve
Opus for work where reasoning depth changes the output quality: the quarterly
national report, and articles doing original analysis rather than summary.

**2. Schedule spacing.** Runs clustered inside one 5-hour window compete with
each other; the same runs spread across two windows do not. The current
schedule's tightest cluster is **Tuesday 09:00 / 10:00 / 11:00** — social post,
weekly video, and engagement round in one window, with the video typically the
most expensive run of the three. If Tuesday starts hitting Guarded mode, move
the video rather than cutting it.

## When capacity forces a cut

- **Say so, in the task comment.** A post that didn't publish because the window
  was exhausted must not look like a post nobody wrote. Name what was skipped,
  why, and when it will run.
- **Carry it into the Friday review.** The Growth Analyst reports capacity-driven
  misses alongside performance misses. A month of quietly dropped Thursday posts
  would otherwise read as an unexplained engagement decline.
- **Escalate a pattern.** One skipped Tier 3 task is normal. Tier 1 work getting
  cut, or Guarded mode most days, means the workload exceeds the plan — that is
  a decision for the President (reduce cadence, or upgrade the plan), not
  something for agents to absorb silently week after week.

## Two things no agent may do

**Never set `ANTHROPIC_API_KEY` to get around a limit.** It works — and it
silently converts HCC from a fixed monthly subscription to metered pay-per-token
billing with no ceiling. That is a spending decision that belongs to the
President alone. If capacity is genuinely insufficient, say so and let them
choose.

**Never let paid overage accrue unreported.** If the extra-usage window shows
real money being spent, flag it to the Executive Director in the same heartbeat,
who flags it to the President. Do not treat overage as available capacity.

## Quick reference

```
Start of heartbeat:
  read Current session %
    < 60  → run everything
    60-79 → Tier 1 + 2, defer Tier 3
    80-94 → Tier 1 only
    >= 95 → stop; note reset time

Weekly:
  Current week > 85% before Thursday → cut scope, protect Wednesday
  Opus week high, Sonnet week low    → route routine work to Sonnet

Always:
  cut → say so in the comment and in Friday's review
  pattern of cuts → escalate to the President
  never swap in an API key to buy headroom
```
