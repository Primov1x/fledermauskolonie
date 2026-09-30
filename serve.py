"""Lokaler Testserver ohne Cache, damit nach jeder Änderung die neue Version lädt: python serve.py 8933"""
import functools
import http.server
import mimetypes
import os
import sys

mimetypes.add_type('application/manifest+json', '.webmanifest')


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8933
handler = functools.partial(NoStore, directory=os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
