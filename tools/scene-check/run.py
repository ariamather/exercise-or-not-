"""Runs the scene contract checks (check.js) in headless Chrome, one page per scene.

    python3 -I tools/scene-check/run.py            every folder under assets/chance/scenes
    python3 -I tools/scene-check/run.py cup        one scene
    python3 -I tools/scene-check/run.py --pace user cup

Talks to Chrome over the DevTools protocol with the standard library only, so the animations
run in real time. Chrome's profile goes to scratch/scene-check/, which is not committed.
"""
import argparse
import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlencode

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
SCENES = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'chance', 'scenes')
PREVIEW = 'file://' + os.path.join(ROOT, 'design', 'chance-preview', 'index.html')
WORK = os.path.join(ROOT, 'scratch', 'scene-check')
PORT = 9339


class DevTools:
    """A minimal WebSocket client: enough for request/response CDP calls."""

    def __init__(self, url):
        host, rest = url[len('ws://'):].split('/', 1)
        name, port = host.split(':')
        self.sock = socket.create_connection((name, int(port)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((
            f'GET /{rest} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        response = b''
        while b'\r\n\r\n' not in response:
            response += self.sock.recv(4096)
        if b' 101 ' not in response.split(b'\r\n', 1)[0]:
            raise RuntimeError('websocket handshake failed: ' + response.decode(errors='replace'))
        self.buffer = response.split(b'\r\n\r\n', 1)[1]
        self.next_id = 0

    def _read(self, n):
        while len(self.buffer) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError('devtools connection closed')
            self.buffer += chunk
        out, self.buffer = self.buffer[:n], self.buffer[n:]
        return out

    def _send(self, text):
        data = text.encode()
        mask = os.urandom(4)
        n = len(data)
        head = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else
                                bytes([0x80 | 126]) + struct.pack('>H', n) if n < 65536 else
                                bytes([0x80 | 127]) + struct.pack('>Q', n))
        self.sock.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _recv(self):
        message = b''
        while True:
            b0, b1 = self._read(2)
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack('>H', self._read(2))[0]
            elif n == 127:
                n = struct.unpack('>Q', self._read(8))[0]
            payload = self._read(n)
            if b0 & 0x0F in (0x1, 0x0):
                message += payload
                if b0 & 0x80:
                    return message.decode()

    def call(self, method, **params):
        self.next_id += 1
        self._send(json.dumps({'id': self.next_id, 'method': method, 'params': params}))
        while True:
            m = json.loads(self._recv())
            if m.get('id') == self.next_id:
                if 'error' in m:
                    raise RuntimeError(f'{method}: {m["error"]}')
                return m.get('result', {})

    def evaluate(self, expression):
        r = self.call('Runtime.evaluate', expression=expression, returnByValue=True)
        return r.get('result', {}).get('value')


def page_socket():
    for _ in range(100):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/list') as r:
                for target in json.load(r):
                    if target.get('type') == 'page':
                        return target['webSocketDebuggerUrl']
        except OSError:
            pass
        time.sleep(.1)
    raise RuntimeError('Chrome did not open a debuggable page')


def check(devtools, scene, pace, limit_s):
    params = {'scene': scene, 'check': ''}
    if pace is not None:
        params['pace'] = pace
    devtools.call('Page.navigate', url=f'{PREVIEW}?{urlencode(params)}')
    deadline = time.time() + limit_s
    while time.time() < deadline:
        time.sleep(.5)
        report = devtools.evaluate(
            "(r => r && [r.dataset.status, r.textContent])(document.getElementById('check-result'))")
        if report:
            return report
    return ['fail', f'FAIL scene={scene}\nFAIL no report within {limit_s} s']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('scenes', nargs='*')
    parser.add_argument('--pace', choices=['timed', 'user'], help='override the registered pace')
    parser.add_argument('--limit', type=int, help='seconds per scene')
    parser.add_argument('--reduced-motion', action='store_true', help='test the reduced-motion reveal')
    args = parser.parse_args()
    scenes = args.scenes or sorted(d for d in os.listdir(SCENES) if os.path.isdir(os.path.join(SCENES, d)))

    os.makedirs(WORK, exist_ok=True)
    with open(os.path.join(WORK, 'chrome.log'), 'w') as log:
        chrome = subprocess.Popen([
            CHROME, '--headless=new', f'--remote-debugging-port={PORT}', '--remote-allow-origins=*',
            f'--user-data-dir={os.path.join(WORK, "profile")}', '--no-first-run', '--no-default-browser-check',
            '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--allow-file-access-from-files',
            '--window-size=390,760', '--hide-scrollbars', 'about:blank',
        ], stdout=log, stderr=log)
        try:
            devtools = DevTools(page_socket())
            devtools.call('Page.enable')
            if args.reduced_motion:
                devtools.call('Emulation.setEmulatedMedia', features=[
                    {'name': 'prefers-reduced-motion', 'value': 'reduce'},
                ])
            passed = True
            for scene in scenes:
                # The slot machine has 216 distinct landings, each with a three-reel animation.
                limit_s = args.limit or (1200 if scene == 'slot' else 240)
                status, text = check(devtools, scene, args.pace, limit_s)
                print(text, end='\n\n', flush=True)
                passed &= status == 'pass'
            return 0 if passed else 1
        finally:
            chrome.terminate()
            chrome.wait(10)


if __name__ == '__main__':
    sys.exit(main())
