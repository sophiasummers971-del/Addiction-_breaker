# Findings

Every number below was produced by the code in this repo, on the synthetic
cohort described in `src/simulate.js` (12 users — 6 casual, 6 addicted-pattern —
over 30 days). Synthetic data proves the *engine* works and that the metrics
discriminate; real logs are needed to act on any individual result.

---

## 1. Behavioural separation (first-order metrics)

| Metric | Casual users | Addicted-pattern users |
|---|---|---|
| Composite **Hook Score** (0–100) | **4.7** avg | **47.3** avg |
| Re-bet ≤30s after a **loss** | 0% | **95%** |
| Re-bet ≤30s after a **win** | 0% | 30% |
| Experienced **RTP** (actual return) | 38.3% | 48.3% |
| Deposits in the **pressure window** | ~20% | **~71%** |

The Hook Score separates the two populations cleanly with no overlap between
individuals. The loss-chase gap (95% vs 30%) is the single sharpest signal:
the re-bet reflex fires *after losses*, which is the mechanic, not the person.

## 2. The Recovery Math (the "get it back" trap, dismantled)

Example — `pattern-1`:

```
You put in $19,768. You got back $11,132.
The difference — $8,637 — is money the game took.
The game returned 56.3% of what you fed it — YOUR number, not the advertised one.
Every $1,000 you wager trying to recover costs you ~$437 more.
Chase it with the same amount again and the hole grows to ~$12,411.
```

The module also handles the winning case honestly: a user who is *net ahead*
is told the win is variance the house edge has not reclaimed yet — not proof
the system can be beaten.

## 3. Financial-pressure entry (why people start)

Play is modelled as pressure-driven, not curiosity-driven. Addicted-pattern
sessions cluster in the **pressure window** (3 days after payday + the broke
days before it):

- Addicted-pattern: **67–73%** of deposits land in the pressure window
- Casual: **10–22%**

## 4. Daily journal + isolation creep

From `journal_demo.js` (60-day synthetic arc):

| Signal | Value |
|---|---|
| urge ↔ loneliness correlation | **r = 0.93** |
| Relapse rate on "danger-signature" days | **17%** |
| Relapse rate on all other days | **0%** |
| Social contact, early → late arc | **5.7 → 2.0 (−65%)** |
| Loneliness, early → late arc | **3.8 → 8.2** |
| "Armor days" (high urge, held the line) | **23** |

The isolation creep is the mechanism made visible: contact hollows out weeks
before the slip. The 23 armor days become the **Echo sheet** — the user's own
past notes handed back at the moment of peak urge.

## 5. Second-order Markov: memoryless baseline

With the original **i.i.d. outcome generator** (`streakPersistence = 0`), the
second-order pair term adds nothing — correctly:

| Model | Held-out top-1 | Log-loss | Brier |
|---|---|---|---|
| 1st-order | 81.7% | — | — |
| 2nd-order | 81.7% | — | — |
| **Δ** | **0.0 pts** | — | — |

Lift `P(loss|loss,bet) / P(loss|bet)` = **1.00×**. A model that "found" signal
here would have been fitting noise. The backoff layer reported it honestly:
unseen pairs return `backedOff: true`, `confidence 0 [low]`.

## 6. Second-order Markov: with real streak persistence

Injecting a genuine 2nd-order dependency (`streakPersistence = 0.35`) — a
loss raises the next bet's loss probability by scaling the non-loss mass down:

**Realized outcome-sequence conditionals (ground truth in the data):**

| Conditional | Rate | n |
|---|---|---|
| P(loss \| prev outcome = loss) | **81.6%** | 1681 |
| P(loss \| prev outcome = win) | 70.2% | 285 |
| P(loss \| prev outcome = near-miss) | 67.2% | 183 |
| P(loss) overall | 78.8% | 2149 |
| **raised by** | **+11.4 pts** | |

**Per-state predicted P(next = loss):**

| State | 1st-order | 2nd-order | Empirical | n |
|---|---|---|---|---|
| `loss>bet` | 77.5% | **80.0%** | 81.5% | 1642 |
| `near_miss>bet` | 77.5% | **69.2%** | 66.7% | 180 |
| `win>bet` | 77.5% | **72.6%** | 71.1% | 277 |
| **mean \|model − empirical\|** | **7.05 pts** | **1.83 pts** | — | — |

The first-order model cannot separate these states — it returns the same
unconditional value for each. The second-order model splits them and lands far
closer to the empirical truth (mean error 7.05 → 1.83 pts).

**Held-out metrics (same split, same smoothing, order is the only difference):**

| Model | Log-loss ↓ | Brier ↓ | Top-1 ↑ |
|---|---|---|---|
| Baseline (unconditional marginal) | 1.2106 | 0.6188 | 47.6% |
| 1st-order | 0.4490 | 0.2288 | 87.1% |
| **2nd-order** | **0.4460** | **0.2266** | 87.1% |
| **Δ (2nd − 1st)** | **-0.0030** | **-0.0022** | **+0.0 pts** |

(1048 held-out transitions. Negative Δ on log-loss/Brier = second-order won.)

**Honest read:** the gain here is small — a *sharpened probability*, not a new
correct label. The decisive picture is the sweep in §7, which shows the sign of
this Δ flipping as a function of how much real structure the data contains.

## 7. Dependency-strength sweep

`scripts/sweep.js` walks `streakPersistence` from 0 → 0.5 with seeds, cohort
size, `k = 0.5` and `λ = 0.7` held fixed. See `output/sweep_results.json` and
`output/chart_sweep.png` for the current run.

---

## Reproduce

```bash
node scripts/run.js            # cohort + Hook Score + mirror narratives
python3 scripts/make_report.py # 4 behaviour charts
node scripts/markov2_demo.js   # memoryless baseline (Δ = 0)
node scripts/streak_demo.js    # injected dependency (Δ > 0)
node scripts/journal_demo.js   # journal + isolation creep
python3 scripts/make_journal_chart.py
node scripts/sweep.js          # dependency-strength sweep
python3 scripts/make_sweep_chart.py
```

## 8. Variable-order backoff vs a fixed interpolation weight

`src/backoff.js` gates the pair term on **support** instead of blending it with a
fixed weight:

```
order 2  if pair support >= minSupport
order 1  else if (cur) has any support
order 0  else (unconditional marginal)
```

Every prediction reports which order it used, so the caller always knows how much
evidence is behind the number.

Three strategies, identical held-out split, identical smoothing (k = 0.5):

- **A** — order-1 only (baseline)
- **B** — fixed-λ interpolation (`markov2.js`, λ = 0.7)
- **C** — variable-order gated (`backoff.js`, over a `minSupport` sweep)

### memoryless data (streakPersistence = 0 — no 2nd-order structure to find)

| minSup | strategy | log-loss ↓ | Brier ↓ | top-1 | order 2/1/0 used |
|---|---|---|---|---|---|
| — | A order-1 only | **0.5511** | **0.2977** | 81.6% | — |
| — | B fixed λ = 0.7 | 0.5556 | 0.2989 | 81.6% | — |
| 5 | C gated | 0.5573 | 0.2993 | 81.6% | 971/1/0 |
| 50 | C gated | 0.5560 | 0.2988 | 81.6% | 964/8/0 |
| **250** | **C gated** | **0.5535** | **0.2983** | 81.6% | 837/135/0 |

### real 2nd-order structure (streakPersistence = 0.5)

| minSup | strategy | log-loss ↓ | Brier ↓ | top-1 | order 2/1/0 used |
|---|---|---|---|---|---|
| — | A order-1 only | 0.4455 | 0.2240 | 87.4% | — |
| — | B fixed λ = 0.7 | 0.4405 | 0.2208 | 87.4% | — |
| 5 | C gated | 0.4389 | 0.2198 | 87.4% | 998/2/0 |
| **50** | **C gated** | **0.4384** | **0.2195** | 87.4% | 995/5/0 |
| 250 | C gated | 0.4409 | 0.2215 | 87.4% | 869/131/0 |

### Honest read

**Gating beats a fixed weight in both regimes**, which was the whole point:

- memoryless: C (250) = **0.5535** vs B = 0.5556 — gating recovers most of the
  loss fixed-λ suffers, and gets close to the baseline A (0.5511).
- real structure: C (50) = **0.4384** vs B = 0.4405 and A = 0.4455 — gating wins
  outright, beating *both* the fixed-λ model and the plain baseline.

Three caveats, stated rather than buried:

1. **On memoryless data, no gate value tested actually beat plain order-1.** The
   ideal gate there is "never use the pair", which a fixed threshold cannot know
   in advance — it tried the pair 837 times out of 972 even at minSupport = 250.
   The correct fix is to *choose* `minSupport` by validation on the specific
   corpus (or let it degenerate to order-1 when validation says so), not to pick
   a constant. That is the next iteration.
2. **Top-1 accuracy never moves** (81.6% / 87.4% across every strategy) — as
   everywhere in this project, the gain is in calibration, not in a new correct
   label, because losses dominate the base rate.
3. **The gate is corpus-specific.** `minSupport = 50` was best where structure
   existed and `250` where it did not; the model must be able to tell you which
   regime it is in. The per-prediction `order` field is what makes that auditable.

An earlier version of this harness scored strategy C from only its top-3
predictions with a dummy fill for the rest, which inflated its Brier score
(0.3774 — visibly wrong next to A's 0.2977). `predictBackoff()` now returns the
full distribution so held-out metrics are computed correctly. The bug is noted
here because a metric that cannot fail proves nothing.

## 9. Real-data adapters + validation-chosen gate

### 9a. Adapter round-trip fidelity

`src/adapters.js` normalises real exports (aliased action names, epoch-seconds /
ISO / epoch-ms timestamps, renamed or missing columns, absent session ids, junk
rows) into the canonical event shape. `scripts/adapter_demo.js` is a **round-trip
fidelity test**: a canonical cohort is re-serialised into messy shapes, pushed
back through the adapter, and compared field-by-field against the original.

| Case | Rows in | Mapped | Round-trip |
|---|---|---|---|
| **A** — messy CSV, two timestamp formats, aliased actions, session column kept | 1,207 | 1,207 (100.0%) | ✅ exact on all 1,207 events |
| **B** — no session column, 4 junk rows injected | 1,211 | 1,207 | ✅ exact on all surviving events |

Case B's 4 dropped rows were reported, not silently swallowed:

```
unmapped actions: { click: 1, view_advert: 1 }
rejected:         { badTimestamp: 1, missingAction: 1 }
session ids DERIVED from time gaps: 23 sessions   (canonical had 23)
```

Downstream value preservation: canonical total staked **$5,566.52** vs adapted
**$5,566.52** — identical to the cent. Hook Score computed on adapted data: **43**.

Two harness bugs were found and fixed while building this test, both of which
had *falsely reported a fidelity failure*:

1. Compare-at-full-ms against a source that serialises epoch **seconds** (which
   floors milliseconds) — the test must compare at the precision the source
   actually preserved. Cases A and B need different comparators for this reason.
2. Blank numeric cells were being coerced to `0` instead of `undefined`, which
   would have injected fake $0 stakes into every stake metric. Now blank → absent.

### 9b. Validation-chosen gate (`selectMinSupport`)

A fixed `minSupport` cannot know which regime the corpus is in (§8). This picks
it by validation, with **`Infinity` (never use the pair) as a first-class
candidate** — so on structureless data validation is free to collapse the model
back to plain first-order. Split per user: 60% train / 20% validation / 20% test;
the gate is chosen on validation and scored on untouched test data.

Without a margin it did **not** fix the problem (Δ = +0.0011 where there was no
structure — it still picked a pair-gate on noise). Adding a **margin** — how much
a higher order must beat order-1 by before being trusted — does:

| margin | persist 0 (no structure) | persist 0.2 | persist 0.5 (real) |
|---|---|---|---|
| 0 | **+0.0011** ✗ loses | −0.0005 | −0.0026 |
| 0.001 | **+0.0014** ✗ loses | −0.0009 | −0.0026 |
| **0.005** | **+0.0000** ✅ costs nothing | **−0.0005** ✅ wins | **−0.0012** ✅ wins |

(Δ = chosen-gate test log-loss − order-1 baseline; negative = gate won.)

At `margin = 0.005` the gate is **safe in every regime**: it never loses where
there is no structure (it chose "never" for 11 of 12 users and used the pair only
21 times out of 972), and it still wins where structure exists.

**Honest read — the tradeoff is explicit.** The margin *costs upside*: at
persist 0.5 it gained −0.0012 versus the un-margined −0.0026. Being safe against
noise means being less aggressive when the signal is real. That is the correct
default for a tool whose whole point is not to dress thin guesses as predictions
— but it is a real tradeoff, not a free lunch, and it should be re-tuned per
corpus. The chosen gate, its validation score and the order actually used are all
returned by the API, so the choice is auditable.
