<div align="center">

# 🎰 Addiction Breaker

**An interpretable behavioural engine that shows people the machinery of the system that is working them.**

*It doesn't predict the future to exploit it. It predicts the future to hand it back to the person it belongs to.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](package.json)
[![Explainable by design](https://img.shields.io/badge/model-interpretable-orange.svg)](#-design-philosophy)

</div>

---

## 🧠 What this is

Most behavioural-analytics engines exist to *find* the users who are most
hooked, then squeeze harder. This one points the same mathematics the other way:
it reads a person's own gambling behaviour and hands them back the truth about
how the algorithm operates on them.

It is built on a single conviction — **explainability is the product.**

A black-box neural net might predict relapse marginally better. It cannot tell a
harmed user *why*, in words they can check against their own memory. So this
engine is a stack of **transparent, auditable models** — every number it reports
carries the counts behind it.

### Four layers

| Layer | Module | What it does |
|---|---|---|
| 📊 **Behaviour engine** | `src/model.js` | Interpretable Markov next-action predictor + Hook Score + five truth-exposing metrics |
| 💸 **Truth engine** | `src/truth.js` | Financial-pressure entry model, the **Recovery Math** that dismantles "I have to win it back", and per-user mirror narratives |
| 📔 **Journal engine** | `src/journal.js` | Daily logging, pre-relapse signature detection, isolation-creep tracking, and **Echoes** — your own past words handed back at peak urge |
| 🔬 **Prediction upgrade** | `src/markov2.js` | Second-order (pair-aware) Markov with Laplace smoothing + honest confidence labels |
| 🎚️ **Variable-order gate** | `src/backoff.js` | Confidence-gated backoff: trust the pair only when it has support, else fall to a lower order — and report which order was used |

---

## 📌 Headline findings

All figures below come from the synthetic cohort in `src/simulate.js` (12 users —
6 casual, 6 addicted-pattern — over 30 days). Synthetic data proves the *engine*
works and that the metrics discriminate; real logs are what make an individual
result actionable. Full detail: [`docs/FINDINGS.md`](docs/FINDINGS.md).

### The behavioural separation

| Metric | Casual | Addicted-pattern |
|---|---|---|
| Composite **Hook Score** (0–100) | **4.7** avg | **47.3** avg |
| Re-bet ≤30s after a **loss** | 0% | **95%** |
| Re-bet ≤30s after a **win** | 0% | 30% |
| Deposits in the **pressure window** | ~20% | **~71%** |

The loss-chase gap — **95% after a loss vs 30% after a win** — is the sharpest
signal in the whole engine. The re-bet reflex fires *after losses*. That is not a
personality trait. That is the mechanic.

### The Recovery Math — the "get it back" trap, dismantled

For a user who staked \$19,768 and got back \$11,132 (experienced RTP **56.3%**):

> *Every \$1,000 you wager trying to recover your \$8,637 costs you ~\$437 more.
> Chase it with the same amount again and the hole grows to ~\$12,411.
> The math has one direction.*

### The dependency-strength sweep

`scripts/sweep.js` walks the generator's injected dependency from 0 → 0.5 and
measures how much the second-order upgrade pays off at each step.

| streakPersistence | real structure (raised, pts) | Δ log-loss | Δ Brier | Δ top-1 |
|---|---|---|---|---|
| **0.0** (memoryless) | −2.2 | +0.0045 | +0.0012 | 0.0 pts |
| **0.1** | −1.0 | +0.0031 | +0.0009 | 0.0 pts |
| **0.2** | +3.2 | +0.0019 | 0.0000 | 0.0 pts |
| **0.3** | +9.0 | +0.0008 | −0.0005 | 0.0 pts |
| **0.4** | +11.5 | **−0.0024** | **−0.0021** | 0.0 pts |
| **0.5** | +15.0 | −0.0050 | −0.0033 | 0.0 pts |
| **0.6** | +17.4 | −0.0088 | −0.0051 | 0.0 pts |
| **0.7** (strong) | +20.6 | **−0.0129** | **−0.0060** | 0.0 pts |

> **The takeaway — a crossover, not a free win.** Below ~0.4 the second-order
> model is *slightly worse* (Δ log-loss positive: it chases pair-level noise).
> At and above ~0.4 it wins, and the advantage grows monotonically with real
> structure — from Δ log-loss −0.0024 at 0.4 to −0.0129 at 0.7. Top-1 accuracy
> (the argmax label) never moves, because losses dominate the base rate; the
> gain lives in calibration. The upgrade only earns its place when the signal
> genuinely exists, and the confidence labels say so at every step.

Also note the **sign convention**: for log-loss and Brier, *lower is better*, so a
**negative Δ means the second-order model won**. The sweep is non-saturating —
`streakPersistence` maps smoothly onto the realized conditional gap across the
whole range, so each row injects a genuinely different amount of structure.

---

## 🚀 Quickstart

**Requirements:** Node ≥ 18. Python 3 + `matplotlib`/`numpy` only for charts.

```bash
git clone https://github.com/sophiasummers971-del/Addiction-_breaker.git
cd Addiction-_breaker

# optional — only for the chart scripts
pip install -r requirements.txt

# run everything end-to-end
npm run all
```

### Run it piece by piece

```bash
node scripts/run.js            # cohort, Hook Scores, mirror narratives → output/
python3 scripts/make_report.py # 4 behaviour charts
node scripts/markov2_demo.js   # memoryless baseline  (Δ = 0)
node scripts/streak_demo.js    # injected dependency  (Δ > 0)
node scripts/journal_demo.js   # journal + isolation creep
python3 scripts/make_journal_chart.py
node scripts/sweep.js          # dependency-strength sweep
python3 scripts/make_sweep_chart.py
```

**Zero runtime dependencies.** The engine is pure Node — no `node_modules`, no
build step. Python is needed only to draw charts.

---

## 📂 Repository layout

```
Addiction-_breaker/
├── src/
│   ├── simulate.js     # synthetic event-log generator (archetypes, pressure windows,
│   │                   #   loss-chasing, near-miss effect, streak-persistence knob)
│   ├── model.js        # 1st-order Markov + Hook Score + behavioural metrics
│   ├── markov2.js      # 2nd-order Markov w/ Laplace smoothing, confidence
│   ├── backoff.js      # variable-order gate: pair only above a support threshold
│   ├── truth.js        # recovery math, pressure timeline, mirror narratives
│   └── journal.js      # risk signature, isolation creep, Echoes, nightly prompts
├── scripts/
│   ├── run.js                  # main pipeline
│   ├── markov2_demo.js         # 1st vs 2nd order on memoryless data
│   ├── backoff_demo.js         # gated vs fixed-lambda vs baseline
│   ├── streak_demo.js          # 1st vs 2nd order with injected dependency
│   ├── sweep.js                # dependency-strength sweep
│   ├── journal_demo.js         # journal demo (60-day arc)
│   ├── make_report.py          # behaviour charts
│   ├── make_journal_chart.py   # isolation-creep chart
│   └── make_sweep_chart.py     # sweep chart
├── docs/FINDINGS.md    # full measured results
├── output/             # generated artifacts (JSON + PNG)
├── LICENSE
├── requirements.txt
└── package.json
```

---

## 🔌 Using it on real data

Everything downstream of the generator is unchanged if you swap in real logs.
Shape your events like this:

```js
{
  ts,          // epoch ms
  userId,      // string
  action,      // 'login' | 'deposit' | 'bet' | 'win' | 'loss' | 'near_miss' | 'withdraw' | 'logout'
  stake,       // number, on 'bet'
  payout,      // number, on 'win'
  amount,      // number, on 'deposit' / 'withdraw'
  hour,        // 0–23
  sessionId,   // string
  gapSec       // seconds since the previous event in the session
}
```

```js
const events = loadYourLogs();          // array of the above
const model  = trainMarkov(events);     // or trainMarkov2 for pair-aware
const stats  = analyzeUser(events, 'user-42');
const score  = hookScore(stats);
```

> **Before acting on any individual result:** re-baseline the Hook Score
> thresholds against a verified control group. The numbers here are calibrated
> on synthetic data and are illustrative, not diagnostic.

---

## 🎯 Design philosophy

**1. Explanation over accuracy.** Every prediction ships with a human-readable
reason the harmed user can verify against their own history — *"after a loss you
re-bet within 30 seconds 95% of the time"* — not an opaque score.

**2. Honest confidence.** The second-order model reports `backedOff: true` and
`confidence: 0 [low]` when a pair is unseen, instead of dressing a thin guess as
a prediction. It would rather say *"I don't know"* than be confidently wrong.

**3. Noise is not signal.** `markov2_demo.js` demonstrates the model *refusing*
to beat the first-order baseline on data with no second-order structure. That
result is published, not hidden — a model that "found" signal there would have
been fitting noise.

**4. Confrontation without condemnation.** Every hard sentence in the mirror
narrative is followed by the reason it is the *design*, not the person. The
target is the machinery, never the human caught in it.

---

## 🗺️ Roadmap

- [x] First-order Markov next-action engine + Hook Score
- [x] Financial-pressure entry model (payday/broke-window clustering)
- [x] Recovery Math ("get it back" dismantled in arithmetic)
- [x] Per-user mirror narratives (no sugar-coating)
- [x] Daily journal: pre-relapse signature + isolation creep + Echoes
- [x] Second-order Markov with smoothing + confidence labelling
- [x] Variable-order (confidence-gated) backoff — beats fixed-λ in both regimes
- [ ] Data-driven `minSupport` selection by validation (currently a constant)
- [x] Dependency-strength sweep (payoff curve)
- [ ] Real-data adapters (CSV / common analytics exports)
- [ ] Web front-end: upload your history, get your mirror rendered live
- [ ] Region-aware support-line routing
- [ ] Second-order sweep on *real* anonymised logs

---

## ⚠️ Ethical notice

This project exists to **expose** the mechanics of addictive systems to the
people they are run on.

It is explicitly **not** intended for — and its authors do not consent to its use
in — building, tuning, or operating engagement-optimization, retention-maximizing,
or dark-pattern systems on gambling, gaming, financial-trading, or any other
product that monetizes compulsive behaviour. The interpretability-first design is
a deliberate safeguard against exactly that repurposing.

This is **scaffolding, not therapy.** It makes invisible patterns arguable in the
moment, which is all any tool can do against a mind running on autopilot at 2am.
If you or someone you know is struggling, please reach out to a local support
service — the recovery math is a reason to stop, and support is how.

---

## 📄 License

[MIT](LICENSE) — with an added ethical-use clause in the LICENSE file.

<div align="center">

*Built to hand people back the truth about their own behaviour.*

</div>
