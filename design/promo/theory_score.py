"""Original chamber cue for the ticket, counterfactual, coin study and app sequence."""
import sys
from pathlib import Path
import numpy as np
from score import Mix, seconds, hz, felt, percussive, PI2

def compose():
    mix=Mix(49.5)
    rng=np.random.default_rng(719)
    # A questioning two-note interval returns with a different answer each time.
    phrases=[(0,[50,57,64]),(4.5,[46,53,60]),(9.4,[48,55,62]),(14.5,[45,52,59]),
             (17.6,[46,53,60]),(20.8,[50,57,64]),(25.4,[48,55,62]),(28.7,[46,53,60]),
             (31.8,[45,52,64]),(34,[50,57,62]),(38,[48,55,64]),(40.4,[46,53,62]),
             (44.4,[48,55,64]),(47.0,[50,57,62])]
    for start,chord in phrases:
        for j,n in enumerate(chord):
            note=felt(n,2.7)
            mix.add(start+j*.34,note*(.17 if j==0 else .115),-.27+j*.23)
            mix.add(start+j*.34+.13,note*.020,.23-j*.22)
        t=seconds(2.9)
        mix.add(start,.076*np.sin(np.pi*t/2.9)**1.45*np.sin(PI2*hz(chord[0]-12)*t))
    # Small musical cue from the imagined stage.
    for start,n in [(10.1,74),(10.65,77),(11.7,76),(12.35,69)]:
        t=seconds(.85)
        sample=np.sin(PI2*hz(n)*t+.018*np.sin(PI2*5.1*t))
        mix.add(start,sample*.086*np.sin(np.pi*t/.85)**1.65,.3)
    for start in [4.4,9.32,14.42,29.1,30.0,31.1]:
        t=seconds(.24)
        noise=np.convolve(rng.normal(size=len(t)),np.ones(7)/7,mode='same')
        mix.add(start,.105*noise*np.sin(np.pi*t/.24)**1.6,-.16)
    for j in range(10):
        at=23.04+j*.19
        mix.add(at,.085*percussive(hz(84+j%5),.23,.048,(1,.33,.09)),.38-j*.055)
    for at,n,vol in [(25.4,81,.21),(25.51,86,.13),(36.8,76,.18),(37.56,66,.27),(38.15,63,.19),(39.6,65,.13),(45.85,78,.17)]:
        t=seconds(.16)
        sample=(np.sin(PI2*hz(n)*t)+.43*np.sin(PI2*hz(n)*2.31*t)+rng.normal(0,.28,len(t)))*np.exp(-t/.023)
        mix.add(at,vol*sample,.10)
    return mix

if __name__=='__main__':
    dest=Path(sys.argv[1]);dest.parent.mkdir(parents=True,exist_ok=True)
    compose().write(dest)
