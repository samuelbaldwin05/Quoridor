import os

# app.core.config instantiates Settings() at import time with two required Supabase
# fields. CI has no .env, so provide dummy values before any test imports the app.
# Tests mock the DB at the repository boundary, so no real connection is made.
# setdefault leaves a developer's real environment untouched.
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
