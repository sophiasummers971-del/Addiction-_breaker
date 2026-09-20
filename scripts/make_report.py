import os; os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
"""Render the visual truth report from report_data.json."""
import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

data = json.load(open('output/report_data.json'))
profiles = data['profiles']
casual = [p for p in profiles if p['archetype'] == 'casual']
pattern = [p for p in profiles if p['archetype'] == 'addicted-pattern']

plt.rcParams.update({'figure.facecolor': '#0e1117', 'axes.facecolor': '#0e1117',
                     'axes.edgecolor': '#444', 'text.color': '#e6e6e6',
                     'axes.labelcolor': '#e6e6e6', 'xtick.color': '#ccc',
                     'ytick.color': '#ccc', 'font.size': 11})
RED, BLUE = '#ff5964', '#4ecdc4'

# ---- Chart 1: Hook score by user ----
fig, ax = plt.subplots(figsize=(10, 5))
names = [p['userId'] for p in profiles]
scores = [p['hookScore'] for p in profiles]
colors = [RED if p['archetype'] == 'addicted-pattern' else BLUE for p in profiles]
ax.bar(names, scores, color=colors)
ax.axhline(30, color='#ffb347', ls='--', lw=1.5)
ax.text(0.2, 32, 'elevated-risk threshold', color='#ffb347')
ax.set_title('Hook Score per user — how hard the algorithm is working them')
ax.set_ylabel('Hook score (0–100)')
plt.xticks(rotation=45, ha='right')
plt.tight_layout(); plt.savefig('output/chart_hook.png', dpi=140); plt.close()

# ---- Chart 2: Loss-chasing ----
fig, ax = plt.subplots(figsize=(8, 5))
groups = ['Casual users', 'Addicted-pattern users']
after_loss = [np.mean([p['lossChase']['pReBetAfterLoss30s'] for p in casual]),
              np.mean([p['lossChase']['pReBetAfterLoss30s'] for p in pattern])]
after_win = [np.mean([p['lossChase']['pReBetAfterWin30s'] for p in casual]),
             np.mean([p['lossChase']['pReBetAfterWin30s'] for p in pattern])]
x = np.arange(2); w = 0.35
ax.bar(x - w/2, after_loss, w, label='Re-bet ≤30s after a LOSS', color=RED)
ax.bar(x + w/2, after_win, w, label='Re-bet ≤30s after a WIN', color=BLUE)
ax.set_xticks(x); ax.set_xticklabels(groups)
ax.set_ylim(0, 1); ax.set_ylabel('Probability')
ax.set_title('Loss-chasing: the re-bet reflex after losses vs wins')
ax.legend(facecolor='#1a1d24', labelcolor='#e6e6e6')
for i, v in enumerate(after_loss): ax.text(i - w/2, v + 0.02, f'{v:.0%}', ha='center', color=RED)
for i, v in enumerate(after_win): ax.text(i + w/2, v + 0.02, f'{v:.0%}', ha='center', color=BLUE)
plt.tight_layout(); plt.savefig('output/chart_losschase.png', dpi=140); plt.close()

# ---- Chart 3: Stake escalation ----
fig, ax = plt.subplots(figsize=(8, 5))
for grp, label, color in [(casual, 'Casual', BLUE), (pattern, 'Addicted-pattern', RED)]:
    xs, ys = [], []
    for k in ['0', '1', '2', '3']:
        vals = [p['avgStakeByConsecutiveLosses'].get(k) for p in grp]
        vals = [v for v in vals if v]
        if vals: xs.append(int(k)); ys.append(np.mean(vals))
    ax.plot(xs, ys, marker='o', label=label, color=color, lw=2.5)
ax.set_xlabel('Consecutive losses before the bet')
ax.set_ylabel('Average stake ($)')
ax.set_title('Stake escalation: bets grow as losses pile up')
ax.legend(facecolor='#1a1d24', labelcolor='#e6e6e6')
plt.tight_layout(); plt.savefig('output/chart_stakes.png', dpi=140); plt.close()

# ---- Chart 4: Actual RTP experienced ----
fig, ax = plt.subplots(figsize=(8, 5))
rtp_c = [p['actualRTP'] for p in casual]; rtp_p = [p['actualRTP'] for p in pattern]
ax.boxplot([rtp_c, rtp_p], tick_labels=['Casual', 'Addicted-pattern'],
           boxprops=dict(color='#888'), medianprops=dict(color='#ffb347', lw=2),
           whiskerprops=dict(color='#888'), capprops=dict(color='#888'),
           flierprops=dict(markerfacecolor=RED, marker='o'))
for i, v in enumerate(rtp_c): ax.scatter(1 + np.random.uniform(-.08, .08), v, color=BLUE, zorder=3)
for i, v in enumerate(rtp_p): ax.scatter(2 + np.random.uniform(-.08, .08), v, color=RED, zorder=3)
ax.set_ylabel('Actual return-to-player experienced (%)')
ax.set_title('The money truth: what users actually got back')
plt.tight_layout(); plt.savefig('output/chart_rtp.png', dpi=140); plt.close()

print('charts done')
print('avg RTP casual:', round(np.mean(rtp_c),1), '| pattern:', round(np.mean(rtp_p),1))
print('losschase after loss — casual:', round(after_loss[0],3), 'pattern:', round(after_loss[1],3))
