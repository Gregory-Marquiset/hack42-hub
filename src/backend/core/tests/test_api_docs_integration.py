"""Tests for the Hub to La Suite Docs integration."""

import time
from uuid import uuid4

from django.test import override_settings

import jwt
import pytest
import responses
from cryptography.fernet import Fernet
from lasuite.oidc_login.backends import store_oidc_refresh_token
from rest_framework.test import APIClient

from core import factories

pytestmark = pytest.mark.django_db

HUB_ENDPOINT = "/api/v1.0/integrations/docs/documents/"
DOCS_ENDPOINT = "https://docs.test/external_api/v1.0/documents/"
OIDC_BACKEND = "core.authentication.backends.OIDCAuthenticationBackend"
TEST_MEMBER_MXID = "@reader:matrix.test"
TEST_DOCS_USER_ID = "00000000-0000-4000-8000-000000000001"


def access_token(expiration):
    """Return a signed test JWT carrying an access-token expiration."""
    return jwt.encode(
        {"exp": expiration}, "test-key-with-at-least-32-characters", algorithm="HS256"
    )


def authenticated_client(access_token="hub-access-token"):
    """Return a client with an authenticated user and optional OIDC token."""
    client = APIClient()
    client.force_login(factories.UserFactory(), backend=OIDC_BACKEND)
    session = client.session
    if access_token:
        session["oidc_access_token"] = access_token
        session["oidc_token_expiration"] = int(time.time()) + 300
    session.save()
    return client


def test_docs_document_create_anonymous():
    """An anonymous user cannot create a Docs document."""
    response = APIClient().post(HUB_ENDPOINT, {"title": "Test Hub"}, format="json")
    assert response.status_code == 401


def test_docs_document_create_validates_title():
    """A non-empty title is required before Docs is called."""
    response = authenticated_client().post(
        HUB_ENDPOINT, {"title": "   "}, format="json"
    )
    assert response.status_code == 400


def test_docs_document_create_requires_session_access_token():
    """The user's OIDC access token must be stored in the Django session."""
    response = authenticated_client(access_token=None).post(
        HUB_ENDPOINT, {"title": "Test Hub"}, format="json"
    )
    assert response.status_code == 401
    assert response.json()["error"] == "the authentication session has expired"
    assert "refresh_url" in response.json()


@responses.activate
@override_settings(DOCS_BASE_URL="https://docs.test", DOCS_API_TIMEOUT=2)
def test_docs_document_create_success():
    """Hub forwards the user token and normalizes the created document."""
    document_id = str(uuid4())
    responses.add(
        responses.POST,
        DOCS_ENDPOINT,
        json={"id": document_id, "title": "Test Hub"},
        status=201,
    )

    response = authenticated_client().post(
        HUB_ENDPOINT, {"title": "  Test Hub  "}, format="json"
    )

    assert response.status_code == 201
    assert response.json() == {
        "id": document_id,
        "provider": "docs",
        "title": "Test Hub",
        "address": f"https://docs.test/docs/{document_id}/",
        "sharing": {"shared": [], "unresolved": [], "failed": []},
    }
    assert len(responses.calls) == 1
    request = responses.calls[0].request
    assert request.headers["Authorization"] == "Bearer hub-access-token"
    assert request.body == b'{"title": "Test Hub"}'


@responses.activate
@override_settings(
    DOCS_BASE_URL="https://docs.test",
    DOCS_API_TIMEOUT=2,
    DOCS_USER_MAPPING={TEST_MEMBER_MXID: TEST_DOCS_USER_ID},
)
def test_docs_document_create_shares_reader_with_resolved_member():
    """Hub resolves a Matrix member and grants exactly reader access."""
    document_id = str(uuid4())
    responses.add(
        responses.POST,
        DOCS_ENDPOINT,
        json={"id": document_id, "title": "Test Hub"},
        status=201,
    )
    responses.add(
        responses.POST,
        f"{DOCS_ENDPOINT}{document_id}/accesses/",
        json={},
        status=201,
    )

    response = authenticated_client().post(
        HUB_ENDPOINT,
        {"title": "Test Hub", "member_ids": [TEST_MEMBER_MXID]},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["sharing"] == {
        "shared": [TEST_MEMBER_MXID],
        "unresolved": [],
        "failed": [],
    }
    assert len(responses.calls) == 2
    assert responses.calls[1].request.body == (
        f'{{"user_id": "{TEST_DOCS_USER_ID}", "role": "reader"}}'.encode()
    )


@responses.activate
@override_settings(
    DOCS_BASE_URL="https://docs.test",
    DOCS_API_TIMEOUT=2,
    DOCS_USER_MAPPING={TEST_MEMBER_MXID: TEST_DOCS_USER_ID},
)
def test_docs_document_create_reports_mixed_resolved_and_unresolved_members():
    """Missing mappings do not prevent resolved members from being shared."""
    document_id = str(uuid4())
    unknown_mxid = "@unknown:matrix.test"
    responses.add(
        responses.POST,
        DOCS_ENDPOINT,
        json={"id": document_id, "title": "Test Hub"},
        status=201,
    )
    responses.add(
        responses.POST,
        f"{DOCS_ENDPOINT}{document_id}/accesses/",
        json={},
        status=201,
    )

    response = authenticated_client().post(
        HUB_ENDPOINT,
        {
            "title": "Test Hub",
            "member_ids": [TEST_MEMBER_MXID, unknown_mxid, TEST_MEMBER_MXID],
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["sharing"] == {
        "shared": [TEST_MEMBER_MXID],
        "unresolved": [unknown_mxid],
        "failed": [],
    }
    assert len(responses.calls) == 2


@responses.activate
@override_settings(
    DOCS_BASE_URL="https://docs.test",
    DOCS_API_TIMEOUT=2,
    DOCS_USER_MAPPING={TEST_MEMBER_MXID: TEST_DOCS_USER_ID},
)
def test_docs_document_create_keeps_document_when_sharing_fails():
    """A failed access grant is reported without recreating the document."""
    document_id = str(uuid4())
    responses.add(
        responses.POST,
        DOCS_ENDPOINT,
        json={"id": document_id, "title": "Test Hub"},
        status=201,
    )
    responses.add(
        responses.POST,
        f"{DOCS_ENDPOINT}{document_id}/accesses/",
        json={"detail": "rejected"},
        status=403,
    )

    response = authenticated_client().post(
        HUB_ENDPOINT,
        {"title": "Test Hub", "member_ids": [TEST_MEMBER_MXID]},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["id"] == document_id
    assert response.json()["sharing"] == {
        "shared": [],
        "unresolved": [],
        "failed": [TEST_MEMBER_MXID],
    }
    assert [call.request.url for call in responses.calls].count(DOCS_ENDPOINT) == 1


@responses.activate
@override_settings(
    DOCS_BASE_URL="https://docs.test", DOCS_API_TIMEOUT=2, DOCS_USER_MAPPING={}
)
def test_docs_document_create_with_empty_mapping_reports_unresolved_member():
    """An empty mapping is supported and makes every requested member unresolved."""
    document_id = str(uuid4())
    responses.add(
        responses.POST,
        DOCS_ENDPOINT,
        json={"id": document_id, "title": "Test Hub"},
        status=201,
    )

    response = authenticated_client().post(
        HUB_ENDPOINT,
        {"title": "Test Hub", "member_ids": [TEST_MEMBER_MXID]},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["sharing"] == {
        "shared": [],
        "unresolved": [TEST_MEMBER_MXID],
        "failed": [],
    }
    assert len(responses.calls) == 1


@responses.activate
@override_settings(
    DOCS_BASE_URL="https://docs.test",
    DOCS_API_TIMEOUT=2,
    OIDC_OP_TOKEN_ENDPOINT="https://auth.test/token",
    OIDC_RP_CLIENT_ID="hub-local",
    OIDC_RP_CLIENT_SECRET="client-secret",
    OIDC_STORE_ACCESS_TOKEN=True,
    OIDC_STORE_REFRESH_TOKEN=True,
    OIDC_STORE_REFRESH_TOKEN_KEY=Fernet.generate_key(),
)
def test_docs_document_create_refreshes_expired_access_token():
    """The official django-lasuite decorator refreshes before calling Docs."""
    document_id = str(uuid4())
    fresh_access_token = access_token(int(time.time()) + 300)
    responses.add(
        responses.POST,
        "https://auth.test/token",
        json={
            "access_token": fresh_access_token,
            "refresh_token": "rotated-refresh-token",
        },
        status=200,
    )
    responses.add(
        responses.POST,
        DOCS_ENDPOINT,
        json={"id": document_id, "title": "Test Hub"},
        status=201,
    )

    client = APIClient()
    client.force_login(
        factories.UserFactory(),
        backend=OIDC_BACKEND,
    )
    session = client.session
    session["oidc_access_token"] = "expired-access-token"
    session["oidc_token_expiration"] = 0
    store_oidc_refresh_token(session, "stored-refresh-token")
    session.save()

    response = client.post(HUB_ENDPOINT, {"title": "Test Hub"}, format="json")

    assert response.status_code == 201
    assert len(responses.calls) == 2
    assert responses.calls[1].request.headers["Authorization"] == (
        f"Bearer {fresh_access_token}"
    )
    assert client.session["oidc_token_expiration"] > time.time()


@responses.activate
@override_settings(DOCS_BASE_URL="https://docs.test", DOCS_API_TIMEOUT=2)
def test_docs_document_create_handles_rejected_token():
    """An upstream authentication failure is not exposed as a Hub login failure."""
    responses.add(
        responses.POST,
        DOCS_ENDPOINT,
        json={"detail": "No user found"},
        status=401,
    )

    response = authenticated_client().post(
        HUB_ENDPOINT, {"title": "Test Hub"}, format="json"
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "La Suite Docs rejected the document creation request."
    }
    assert len(responses.calls) == 1


@responses.activate
@override_settings(DOCS_BASE_URL="https://docs.test", DOCS_API_TIMEOUT=2)
def test_docs_document_create_handles_invalid_response():
    """A malformed successful response is reported without leaking its body."""
    responses.add(responses.POST, DOCS_ENDPOINT, json={"title": "Test Hub"}, status=201)

    response = authenticated_client().post(
        HUB_ENDPOINT, {"title": "Test Hub"}, format="json"
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "La Suite Docs rejected the document creation request."
    }
