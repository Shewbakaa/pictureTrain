# Static file server for previewing the site, the e2e tests and the screenshots. Like `python3 -m http.server`
# (same arguments), with two differences that matter here:
#
# - It answers byte-range requests (206 Partial Content). Safari, and every iPhone browser, will only play a video
#   from a server that does, so without this a video moment would never play in a local preview on an iPhone.
# - Its listen backlog is big enough for several browsers loading the site's ES modules at once. With the default
#   backlog of 5, parallel Playwright workers get connections reset (net::ERR_CONNECTION_RESET) and a page whose
#   module fails to load never starts.
#
#   python3 scripts/serve.py 4317 --bind 127.0.0.1
#   python3 scripts/serve.py 8080 --directory site --bind 0.0.0.0
import argparse
import functools
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE = re.compile(r'bytes=(\d*)-(\d*)$')


class RangeRequestHandler(SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler that also serves a single byte range of a file."""

    range_remaining = None

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        wanted = self.headers.get('Range')
        path = self.translate_path(self.path)
        if not wanted or os.path.isdir(path):
            return super().send_head()
        match = RANGE.match(wanted.strip())
        if not match:
            return super().send_head()
        try:
            source = open(path, 'rb')
        except OSError:
            self.send_error(404, 'File not found')
            return None
        size = os.fstat(source.fileno()).st_size
        first, last = match.groups()
        if first == '':
            if last == '':
                source.close()
                return super().send_head()
            start, end = max(0, size - int(last)), size - 1  # the last N bytes
        else:
            start, end = int(first), min(int(last), size - 1) if last else size - 1
        if start >= size or start > end:
            source.close()
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        source.seek(start)
        self.range_remaining = end - start + 1
        return source

    def copyfile(self, source, outputfile):
        remaining, self.range_remaining = self.range_remaining, None
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


class Server(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True

    def handle_error(self, request, client_address):
        # A browser hangs up partway through a file whenever it no longer wants the rest: a song it has buffered
        # enough of, one it has switched away from, a video it seeks in. That is normal, not a fault worth a traceback.
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


def main():
    parser = argparse.ArgumentParser(description='Serve a folder over HTTP, with byte-range support.')
    parser.add_argument('port', nargs='?', type=int, default=8000)
    parser.add_argument('--bind', '-b', default='127.0.0.1')
    parser.add_argument('--directory', '-d', default=os.getcwd())
    args = parser.parse_args()
    handler = functools.partial(RangeRequestHandler, directory=args.directory)
    with Server((args.bind, args.port), handler) as server:
        print(f'Serving {args.directory} at http://{args.bind}:{args.port}/', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
