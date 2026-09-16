"""Tests for the Hub OIDC callback."""

import time

from django.contrib.auth import login
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.middleware import SessionMiddleware
from django.test import RequestFactory, override_settings

import jwt
import pytest
from cryptography.fernet import Fernet
from lasuite.oidc_login.backends import (
    get_oidc_refresh_token,
    store_oidc_refresh_token,
)

from core import factories
from core.authentication.views import OIDCAuthenticationCallbackView

pytestmark = pytest.mark.django_db

OIDC_BACKEND = "core.authentication.backends.OIDCAuthenticationBackend"


def access_token(expiration):
    """Return a signed test JWT carrying an access-token expiration."""
    return jwt.encode(
        {"exp": expiration}, "test-key-with-at-least-32-characters", algorithm="HS256"
    )


def callback_request(user):
    """Build a callback request backed by a real Django session."""
    request = RequestFactory().get("/api/v1.0/callback/")
    SessionMiddleware(lambda current_request: None).process_request(request)
    request.session.save()
    request.user = user
    return request


def prepare_callback(view, request, user, expiration):
    """Populate the values that the OIDC backend stores before login_success."""
    request.session["oidc_access_token"] = access_token(expiration)
    request.session["oidc_id_token"] = "test-id-token"
    request.session["oidc_sid"] = "test-sid"
    store_oidc_refresh_token(request.session, "test-refresh-token")
    view.request = request
    view.user = user


@override_settings(
    LOGIN_REDIRECT_URL="/",
    OIDC_STORE_REFRESH_TOKEN=True,
    OIDC_STORE_REFRESH_TOKEN_KEY=Fernet.generate_key(),
)
def test_callback_preserves_tokens_when_login_flushes_session():
    """Changing user must not discard tokens obtained during authentication."""
    previous_user = factories.UserFactory()
    oidc_user = factories.UserFactory()
    oidc_user.backend = OIDC_BACKEND
    request = callback_request(previous_user)
    login(request, previous_user, backend=OIDC_BACKEND)
    previous_session_key = request.session.session_key
    expiration = int(time.time()) + 300
    view = OIDCAuthenticationCallbackView()
    prepare_callback(view, request, oidc_user, expiration)

    view.login_success()

    assert request.session.session_key != previous_session_key
    assert request.session["oidc_access_token"] == access_token(expiration)
    assert request.session["oidc_id_token"] == "test-id-token"
    assert request.session["oidc_sid"] == "test-sid"
    assert get_oidc_refresh_token(request.session) == "test-refresh-token"
    assert request.session["oidc_refresh_token"] != "test-refresh-token"
    assert request.session["oidc_token_expiration"] == expiration


@override_settings(
    LOGIN_REDIRECT_URL="/",
    OIDC_STORE_REFRESH_TOKEN=True,
    OIDC_STORE_REFRESH_TOKEN_KEY=Fernet.generate_key(),
)
def test_callback_populates_new_session_with_oidc_tokens_and_expiration():
    """A first login keeps encrypted tokens and the access-token expiration."""
    oidc_user = factories.UserFactory()
    oidc_user.backend = OIDC_BACKEND
    request = callback_request(AnonymousUser())
    expiration = int(time.time()) + 300
    view = OIDCAuthenticationCallbackView()
    prepare_callback(view, request, oidc_user, expiration)

    view.login_success()

    assert request.session["oidc_access_token"] == access_token(expiration)
    assert request.session["oidc_id_token"] == "test-id-token"
    assert get_oidc_refresh_token(request.session) == "test-refresh-token"
    assert request.session["oidc_refresh_token"] != "test-refresh-token"
    assert request.session["oidc_token_expiration"] == expiration
