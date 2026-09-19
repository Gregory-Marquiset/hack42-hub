"""Fixtures shared by the core tests."""

import pytest
from rest_framework.test import APIClient

from bots import matrix
from core import factories, meeting_closing

SCRIBE_TOKEN = "scribe-secret"
# A member of every meeting conversation, and the OpenID token proving it.
MEMBER = "@bob:localhost"
MEMBER_TOKEN = "bob-token"


@pytest.fixture(name="inline")
def fixture_inline(monkeypatch):
    """Background work (closing, notifications, answers) runs at once."""
    monkeypatch.setattr(
        meeting_closing, "run_in_background", lambda function, *args: function(*args)
    )


@pytest.fixture(name="scribe_client")
def fixture_scribe_client(settings):
    """A client of the scribe endpoints, with the scribe token configured."""
    settings.MEETING_SCRIBE_TOKEN = SCRIBE_TOKEN
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {SCRIBE_TOKEN}")
    return client


@pytest.fixture(name="logged_in")
def fixture_logged_in():
    """Makes a client logged in as a user (a new one when none is given)."""

    def logged_in(user=None):
        client = APIClient()
        client.force_login(user or factories.UserFactory())
        return client

    return logged_in


@pytest.fixture(name="member_homeserver")
def fixture_member_homeserver(monkeypatch):
    """
    A homeserver where `MEMBER_TOKEN` proves `MEMBER`, a member of every room.
    Answers the calls made to it.
    """
    calls = []

    def openid_user_id(token):
        calls.append(("openid", token))
        return MEMBER if token == MEMBER_TOKEN else None

    def joined_members(room_id):
        calls.append(("members", room_id))
        return {"@orga:localhost", MEMBER}

    monkeypatch.setattr(matrix, "openid_user_id", openid_user_id)
    monkeypatch.setattr(matrix, "joined_members", joined_members)
    monkeypatch.setattr(matrix, "room_name", lambda room_id: None)
    return calls
