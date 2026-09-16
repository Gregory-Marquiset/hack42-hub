"""Helpers for OIDC tokens stored in the Django session."""

import base64
import json


def get_access_token_expiration(access_token):
    """Return the access token ``exp`` claim without validating its signature.

    The token has already been obtained from the configured OIDC token endpoint.
    This decoding is only used to schedule a refresh, never to authenticate a user.
    """
    if not isinstance(access_token, str):
        return None

    try:
        payload = access_token.split(".")[1]
        padding = "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload + padding))
        expiration = claims.get("exp")
    except (IndexError, TypeError, ValueError, json.JSONDecodeError):
        return None

    if isinstance(expiration, (int, float)) and not isinstance(expiration, bool):
        return expiration
    return None


def store_access_token_expiration(session):
    """Store the access token expiration under the key expected by django-lasuite."""
    expiration = get_access_token_expiration(session.get("oidc_access_token"))
    if expiration is None:
        session.pop("oidc_token_expiration", None)
    else:
        session["oidc_token_expiration"] = expiration
    return expiration
