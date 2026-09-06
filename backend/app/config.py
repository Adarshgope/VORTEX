"""VORTEX backend configuration."""

import os
from pathlib import Path
from urllib.parse import quote_plus

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _load_env_file(path=_ENV_FILE):
    """
    Read KEY=VALUE lines out of backend/.env without pulling in python-dotenv,
    so the app still starts on a bare `pip install flask` environment.

    Real environment variables win, so `MONGO_URI=... python run.py` still
    overrides whatever the file says.
    """
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()

# ---------------------------------------------------------------------------
# MongoDB Atlas. Put the real values in backend/.env (gitignored) — never here.
#
#   MONGO_URI=mongodb+srv://<user>:<db_password>@clusternew.o41rkap.mongodb.net/
#   MONGO_PASSWORD=the-atlas-password
#
# The literal <db_password> placeholder Atlas hands you is substituted with
# MONGO_PASSWORD, URL-escaped, so a password containing @ : / # still works.
# Leave MONGO_URI empty and the app runs on the in-memory store, so the whole
# platform stays demo-ready without a database.
# ---------------------------------------------------------------------------
MONGO_URI = os.environ.get("MONGO_URI", "")
MONGO_PASSWORD = os.environ.get("MONGO_PASSWORD", "")

if MONGO_URI and MONGO_PASSWORD:
    MONGO_URI = MONGO_URI.replace("<db_password>", quote_plus(MONGO_PASSWORD))

MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "user-info")
MONGO_USERS_COLLECTION = os.environ.get("MONGO_USERS_COLLECTION", "user-details")

PORT = int(os.environ.get("PORT", 5000))
HOST = os.environ.get("HOST", "0.0.0.0")
DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"

SECRET_KEY = os.environ.get("SECRET_KEY", "vortex-sih26006-dev-secret")
TOKEN_TTL_HOURS = 12

CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
).split(",")
