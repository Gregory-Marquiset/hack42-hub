"""Hub-specific OIDC views."""

from lasuite.oidc_login.views import (
    OIDCAuthenticationCallbackView as LaSuiteOIDCAuthenticationCallbackView,
)

from .tokens import store_access_token_expiration


class OIDCAuthenticationCallbackView(LaSuiteOIDCAuthenticationCallbackView):
    """Keep freshly issued OIDC tokens when Django rotates the user session."""

    preserved_session_keys = (
        "oidc_access_token",
        "oidc_refresh_token",
        "oidc_id_token",
        "oidc_sid",
    )

    def login_success(self):
        """Restore tokens after ``auth.login`` may have flushed the session."""
        oidc_values = {
            key: self.request.session[key]
            for key in self.preserved_session_keys
            if key in self.request.session
        }

        response = super().login_success()

        self.request.session.update(oidc_values)
        store_access_token_expiration(self.request.session)
        return response
