"""App configuration for the bots Django app."""

import logging

from django.apps import AppConfig
from django.conf import settings

logger = logging.getLogger(__name__)

# The assistant cannot work without any of these, and each fails differently:
# a missing AS token fails on the first call, a missing HS token refuses every
# transaction, a missing Albert key raises inside the answer thread where
# nobody sees it. Saying so once at startup beats three different symptoms.
REQUIRED_SECRETS = (
    "MATRIX_AS_TOKEN",
    "MATRIX_HS_TOKEN",
    "MATRIX_ADMIN_TOKEN",
    "ALBERT_API_KEY",
)


class BotsConfig(AppConfig):
    """Configuration for the bots app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "bots"

    def ready(self):
        """Warn loudly about a half-configured assistant, at startup."""
        missing = [
            name for name in REQUIRED_SECRETS if not getattr(settings, name, None)
        ]
        if missing:
            logger.warning(
                "bots: %s not set - the assistant will not answer. "
                "Run `make provision-bot` and fill env.d/development/bots.local.",
                ", ".join(missing),
            )
