"""The transactions Synapse pushes: who may push them, and what is done."""

import json

from django.test import override_settings

import pytest

from bots import handlers, views

URL = "/_matrix/app/v1/transactions/txn-1"
HS_TOKEN = "hs-token"


class RunNow:  # pylint: disable=too-few-public-methods
    """A thread that runs its target as soon as it starts."""

    def __init__(self, target, args, daemon):
        self.target, self.args, self.daemon = target, args, daemon

    def start(self):
        """Run the target, here and now."""
        self.target(*self.args)


@pytest.fixture(name="handled")
def fixture_handled(monkeypatch):
    """The pings and invitations handed over, run at once."""
    calls = []
    monkeypatch.setattr(
        handlers, "handle_message", lambda room_id, event: calls.append(event)
    )
    monkeypatch.setattr(handlers, "accept_invitation", calls.append)
    monkeypatch.setattr(views.threading, "Thread", RunNow)
    return calls


def _push(client, body, token=HS_TOKEN):
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token is not None else {}
    return client.put(URL, body, content_type="application/json", **headers)


def _ping(event_id="$ping"):
    return {
        "type": "m.room.message",
        "room_id": "!room:localhost",
        "event_id": event_id,
        "sender": "@bob:localhost",
        "content": {"msgtype": "m.text", "body": "@ariane bonjour"},
    }


@override_settings(MATRIX_HS_TOKEN=HS_TOKEN, BOTS_PING_NAMES=["ariane"])
def test_transactions_hand_over_the_pings(client, handled):
    """A ping from Synapse is handled; anything else is not."""
    other = {**_ping("$other"), "content": {"msgtype": "m.text", "body": "salut"}}

    response = _push(client, json.dumps({"events": [_ping(), other]}))

    assert response.status_code == 200
    assert [event["event_id"] for event in handled] == ["$ping"]


@override_settings(MATRIX_HS_TOKEN=HS_TOKEN)
@pytest.mark.parametrize("token", [None, "", "wrong", "hs-tokeN", "é"])
def test_transactions_refuse_a_wrong_token(client, handled, token):
    """Without the exact homeserver token, nothing is read."""
    response = _push(client, json.dumps({"events": [_ping()]}), token=token)

    assert response.status_code == 403
    assert response.json() == {"errcode": "M_FORBIDDEN"}
    assert not handled


@override_settings(MATRIX_HS_TOKEN=None)
def test_transactions_refused_without_a_configured_token(client, handled):
    """An unset token refuses everything, even an empty one."""
    response = _push(client, json.dumps({"events": [_ping()]}), token="")

    assert response.status_code == 403
    assert not handled


@override_settings(MATRIX_HS_TOKEN=HS_TOKEN)
def test_transactions_malformed_body_is_acknowledged(client, handled):
    """A body that does not parse is answered 200: a retry would not help."""
    response = _push(client, "{not json")

    assert response.status_code == 200
    assert not handled


@override_settings(MATRIX_HS_TOKEN=HS_TOKEN)
def test_transactions_only_accept_put(client, handled):
    """Synapse pushes with PUT; any other method is unknown."""
    response = client.post(
        URL, "{}", content_type="application/json", HTTP_AUTHORIZATION="Bearer x"
    )

    assert response.status_code == 404
    assert not handled
