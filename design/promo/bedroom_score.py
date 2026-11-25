"""Music and foley for the bedroom. A three-note phone clip loops until the screen sleeps."""
import sys
from pathlib import Path
import numpy as np
from score import Mix, felt, hz, percussive, seconds, PI2

def make_score():
    mix = Mix(48)
    random = np.random.default_rng(4206)
    def brush(start, duration, level, pan):
        t=seconds(duration)
        noise=np.convolve(random.normal(size=len(t)),np.ones(12)/12,mode='same')
        mix.add(start,level*np.sin(np.pi*t/duration)**1.7*noise,pan)
    def knock(start, note, level, length=.14):
        t=seconds(length)
        click=np.sin(PI2*hz(note)*t)+.37*np.sin(PI2*hz(note)*2.33*t)
        mix.add(start,level*(click+.26*random.normal(size=len(t)))*np.exp(-t/.016),.10)
    # Warm sustained room tone and widely spaced notes. At the landing the room holds its breath.
    for start,chord in [(0,[50,57,65]),(5.1,[46,53,60]),(9.5,[48,55,64]),(14.2,[45,52,60]),
                        (21,[50,57,65]),(25.5,[46,53,62]),(28.6,[45,52,64]),
                        (36.05,[50,57,62]),(39.4,[46,53,65]),(42.2,[48,55,64]),(45,[50,57,62])]:
        for j,n in enumerate(chord):
            sample=felt(n,2.8)
            mix.add(start+j*.24,(.15 if j==0 else .075)*sample,(-1+j)*.32)
            mix.add(start+j*.24+.16,.018*sample,(1-j)*.3)
    for at in [1.05,5.65,11.2,16.0]:
        for i,n in enumerate([78,76,71]):
            mix.add(at+i*.18,.089*percussive(hz(n),.22,.058,(1,.38,.12)),.32)
        brush(at-.1,.18,.085,.3)
    for at in [2.1,6.7,9.2,13.7,15.2,38.5,39.3,40.1]:
        brush(at,.56,.12,-.15)
    knock(10.08,50,.15)
    knock(30.95,82,.17)
    for i in range(11):
        at=31.15+i*.23
        mix.add(at,.067*percussive(hz(71+i%4),.12,.031),-.3+i*.05)
    for at,vol,n in [(34.05,.49,77),(34.17,.22,74),(34.36,.082,72),(39.5,.13,53),(42.05,.18,54),(44.45,.28,88)]:
        knock(at,n,vol)
    return mix

if __name__=='__main__':
    dest=Path(sys.argv[1]);dest.parent.mkdir(parents=True,exist_ok=True)
    make_score().write(dest)
