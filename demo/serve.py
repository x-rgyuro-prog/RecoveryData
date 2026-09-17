#!/usr/bin/env python3
"""Tiny static server that disables caching, so refreshes always get the latest
build. Serves the demo/ directory.

Usage: python3 demo/serve.py [port]
"""
import sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("0.0.0.0", PORT), NoCacheHandler).serve_forever()
