"""
VORTEX backend entry point.

    python run.py            # http://localhost:5050

The default is 5050 rather than Flask's usual 5000 because on macOS Control
Center's AirPlay Receiver owns 5000. If 5050 is busy, pick another and tell the
frontend's dev proxy where to look:

    PORT=5051 python run.py
    VITE_API_URL=http://127.0.0.1:5051 npm run dev
"""

import os
import socket
import sys

from app import config, create_app
from app.db import db_status

app = create_app()


def _port_is_free(host, port):
    """True when nothing is already listening on the port."""
    target = "127.0.0.1" if host in ("0.0.0.0", "") else host
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        # A successful connect means somebody else already owns the port.
        return sock.connect_ex((target, port)) != 0


if __name__ == "__main__":
    # The debug reloader re-executes this file in a child process while the
    # parent already owns the socket — banner and preflight belong to the
    # first run only.
    reloading = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    status = db_status()
    print("=" * 68)
    print("  VORTEX API  |  SIH26006  |  East Coast Freight Intelligence")
    print("=" * 68)

    if not reloading and not _port_is_free(config.HOST, config.PORT):
        print(f"  Port {config.PORT} is already in use.")
        if config.PORT == 5000 and sys.platform == "darwin":
            print("  On macOS this is usually Control Center's AirPlay Receiver.")
            print("  Either turn it off in System Settings > General > AirDrop & Handoff,")
            print("  or start on another port:")
        else:
            print("  Start on another port:")
        print(f"      PORT={config.PORT + 1} python run.py")
        print("  and point the frontend's dev proxy at it:")
        print(f"      VITE_API_URL=http://127.0.0.1:{config.PORT + 1} npm run dev")
        print("=" * 68)
        sys.exit(1)

    print(f"  Listening on : http://localhost:{config.PORT}")
    print(f"  Storage      : {status['backend']} — {status['detail']}")
    print(f"  Health check : http://localhost:{config.PORT}/api/health")
    print("=" * 68)
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
