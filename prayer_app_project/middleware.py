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


