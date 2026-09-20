"""Render the dependency-strength sweep chart from output/sweep_results.json."""
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

rows = json.load(open('output/sweep_results.json'))
p = [r['persist'] for r in rows]
raised = [r['raised'] for r in rows]
dLL = [r['dLL'] for r in rows]
dBR = [r['dBR'] for r in rows]
dAcc = [r['dAcc'] for r in rows]

plt.rcParams.update({'figure.facecolor': '#0e1117', 'axes.facecolor': '#0e1117',
                     'axes.edgecolor': '#444', 'text.color': '#e6e6e6',
                     'axes.labelcolor': '#e6e6e6', 'xtick.color': '#ccc',
                     'ytick.color': '#ccc', 'font.size': 11})
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5))

# Panel 1: the ground truth — how much structure exists
ax1.plot(p, raised, marker='o', color='#ffb347', lw=2.5)
ax1.set_xlabel('streakPersistence (injected dependency strength)')
ax1.set_ylabel('P(loss | prev loss) − P(loss | prev win)   [points]')
ax1.set_title('How much real 2nd-order structure exists')
ax1.axhline(0, color='#666', ls='--', lw=1)
for x, y in zip(p, raised):
    ax1.annotate(f'{y:.1f}', (x, y), textcoords='offset points', xytext=(0, 9), ha='center', color='#ffb347', fontsize=9)

# Panel 2: the payoff — model advantage vs dependency strength
ax2.axhline(0, color='#666', ls='--', lw=1)
ax2.plot(p, [v * 100 for v in dLL], marker='o', color='#ff5964', lw=2.5, label='Δ log-loss ×100 (lower=fewer errors)')
ax2.plot(p, [v * 100 for v in dBR], marker='s', color='#4ecdc4', lw=2.5, label='Δ Brier ×100 (lower=better calibrated)')
ax2.plot(p, dAcc, marker='^', color='#c77dff', lw=2.5, label='Δ top-1 accuracy (points)')
ax2.set_xlabel('streakPersistence (injected dependency strength)')
ax2.set_ylabel('2nd-order advantage over 1st-order')
ax2.set_title('Does the 2nd-order upgrade pay off?')
ax2.legend(facecolor='#1a1d24', labelcolor='#e6e6e6', fontsize=9)

plt.tight_layout()
plt.savefig('output/chart_sweep.png', dpi=140)
print('wrote output/chart_sweep.png')
