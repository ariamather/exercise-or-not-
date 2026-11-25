"""Synthesize the two original stereo scores as 48 kHz PCM WAVs."""
import sys
import wave
from pathlib import Path
import numpy as np

RATE = 48000
rng = np.random.default_rng(463)
PI2 = np.pi * 2

def seconds(duration):
    return np.arange(round(RATE * duration)) / RATE

def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)

class Mix:
    def __init__(self, duration):
        self.sound = np.zeros((round(duration * RATE), 2))
    def add(self, start, sound, pan=0):
        first = round(start * RATE)
        count = min(len(sound),len(self.sound) - first)
        if count <= 0:
            return
        gain = np.sqrt([(1 - pan) / 2,(1 + pan) / 2])
        self.sound[first:first + count] += sound[:count, None] * gain
    def write(self, path):
        self.sound *= np.minimum(1, np.arange(len(self.sound)) / (RATE * .012))[:,None]
        self.sound *= np.minimum(1, np.arange(len(self.sound))[::-1] / (RATE * .6))[:,None]
        signal = np.tanh(self.sound * 1.25)
        signal *= .86 / np.max(abs(signal))
        with wave.open(str(path), 'wb') as output:
            output.setparams((2, 2, RATE, 0, 'NONE', 'not compressed'))
            output.writeframes((signal * 32767).astype('<i2').tobytes())

def percussive(freq, duration, decay, harmonics=(1,.27,.10)):
    t = seconds(duration)
    phase = PI2 * freq * t
    wavelet = sum(a * np.sin((i+1) * phase) for i,a in enumerate(harmonics))
    return wavelet * np.minimum(t/.006, 1) * np.exp(-t/decay) * np.clip((duration-t)/.025,0,1)

def roll_score():
    mix = Mix(16.5)
    t = seconds(.40)
    kick = np.sin(PI2*(49*t + 112*.029*(1-np.exp(-t/.029)))) * np.exp(-t/.092) * .74
    t = seconds(.12)
    hiss = rng.normal(0,.65,len(t)); hiss[1:] -= hiss[:-1].copy()
    snare = (.49*hiss+.20*np.sin(PI2*182*t))*np.exp(-t/.034)
    for beat in range(32):
        start = beat / 2
        if beat not in [6,12,17,26,31]:
            mix.add(start,kick)
        if beat%4 in [1,3] and beat!=31:
            mix.add(start,snare,-.04)
        for sub in range(2):
            t = seconds(.085)
            hat = rng.normal(0,.17,len(t))*np.exp(-t/.016) * (.82 if sub else .52)
            mix.add(start+sub*.25,hat, .34 if sub else -.28)
        root = [38,38,41,36][(beat//4)%4]
        if beat<31:
            mix.add(start+.012, .35*percussive(hz(root),.31,.15,(1,.32,.18)),0)
        if beat%2==0:
            for j,n in enumerate([62,69,72]):
                mix.add(start+.24+j*.075,.12*percussive(hz(n+(0 if beat%8<4 else -2)),.3,.082),-.3+.3*j)
    # Faint dry die clacks and a pitched landing chord follow the picture cuts.
    for start in [2.74,2.92,3.07,3.19,6.49,6.59,6.66,10.35,11.8]:
        t=seconds(.075)
        mix.add(start,(rng.uniform(-.35,.35,len(t))+.35*np.sin(PI2*1380*t))*np.exp(-t/.012),.21)
    for start in [6.5,13.5,15.45]:
        for j,n in enumerate([62,66,69,74]):
            mix.add(start+.035*j,.18*percussive(hz(n),.72,.19),-.40+j*.25)
    return mix

def felt(note, duration=2.5):
    t=seconds(duration); f=hz(note)
    body=np.zeros(len(t))
    for harmonic,gain in [(1,1),(2,.33),(3,.13),(4,.057),(6,.025)]:
        partial=f*harmonic*(1+.00029*harmonic*harmonic)
        tone=.58*np.sin(PI2*partial*t)+.42*np.sin(PI2*partial*1.0009*t)
        body+=gain*tone*np.exp(-t*(1.15+harmonic*.22))
    return body*(1-np.exp(-t/.009))*np.clip((duration-t)/.18,0,1)

def journal_score():
    mix=Mix(22)
    chords=[[50,57,62,65,69],[46,53,58,62,65],[48,55,60,64,67],
            [45,52,57,60,64],[50,57,62,65,69]]
    for i,start in enumerate([.08,4.43,9.03,14.13,18.53]):
        notes=chords[i]
        for j,(off,idx) in enumerate([(0,0),(.19,1),(.54,3),(1.05,2),(1.69,4),(2.57,3)]):
            sample=felt(notes[idx],3.2)
            level=.26 if j==0 else [.15,.17,.18][j%3]
            pan=[-.25,.2,.28,-.21,.07,.34][j]
            mix.add(start+off,level*sample,pan)
            mix.add(start+off+.082,level*.16*sample,-pan)
            mix.add(start+off+.187,level*.075*sample,.26)
    # Brushed paper at the page turns, and a soft pencil stroke on the last set.
    for start,dur,level in [(4.4,.32,.039),(6,.48,.014),(9,.31,.036),(14.1,.31,.032),(18.5,.31,.037)]:
        t=seconds(dur); n=rng.normal(0,1,len(t));n=np.convolve(n,np.ones(6)/6,mode='same')
        mix.add(start,n*np.sin(np.pi*t/dur)**1.4*level,-.23)
    return mix

if __name__=='__main__':
    output=Path(sys.argv[1])
    output.mkdir(parents=True,exist_ok=True)
    for name,make in [('draw',roll_score),('journal',journal_score)]:
        make().write(output/(name+'.wav'))
