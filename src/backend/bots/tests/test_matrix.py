"""The Matrix calls: what each asks the homeserver, and how it fails."""

from django.test import override_settings

import pytest
import responses

from bots import matrix

HOMESERVER = "http://synapse.test"
ROOM = "!room:localhost"
SETTINGS = {
    "MATRIX_HOMESERVER_URL": f"{HOMESERVER}/",
    "MATRIX_AS_TOKEN": "as-token",
    "MATRIX_ADMIN_TOKEN": "admin-token",
    "MATRIX_BOT_USER_ID": "@ariane:localhost",
}
ADMIN_MEMBERS_URL = f"{HOMESERVER}/_synapse/admin/v1/rooms/%21room%3Alocalhost/members"


@override_settings(**{**SETTINGS, "MATRIX_ADMIN_TOKEN": None})
def test_admin_without_token_is_a_matrix_error():
    """No admin token is a failure callers handle, not a TypeError."""
    assert not matrix.can_read_members()
    with pytest.raises(matrix.MatrixError):
        matrix.joined_members(ROOM)
    with pytest.raises(matrix.MatrixError):
        matrix.room_name(ROOM)


@override_settings(**SETTINGS)
@responses.activate
def test_admin_joined_members():
    """The members, read with the admin token from a trimmed base URL."""
    responses.get(
        ADMIN_MEMBERS_URL,
        json={"members": ["@bob:localhost"]},
        match=[
            responses.matchers.header_matcher({"Authorization": "Bearer admin-token"})
        ],
    )

    assert matrix.joined_members(ROOM) == {"@bob:localhost"}


@override_settings(**SETTINGS)
@responses.activate
def test_admin_unreadable_answer_is_a_matrix_error():
    """A proxy page instead of JSON is a Matrix failure too."""
    responses.get(ADMIN_MEMBERS_URL, body="<html>Bad gateway</html>")

    with pytest.raises(matrix.MatrixError):
        matrix.joined_members(ROOM)
