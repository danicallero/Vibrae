import http.server
import socketserver
import os

PORT = 8090
DIRECTORY = "front/dist"

class SPARequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            self.path = '/index.html'
            return self.do_GET()
        return super().send_error(code, message, explain)

Handler = SPARequestHandler

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"Serving at http://0.0.0.0:{PORT}")
    httpd.serve_forever()
