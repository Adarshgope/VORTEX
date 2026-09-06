"""
Verify that user data really lands in the Atlas cluster.

    python check_mongo.py            # connect, round-trip a probe user, clean up
    python check_mongo.py --keep     # leave the probe document behind
    python check_mongo.py --list     # just show what is already stored

Reads the same backend/.env the app reads, so a green run here means the
running API writes to the same place.
"""

import sys
import time

from app import config
from app.db import db_status, init_db
from app.services import auth


def _masked_uri():
    uri = config.MONGO_URI or "(empty)"
    if config.MONGO_PASSWORD:
        uri = uri.replace(config.MONGO_PASSWORD, "***")
        from urllib.parse import quote_plus
        uri = uri.replace(quote_plus(config.MONGO_PASSWORD), "***")
    return uri


def main(argv):
    keep = "--keep" in argv
    list_only = "--list" in argv

    print("=" * 68)
    print("  MongoDB storage check")
    print("=" * 68)
    print(f"  URI        : {_masked_uri()}")
    print(f"  Database   : {config.MONGO_DB_NAME}")
    print(f"  Collection : {config.MONGO_USERS_COLLECTION}")
    print("-" * 68)

    init_db()
    status = db_status()
    print(f"  Backend    : {status['backend']}")
    print(f"  Detail     : {status['detail']}")

    if not status["connected"]:
        print("-" * 68)
        print("  FAIL — not talking to Atlas, so nothing is being persisted.")
        print("  Fix MONGO_URI / MONGO_PASSWORD in backend/.env and re-run.")
        print("=" * 68)
        return 1

    # Read back through a driver connection of its own, so a green result can
    # never be the in-memory shim answering its own writes.
    from pymongo import MongoClient

    client = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=8000)
    users = client[config.MONGO_DB_NAME][config.MONGO_USERS_COLLECTION]

    print("-" * 68)
    print(f"  Documents already stored: {users.count_documents({})}")
    for doc in users.find({}, {"email": 1, "name": 1, "created_at": 1}).limit(10):
        print(f"    - {doc.get('email')}  ({doc.get('name')})  {doc.get('created_at', '')}")

    if list_only:
        print("=" * 68)
        client.close()
        return 0

    probe_email = f"storage-check-{int(time.time())}@vortex.test"
    print("-" * 68)
    print(f"  Writing probe user via register_user(): {probe_email}")

    user, error = auth.register_user(probe_email, "probe-password", "Storage Probe",
                                     company="VORTEX QA", role="Chartering Manager")
    if error:
        print(f"  FAIL — register_user returned: {error}")
        client.close()
        return 1

    stored = users.find_one({"email": probe_email})
    if not stored:
        print("  FAIL — the document is NOT in Atlas after register_user().")
        client.close()
        return 1

    print("  Read back from Atlas:")
    for key in ("_id", "email", "name", "company", "role", "created_at"):
        print(f"    {key:<12}= {stored.get(key)}")
    print(f"    {'password':<12}= {str(stored.get('password'))[:32]}...  (pbkdf2 hash, not plaintext)")

    # Login path too, so we know reads and the last_login update also work.
    _u, login_error = auth.authenticate(probe_email, "probe-password")
    refreshed = users.find_one({"email": probe_email})
    print("-" * 68)
    print(f"  Login round-trip : {'ok' if not login_error else login_error}")
    print(f"  last_login field : {refreshed.get('last_login')}")

    if keep:
        print(f"  Probe user kept in {config.MONGO_DB_NAME}.{config.MONGO_USERS_COLLECTION}.")
    else:
        users.delete_one({"email": probe_email})
        print("  Probe user deleted.")

    print("-" * 68)
    print("  PASS — data is being stored in the Atlas cluster.")
    print("=" * 68)
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
