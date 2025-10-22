from datetime import date
from django.utils.deprecation import MiddlewareMixin
from allauth.account.adapter import DefaultAccountAdapter
from django.core.exceptions import ValidationError
from prayers.models import SignupThrottle
from django.shortcuts import resolve_url
from django.contrib.auth import logout


def get_client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        parts = [p.strip() for p in xff.split(',') if p.strip()]
        if parts:
            return parts[0]
    return request.META.get('REMOTE_ADDR')


class ThrottledAccountAdapter(DefaultAccountAdapter):
    """Allow at most one new account per IP per day."""
    def is_open_for_signup(self, request):
        # Preserve base behavior
        if not super().is_open_for_signup(request):
            return False
        try:
            ip = get_client_ip(request) or '0.0.0.0'
            today = date.today()
            obj, _ = SignupThrottle.objects.get_or_create(ip_address=ip, date=today)
            if obj.count >= 1:
                return False
            return True
        except Exception:
            # Fail-open to avoid blocking if DB unavailable
            return True

    def save_user(self, request, user, form, commit=True):
        user = super().save_user(request, user, form, commit)
        try:
            ip = get_client_ip(request) or '0.0.0.0'
            today = date.today()
            obj, _ = SignupThrottle.objects.get_or_create(ip_address=ip, date=today)
            obj.count += 1
            obj.save(update_fields=['count'])
        except Exception:
            pass
        # Flag to suppress allauth perform_login() during signup flow
        try:
            request.session['suppress_auto_login'] = True
        except Exception:
            pass
        return user

    def get_signup_redirect_url(self, request):
        # After signup, do not log in automatically; send user to login page
        return resolve_url('account_login')

    # Guard against unexpected auto-login paths by short-circuiting login when flagged
    def login(self, request, user):
        try:
            if request.session.pop('suppress_auto_login', None):
                # Ensure any partial auth is cleared
                try:
                    logout(request)
                except Exception:
                    pass
                return
        except Exception:
            pass
        return super().login(request, user)


