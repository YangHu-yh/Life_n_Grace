"""
WSGI config for prayer_app_project project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.2/howto/deployment/wsgi/
"""

import os
import logging

from django.core.wsgi import get_wsgi_application

# Ensure settings are configured before any Django setup
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "prayer_app_project.settings")
logger = logging.getLogger(__name__)

# Auto-migrate on cold starts when running on AWS Lambda with ephemeral /tmp SQLite.
_should_auto_migrate = bool(
    os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
    or os.environ.get("AUTO_MIGRATE_ON_STARTUP")
)

if _should_auto_migrate:
    try:
        import django
        django.setup()
        from django.conf import settings
        from django.db import connection
        from django.core.management import call_command

        # If using ephemeral SQLite in /tmp, ensure schema exists on cold start
        is_ephemeral_sqlite = (
            settings.DATABASES.get('default', {}).get('ENGINE') == 'django.db.backends.sqlite3'
            and str(settings.DATABASES.get('default', {}).get('NAME', '')).startswith('/tmp')
        )

        # Ensure required directories under /tmp exist (DB file dir, static root)
        try:
            db_name = str(settings.DATABASES.get('default', {}).get('NAME', ''))
            if db_name:
                db_dir = os.path.dirname(db_name)
                if db_dir and not os.path.isdir(db_dir):
                    os.makedirs(db_dir, exist_ok=True)
            static_root = getattr(settings, 'STATIC_ROOT', None)
            if static_root and not os.path.isdir(static_root):
                os.makedirs(static_root, exist_ok=True)
        except Exception:
            logger.exception("Failed ensuring /tmp directories for DB/static")

        if is_ephemeral_sqlite or os.environ.get("FORCE_MIGRATE_ON_START"):
            logger.info("Running auto-migrate on startup (ephemeral SQLite or forced)")
            call_command("migrate", interactive=False, verbosity=0)
            try:
                from django.contrib.sites.models import Site
                domain = os.environ.get("SITE_DOMAIN", "example.com")
                site, _ = Site.objects.update_or_create(
                    pk=1, defaults={"domain": domain, "name": "Life n Grace"}
                )
            except Exception:
                logger.exception("Failed to ensure django.contrib.sites Site object")
    except Exception:
        # Never block startup on migration errors in Lambda; app will still boot
        logger.exception("Auto-migrate on startup failed")

application = get_wsgi_application()
