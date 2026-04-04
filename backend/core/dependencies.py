from supabase import Client, create_client

from .config import settings


def get_supabase() -> Client:
    """Return a Supabase client using the service key (server-side)."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
