# Contributing

Thanks for caring about this. Before anything else, read the **Ethical notice**
in the README — it is a hard constraint, not decoration. If your idea makes the
engine better at *targeting*, *ranking*, or *retaining* vulnerable users, it is
out of scope and will be declined regardless of code quality.

## What this project is (and isn't)

**Is:** an interpretable engine that shows people the mechanics of the systems
working on them. Every claim must be checkable by the person it describes.

**Isn't:** a prediction service, a risk-scoring API, or an engagement tool.
Nothing here should ever be used to decide something *about* a person without
their knowledge and consent.

## Design rules (yes, these are enforced in review)

1. **Explainability over accuracy.** A more accurate model that cannot tell the
   user *why* is not an improvement. Prefer a readable model with a confidence
   label to an opaque one with a higher score.
2. **Never dress a thin guess as a prediction.** If support is low, return
   `backedOff: true` and a low confidence. Silence beats confident nonsense.
3. **Publish negative results.** If an upgrade does not beat the baseline, say so
   in `docs/FINDINGS.md` — the flat sweep result is already there on purpose.
4. **Confront the design, never the person.** Mirror text names the mechanic
   ("this is the re-bet reflex, engineered") and never characterises the user
   ("you are weak"). Keep that register.
5. **No silent constants.** If you tune a number, say in a comment what it means
   and what happens at its extremes.

## Getting set up

```bash
git clone https://github.com/sophiasummers971-del/Addiction-_breaker.git
cd Addiction-_breaker
pip install -r requirements.txt   # only needed for charts
npm run all                       # runs the full pipeline
```

**Zero runtime dependencies** — pure Node, no `node_modules`, no build step.
Please keep it that way; a new dependency needs a strong justification.

## Repo layout

- `src/` — the engines. Adding a metric? It goes here, with a test that shows
  it separating the two archetypes.
- `scripts/` — runnable entry points. Each should be runnable standalone.
- `docs/FINDINGS.md` — measured results only. Regenerate from the JSON in
  `output/`, never hand-type a number.
- `output/` — generated artifacts (committed so the README renders).

## Submitting a change

1. Run `npm run all` and confirm it exits clean.
2. If you changed behaviour, update `docs/FINDINGS.md` from the real output.
3. If you changed a metric, explain in the PR what it measures and why it is
   more honest than what it replaces.
4. Small, focused PRs. One idea per PR.

## Priority work

See the roadmap in the README. Most-wanted right now:

- Variable-order backoff (consult the pair only above a confidence bar)
- Real-data adapters (CSV / common analytics exports)
- Real-data validation of the streak-persistence threshold

## Code of conduct

Be decent. This project touches addiction — many contributors and users have
lived experience. No shaming, no "just stop" advice, no moralising.
