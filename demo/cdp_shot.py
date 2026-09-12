#!/usr/bin/env python3
"""Full-page screenshots via the Chrome DevTools Protocol (stdlib only).

Usage: python3 demo/cdp_shot.py <url> <out.png> [width] [scale]

Launches headless Chrome, waits for window.__READY__, measures the full content
height, and captures a full-page PNG. Used only to produce demo artifacts.
"""
import base64, hashlib, json, os, random, socket, struct, subprocess, sys, time, urllib.request

URL = sys.argv[1]
OUT = sys.argv[2]
WIDTH = int(sys.argv[3]) if len(sys.argv) > 3 else 1500
SCALE = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
PORT = 9222 + random.randint(0, 300)
PROFILE = f"/tmp/cdp-prof-{PORT}"


def http_get(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=5) as r:
        return json.loads(r.read().decode())


def ws_connect(ws_url):
    # ws://host:port/path
    rest = ws_url.split("://", 1)[1]
    hostport, path = rest.split("/", 1)
    host, port = hostport.split(":")
    path = "/" + path
    s = socket.create_connection((host, int(port)))
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    s.send(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += s.recv(4096)
    return s


def ws_send(s, obj):
    data = json.dumps(obj).encode()
    header = bytearray([0x81])  # FIN + text
    mask = os.urandom(4)
    n = len(data)
    if n < 126:
        header.append(0x80 | n)
    elif n < 65536:
        header.append(0x80 | 126)
        header += struct.pack(">H", n)
    else:
        header.append(0x80 | 127)
        header += struct.pack(">Q", n)
    header += mask
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    s.send(bytes(header) + masked)


def _recv_exact(s, n):
    buf = b""
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("socket closed")
        buf += chunk
    return buf


def ws_recv(s):
    b0, b1 = _recv_exact(s, 2)
    length = b1 & 0x7F
    if length == 126:
        length = struct.unpack(">H", _recv_exact(s, 2))[0]
    elif length == 127:
        length = struct.unpack(">Q", _recv_exact(s, 8))[0]
    payload = _recv_exact(s, length)
    return payload.decode("utf-8", "replace")


_id = [0]


def cmd(s, method, params=None, wait=True):
    _id[0] += 1
    mid = _id[0]
    ws_send(s, {"id": mid, "method": method, "params": params or {}})
    if not wait:
        return None
    while True:
        msg = json.loads(ws_recv(s))
        if msg.get("id") == mid:
            return msg


def main():
    chrome = subprocess.Popen(
        [
            "google-chrome", "--headless=new", "--disable-gpu", "--no-sandbox",
            "--hide-scrollbars", "--disable-extensions", "--no-first-run",
            "--disable-background-networking", "--disable-component-update",
            f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}",
            f"--window-size={WIDTH},1200", URL,
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        target = None
        for _ in range(60):
            try:
                for t in http_get("/json"):
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                        target = t
                        break
                if target:
                    break
            except Exception:
                pass
            time.sleep(0.25)
        if not target:
            raise RuntimeError("no chrome page target")

        s = ws_connect(target["webSocketDebuggerUrl"])
        cmd(s, "Page.enable")
        cmd(s, "Runtime.enable")
        # Wait until the app signals it finished rendering.
        for _ in range(80):
            r = cmd(s, "Runtime.evaluate", {"expression": "!!window.__READY__", "returnByValue": True})
            if r.get("result", {}).get("result", {}).get("value") is True:
                break
            time.sleep(0.15)
        time.sleep(0.4)  # allow final paint

        metrics = cmd(s, "Page.getLayoutMetrics")
        css = metrics.get("result", {}).get("cssContentSize") or metrics.get("result", {}).get("contentSize")
        height = int(css["height"]) + 2
        width = int(css["width"]) or WIDTH

        shot = cmd(s, "Page.captureScreenshot", {
            "format": "png",
            "captureBeyondViewport": True,
            "clip": {"x": 0, "y": 0, "width": width, "height": height, "scale": SCALE},
        })
        data = shot["result"]["data"]
        with open(OUT, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"wrote {OUT} ({width}x{height} @ {SCALE}x)")
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except Exception:
            chrome.kill()


if __name__ == "__main__":
    main()
