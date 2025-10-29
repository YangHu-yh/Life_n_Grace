from typing import Callable
from django.contrib.auth import logout
from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError
import logging

logger = logging.getLogger(__name__)


class GracefulAuthMiddleware:
    """
    Ensures DB issues while resolving request.user don't break page loads.

    If accessing request.user raises a DatabaseError (e.g., missing auth tables
    or DB outage), clear the session and present the user as anonymous.
    """

    def __init__(self, get_response: Callable):
        self.get_response = get_response

    def __call__(self, request):
        try:
            # Force resolution of the lazy user to catch DB errors early.
            _ = bool(getattr(request, "user", None) and request.user.is_authenticated)
        except DatabaseError:
            # Downgrade to anonymous if auth tables unavailable (cold start /tmp DB)
            logger.exception("Gracefully handling auth DB error; downgrading to AnonymousUser")
            try:
                logout(request)
            except Exception:
                pass
            request.user = AnonymousUser()
        return self.get_response(request)


class AutoMigrateOnDbErrorMiddleware:
    """
    On DatabaseError, attempt a one-time migrate and retry the request.
    Enabled on Lambda ephemeral SQLite (/tmp) or when AUTO_MIGRATE_ON_DB_ERROR is set.
    """
    def __init__(self, get_response: Callable):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        except DatabaseError:
            if not self._should_attempt():
                raise
            try:
                self._run_migrations()
            except Exception:
                logger.exception("Auto-migrate on DB error failed")
                raise
            # Retry once
            return self.get_response(request)

    def _should_attempt(self) -> bool:
        import os
        try:
            if os.environ.get("AUTO_MIGRATE_ON_DB_ERROR"):
                return True
            if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
                from django.conf import settings
                engine = settings.DATABASES.get('default', {}).get('ENGINE')
                name = str(settings.DATABASES.get('default', {}).get('NAME', ''))
                return engine == 'django.db.backends.sqlite3' and name.startswith('/tmp')
        except Exception:
            pass
        return False

    def _run_migrations(self) -> None:
        from django.core.management import call_command
        call_command("migrate", interactive=False, verbosity=0)

