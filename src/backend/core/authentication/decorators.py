"""OIDC decorators adapted to the Hub session contract."""

from django.utils.decorators import decorator_from_middleware

from .middleware import RefreshOIDCAccessToken

refresh_oidc_access_token = decorator_from_middleware(RefreshOIDCAccessToken)
