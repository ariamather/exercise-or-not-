"""Original cue for the decision film, timed to the toss, landing and last question."""
import sys
from pathlib import Path
import numpy as np
from score import Mix, seconds, hz, percussive, felt, PI2

def make_score():
    mix = Mix(48)
    noise = np.random.default_rng(2019)
    phrases = [(0, [50, 57, 62, 65]), (5.6,[46,53,60,65]),
               (11.2,[45,52,59,64]),(18,[50,57,60,64]),
               (21.2,[48,55,62,64]),(25.4,[46,53,57,62]),(29.6,[50,57,60,65]),
               (33.6,[48,55,60,64]),(37.6,[46,53,60,65]),(41,[48,55,60,67]),
               (44.2,[50,57,62,69])]
    for i,(start,notes) in enumerate(phrases):
        duration = min(4.1,48-start)
        for j,n in enumerate(notes):
            # Space in the middle of the phrase leaves the die landing exposed.
            off = [0,.32,1.08,1.83][j]
            sample = felt(n, min(3.1,duration))
            level = (.16 if j==0 else .105) * (.7 if i==2 else 1)
            mix.add(start+off,level*sample,(j-1.5)*.22)
            mix.add(start+off+.18,level*.16*sample,(1.5-j)*.22)
        t = seconds(duration)
        env = np.sin(np.pi*t/duration)**1.6
        pad = np.sin(PI2*hz(notes[0]-12)*t+.12*np.sin(t*1.35))
        mix.add(start,.145*env*pad)
    for i in range(13):
        at=11.45+i*.24
        mix.add(at,.12*percussive(hz(69+i%4),.22,.044),-.45+i*.06)
    for at,amp in [(15.2,.58),(15.32,.33),(15.48,.19),(15.71,.09),(24.95,.18),(45.35,.15)]:
        t=seconds(.14)
        wood=(np.sin(PI2*632*t)+.57*np.sin(PI2*1490*t)+noise.normal(0,.4,len(t)))
        mix.add(at,amp*wood*np.exp(-t/.018),.15)
    for at,n in [(30.1,62),(30.6,69),(32.8,74),(39.4,65),(40.1,69),(45.65,74)]:
        mix.add(at,.115*percussive(hz(n),1.5,.29,(1,.26,.07)),.25)
    for at in [38.85,40.25]:
        t=seconds(.36);brush=np.convolve(noise.normal(size=len(t)),np.ones(9)/9,mode='same')
        mix.add(at,.09*np.sin(np.pi*t/.36)**2*brush,-.18)
    return mix

if __name__=='__main__':
    dest=Path(sys.argv[1])
    dest.parent.mkdir(parents=True,exist_ok=True)
    make_score().write(dest)
