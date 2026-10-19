# Static file server for the e2e tests and screenshots: exactly `python3 -m http.server` (same arguments), but
# with a listen backlog big enough for several browsers loading the site's ES modules at once. With the default
# backlog of 5, parallel Playwright workers get connections reset (net::ERR_CONNECTION_RESET) and a page whose
# module fails to load never starts.
#
#   python3 scripts/serve.py 4173 --bind 127.0.0.1
import runpy
import socketserver
import sys

socketserver.TCPServer.request_queue_size = 128
sys.argv = ['http.server', *sys.argv[1:]]
runpy.run_module('http.server', run_name='__main__', alter_sys=True)
