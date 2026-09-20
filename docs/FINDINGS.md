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
