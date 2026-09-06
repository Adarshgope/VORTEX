"""Salted-hash credentials and signed session tokens (stdlib only)."""

import base64
import hashlib
import hmac
import json
import os
import time

from .. import config
from ..db import collection, utcnow

_ITERATIONS = 120_000

# Where user documents live in Atlas — see MONGO_USERS_COLLECTION in .env.
USER_COLLECTION = config.MONGO_USERS_COLLECTION


def hash_password(password, salt=None):
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password, stored):
    try:
        _algo, iterations, salt, digest = stored.split("$")
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations))
        return hmac.compare_digest(check.hex(), digest)
    except (ValueError, AttributeError):
        return False


def _b64(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(email):
    payload = {"sub": email, "exp": int(time.time()) + config.TOKEN_TTL_HOURS * 3600}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(config.SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token):
    """Return the payload for a valid unexpired token, else None."""
    try:
        body, sig = token.split(".")
        expected = _b64(hmac.new(config.SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_unb64(body))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def register_user(email, password, name, company="", role="Chartering Manager"):
    users = collection(USER_COLLECTION)
    email = (email or "").strip().lower()

    if users.find_one({"email": email}):
        return None, "An account already exists for this email."

    doc = {
        "email": email,
        "name": name.strip(),
        "company": company.strip(),
        "role": role,
        "password": hash_password(password),
        "created_at": utcnow().isoformat(),
    }
    users.insert_one(doc)
    return public_user(doc), None


def authenticate(email, password):
    users = collection(USER_COLLECTION)
    email = (email or "").strip().lower()
    user = users.find_one({"email": email})

    # Demo account, always available so the dashboard can be opened cold.
    if not user and email == "demo@vortex.in" and password == "vortex2026":
        user = {"email": email, "name": "Demo Charterer", "company": "VORTEX Demo",
                "role": "Chartering Manager", "password": hash_password(password)}
        users.insert_one(dict(user, created_at=utcnow().isoformat()))

    if not user or not verify_password(password, user.get("password", "")):
        return None, "Invalid email or password."

    users.update_one({"email": email}, {"$set": {"last_login": utcnow().isoformat()}})
    return public_user(user), None


def public_user(doc):
    return {
        "email": doc.get("email"),
        "name": doc.get("name"),
        "company": doc.get("company", ""),
        "role": doc.get("role", "Chartering Manager"),
    }
