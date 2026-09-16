"""Local compatibility layer for django-lasuite OIDC token refresh."""

import time

from lasuite.oidc_login.middleware import (
    RefreshOIDCAccessToken as LaSuiteRefreshOIDCAccessToken,
)

from .tokens import store_access_token_expiration


class RefreshOIDCAccessToken(LaSuiteRefreshOIDCAccessToken):
    """Refresh access tokens using their actual JWT expiration."""

    def is_expired(self, request):
        """Check the access token expiry rather than the ID token expiry."""
        if not self.is_refreshable_url(request):
            return False

        expiration = request.session.get("oidc_token_expiration")
        if expiration is None:
            expiration = store_access_token_expiration(request.session)

        return expiration is None or expiration <= time.time()

    def process_request(self, request):
        """Delegate refresh to django-lasuite, then record the new token expiry."""
        response = super().process_request(request)
        if response is None:
            store_access_token_expiration(request.session)
        return response
