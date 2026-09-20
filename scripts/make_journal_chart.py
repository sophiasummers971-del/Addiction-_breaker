import os; os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
entries = json.load(open('output/journal_entries.json'))
dates = [e['date'] for e in entries]
x = list(range(len(entries)))
urge = [e['urge'] for e in entries]
lonely = [e['loneliness'] for e in entries]
social = [e['social'] for e in entries]
played = [i for i,e in enumerate(entries) if e['played']]
plt.rcParams.update({'figure.facecolor':'#0e1117','axes.facecolor':'#0e1117','axes.edgecolor':'#444',
 'text.color':'#e6e6e6','axes.labelcolor':'#e6e6e6','xtick.color':'#ccc','ytick.color':'#ccc','font.size':11})
fig, ax = plt.subplots(figsize=(12,6))
ax.plot(x, urge, color='#ff5964', lw=2.2, label='Urge to gamble')
ax.plot(x, lonely, color='#ffb347', lw=2.2, label='Loneliness')
ax.plot(x, social, color='#4ecdc4', lw=2.2, label='Meaningful social contact')
for i in played:
    ax.axvline(i, color='#ff2d55', ls=':', lw=1.6, alpha=.8)
    ax.text(i, 10.4, 'slip', color='#ff2d55', fontsize=8, rotation=90, va='top', ha='right')
ax.set_ylim(-0.5, 11)
ax.set_xlabel('Day of journal')
ax.set_ylabel('Intensity (0-10)')
ax.set_title('The Isolation Creep: urge and loneliness climb as contact falls')
ax.legend(facecolor='#1a1d24', labelcolor='#e6e6e6', loc='center left')
plt.tight_layout(); plt.savefig('output/chart_journal_creep.png', dpi=140); plt.close()
print('chart saved')
