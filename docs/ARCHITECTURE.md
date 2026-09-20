# Architecture

Four engines, one direction: turn a behaviour log into something the person it
describes can actually read, check, and argue with.

```
                 ┌─────────────────────────────────────────────┐
   event log ───►│  src/model.js     behavioural metrics        │
 (synthetic or   │  src/markov2.js   next-action prediction     │──┐
   real)         │  src/truth.js     recovery math + narrative  │  │
                 │  src/journal.js   daily state + echoes       │  │
                 └─────────────────────────────────────────────┘  │
                                                                  ▼
                                            per-user truth + mirror text
                                                  (output/*.txt, *.json)
```

## Why Markov, not a neural net

The product's purpose is **explanation**. Every prediction must ship with a
reason the harmed user can verify against their own memory — *"after a loss you
re-bet within 30 seconds 95% of the time."* A black box cannot produce that
sentence. So the engine is deliberately a stack of transparent, countable models.
**Interpretability is the product, not a constraint on it.**

## Layer by layer

### `src/simulate.js` — the generator
Produces event logs for two archetypes: `casual` and `addicted-pattern`. It models
the mechanics that make a platform sticky, all from published gambling-psychology
literature:

| Mechanic | How it's modelled |
|---|---|
| Financial-pressure entry | sessions cluster in the pressure window (3 days after payday + the broke days before it); deposits are larger and faster there |
| Loss-chasing | re-bet gap shrinks; quit probability *falls* after 3+ consecutive losses |
| Near-miss effect | near-misses are treated as losses for continuation purposes |
| Session acceleration | gap between bets shrinks as the session deepens |
| Night vulnerability | a share of sessions start 22:00–03:00 |
| Streak persistence | `opts.streakPersistence` (0–1) scales the non-loss mass down after a loss — an injected 2nd-order dependency used to test the model |

The generator's math is calibrated so the *house edge* survives: outcomes are
drawn with a loss probability of 0.70 at baseline, which is why experienced RTP
lands below 100%.

### `src/model.js` — behavioural metrics + Hook Score
A first-order Markov chain over the 8 actions, plus five truth-exposing metrics:

- **loss-chase gap** — P(re-bet ≤30s | loss) vs P(re-bet ≤30s | win)
- **stake escalation** — mean stake at 0/1/2/3+ consecutive losses
- **near-miss continuation** — P(continue | near-miss) vs P(continue | loss)
- **session acceleration** — median bet gap, first third vs last third
- **night share** — fraction of bets placed 22:00–06:00

These roll into the **Hook Score** (0–100), a weighted composite measuring how
hard the platform's mechanics are working a given user. Weights live in
`hookScore()` and are deliberately readable.

### `src/markov2.js` — second-order prediction with backoff
Keys on the **pair** `(prevAction, currentAction)`, which is sharper in principle
but sparse in practice. So it interpolates:

```
P(next | prev,cur) = λ·P₂(next | prev,cur) + (1−λ)·P₁(next | cur)
```

with add-k Laplace smoothing (no probability is ever exactly 0) and a confidence
score driven by **pair support** and **margin over the runner-up**. Unseen pairs
return `backedOff: true` and a low label — the model says "I don't know" instead
of dressing a thin guess as a prediction.

### `src/truth.js` — the psychological core
- **`recoveryMath()`** — takes the user's *experienced* RTP (not the advertised
  one) and net loss, and shows that chasing costs `wager × (1 − RTP)` per dollar.
  Handles both cases: net losers get "the money is gone; stopping IS the
  recovery"; current winners get "your win is variance the house edge hasn't
  reclaimed yet — it is bait, not proof."
- **`pressureTimeline()`** — deposit clustering in the payday/broke window.
- **`mirrorNarrative()`** — the per-user text. Every hard sentence is followed by
  the reason it is the *design*, not the person.

### `src/journal.js` — the daily layer
- **`riskSignature()`** — today's pre-relapse combination (urge, isolation, money
  pressure, no contact, depleted sleep) flagged *before* play, not after.
- **`analyzeJournal()`** — urge↔loneliness correlation, danger-day relapse rate
  vs baseline, **isolation creep** (social contact early→late of the arc), top
  triggers, and resistance-peak days.
- **`findEchoes()` / `renderEchoSheet()`** — the part that matters: at peak urge,
  hand back the user's **own past notes** from days they held at the same
  intensity. The user's past self becomes the counsellor.

## Data flow

```
simulate → events[] → trainMarkov / trainMarkov2 → predictions
                    → analyzeUser → metrics → hookScore
                    → recoveryMath + pressureTimeline → mirrorNarrative → output/*.txt
journal entries     → analyzeJournal → riskSignature + isolationCreep
                    → findEchoes → renderEchoSheet
```

## Extending it

Adding a metric: put it in `analyzeUser()`, return it, and (if it should count)
wire it into `hookScore()`. Then show in `docs/FINDINGS.md` that it separates the
archetypes — a metric that does not discriminate is noise.

Swapping in real data: everything downstream of the generator is unchanged. Shape
your events as documented in the README and hand them to `trainMarkov` /
`analyzeUser` directly.
