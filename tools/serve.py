# 로컬 개발 서버 (캐시 끔): python tools/serve.py [port]
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5527
    http.server.ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
