"""
Test the private messages Ariane sends about meetings: who gets them, when,
and only once.
"""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from django.test import override_settings
from django.utils import timezone

import pytest
import responses
from rest_framework.test import APIClient

from bots import matrix
from core import factories, meeting_closing, meeting_notifications, models

pytestmark = pytest.mark.django_db

ROOM = "!room:hack42"
ARIANE = "@hub-as_ariane:hack42"
MEET_API_URL = "https://meet.test/external-api/v1.0"
SETTINGS = {
    "MEETING_NOTIFICATIONS_ENABLED": True,
    "MATRIX_AS_TOKEN": "as-token",
    "MATRIX_ADMIN_TOKEN": "admin-token",
    "MATRIX_BOT_USER_ID": ARIANE,
    "MEETING_SCRIBE_TOKEN": "scribe-secret",
    "MEET_API_URL": MEET_API_URL,
    "MEET_APPLICATION_CLIENT_ID": "hub-client-id",
    "MEET_APPLICATION_CLIENT_SECRET": "hub-client-secret",
    "DOCS_BASE_URL": None,
    "DOCS_SERVER_TO_SERVER_API_TOKEN": None,
}


class FakeHomeserver:
    """Ariane's side of Matrix: rooms she creates and messages she sends."""

    def __init__(self):
        self.members = {ROOM: set()}
        self.memberships = {}
        self.created = []
        self.sent = []
        self.extras = []
        self.fail_for = set()

    def joined_members(self, room_id):
        """Who is in a room."""
        return set(self.members[room_id])

    def room_name(self, room_id):
        """The name of the conversation."""
        return "Équipe produit" if room_id == ROOM else None

    def create_direct_room(self, user_id):
        """A new private conversation with Ariane."""
        if user_id in self.fail_for:
            raise matrix.MatrixError("refused")
        room_id = f"!dm-{len(self.created)}:hack42"
        self.created.append((room_id, user_id))
        self.memberships[(room_id, user_id)] = "invite"
        return room_id

    def membership(self, room_id, user_id):
        """Someone's membership in a private conversation."""
        return self.memberships.get((room_id, user_id))

    def send_message(self, room_id, body, *, extra=None):
        """A message from Ariane, recorded with its recipient and its extras."""
        user_id = next(u for r, u in self.created if r == room_id)
        self.sent.append((user_id, body))
        self.extras.append(extra)
        return "$event"


@pytest.fixture(name="homeserver")
def fixture_homeserver(monkeypatch):
    """A fake homeserver, and background steps run right away."""
    fake = FakeHomeserver()
    for name in (
        "joined_members",
        "room_name",
        "create_direct_room",
        "membership",
        "send_message",
    ):
        monkeypatch.setattr(matrix, name, getattr(fake, name))
    monkeypatch.setattr(
        meeting_closing, "run_in_background", lambda function, *args: function(*args)
    )
    return fake


def _user(login):
    return factories.UserFactory(email=f"{login}@example.org")


def _meeting(**overrides):
    values = {
        "chat_id": ROOM,
        "title": "Point hebdo",
        "url": "https://meet.test/abc-defg-hij",
        "time_zone": "Europe/Paris",
        "organizer": _user("orga"),
    }
    return factories.MeetingFactory(**{**values, **overrides})


@override_settings(**SETTINGS)
def test_recipients_are_hub_users_of_the_conversation(homeserver):
    """Members with a Hub account, organizer included; no bots, no Ariane."""
    meeting = _meeting()
    _user("alice")
    factories.UserFactory(email="bob@example.org", is_active=False)
    homeserver.members[ROOM] = {
        "@orga:hack42",
        "@alice:hack42",
        "@bob:hack42",
        "@marie.dupont:hack42",
        ARIANE,
        "@hub-as_other:hack42",
    }

    assert meeting_notifications.recipients(meeting) == [
        "@alice:hack42",
        "@orga:hack42",
    ]


@override_settings(**SETTINGS)
def test_notify_started_once_with_the_link(homeserver):
    """Every member is told once, in their conversation with Ariane."""
    meeting = _meeting()
    _user("alice")
    homeserver.members[ROOM] = {"@orga:hack42", "@alice:hack42"}

    meeting_notifications.notify_started(meeting.pk)
    meeting_notifications.notify_started(meeting.pk)

    assert [user for user, _ in homeserver.sent] == ["@alice:hack42", "@orga:hack42"]
    body = homeserver.sent[0][1]
    assert "« Point hebdo »" in body
    assert "« Équipe produit »" in body
    assert "https://meet.test/abc-defg-hij" in body
    meeting.refresh_from_db()
    assert meeting.started_notified_at is not None


@override_settings(**SETTINGS)
def test_direct_room_is_reused_and_not_forced(homeserver):
    """Ariane reuses her conversation, and never invites back who left it."""
    meeting = _meeting()
    homeserver.members[ROOM] = {"@orga:hack42"}

    meeting_notifications.notify_scheduled(meeting.pk)
    room_id = models.AssistantDirectRoom.objects.get(user_id="@orga:hack42").room_id
    homeserver.memberships[(room_id, "@orga:hack42")] = "join"
    meeting_notifications.notify_started(meeting.pk)
    homeserver.memberships[(room_id, "@orga:hack42")] = "leave"
    meeting_notifications.notify_closed(meeting.pk)

    assert len(homeserver.created) == 1
    assert len(homeserver.sent) == 2


@override_settings(**SETTINGS)
def test_direct_room_recreated_when_gone(homeserver):
    """A conversation Ariane is no longer in is created again."""
    meeting = _meeting()
    homeserver.members[ROOM] = {"@orga:hack42"}
    models.AssistantDirectRoom.objects.create(
        user_id="@orga:hack42", room_id="!disparu:hack42"
    )

    meeting_notifications.notify_started(meeting.pk)

    assert len(homeserver.created) == 1
    assert models.AssistantDirectRoom.objects.get().room_id == homeserver.created[0][0]


@override_settings(**SETTINGS)
def test_one_failing_member_does_not_stop_the_others(homeserver):
    """A refused invitation is only logged."""
    meeting = _meeting()
    _user("alice")
    homeserver.members[ROOM] = {"@orga:hack42", "@alice:hack42"}
    homeserver.fail_for = {"@alice:hack42"}

    meeting_notifications.notify_started(meeting.pk)

    assert [user for user, _ in homeserver.sent] == ["@orga:hack42"]


def test_messages():
    """The three messages, with local times and the transcript link."""
    meeting = factories.MeetingFactory(
        title="",
        url="",
        time_zone="Europe/Paris",
        starts_at=datetime(2026, 9, 18, 8, 0, tzinfo=dt_timezone.utc),
        planned_end_at=datetime(2026, 9, 18, 9, 30, tzinfo=dt_timezone.utc),
        auto_closed=True,
    )

    with override_settings(MATRIX_ADMIN_TOKEN=None):
        assert meeting_notifications.scheduled_message(meeting).startswith(
            "📅 Réunion programmée dans « votre conversation » : « sans titre », "
            "le 18/09 à 10:00 (1 h 30)."
        )
        assert "lien" not in meeting_notifications.started_message(meeting)
        closed = meeting_notifications.closed_message(
            meeting, {"id": "d", "title": "t", "url": "https://docs.test/docs/d/"}
        )
    assert "(clôturée automatiquement)" in closed
    assert "Transcription : https://docs.test/docs/d/" in closed


@override_settings(**SETTINGS)
@pytest.mark.usefixtures("homeserver")
def test_messages_name_the_espace():
    """The conversation, and the espace it belongs to when there is one."""
    meeting = factories.MeetingFactory(
        chat_id=ROOM,
        title="Point hebdo",
        space_name="Direction du numérique",
        url="https://meet.test/abc",
        starts_at=datetime(2026, 9, 18, 8, 0, tzinfo=dt_timezone.utc),
    )
    room = "« Équipe produit » (espace « Direction du numérique »)"

    assert f"programmée dans {room}" in meeting_notifications.scheduled_message(meeting)
    assert f"commence dans {room}" in meeting_notifications.started_message(meeting)
    assert f"de {room} est terminée" in meeting_notifications.closed_message(meeting)


@override_settings(**SETTINGS, LOGIN_REDIRECT_URL="https://hub.test/")
@pytest.mark.usefixtures("homeserver")
def test_started_message_carries_the_meeting():
    """The Hub turns the attached meeting into a button joining the call."""
    meeting = factories.MeetingFactory(
        chat_id=ROOM, title="Point", url="https://meet.test/abc"
    )

    text = meeting_notifications.started_message(meeting)

    assert "Ouvrir la conversation et rejoindre la réunion : " in text
    # The address stays readable, and is the one to share outside the room.
    assert "https://meet.test/abc" in text
    assert f"https://hub.test/chat?chat=%21room%3Ahack42&meeting={meeting.slug}" in text
    assert meeting_notifications.meeting_invitation(meeting) == {
        "io.lasuite.hub.meeting_invite": {
            "chatId": ROOM,
            "meetingId": meeting.slug,
            "url": "https://meet.test/abc",
            "title": "Point",
        }
    }


def test_no_invitation_without_a_call():
    """A meeting without a call link offers no button."""
    meeting = factories.MeetingFactory(chat_id=ROOM, url="")

    assert meeting_notifications.meeting_invitation(meeting) is None


@override_settings(**SETTINGS)
@pytest.mark.usefixtures("homeserver")
def test_messages_without_an_espace():
    """A conversation outside any espace is named on its own."""
    meeting = factories.MeetingFactory(
        chat_id=ROOM,
        title="Point hebdo",
        starts_at=datetime(2026, 9, 18, 8, 0, tzinfo=dt_timezone.utc),
    )

    assert "dans « Équipe produit » :" in meeting_notifications.scheduled_message(
        meeting
    )
    assert "espace" not in meeting_notifications.started_message(meeting)


# When the messages are sent


def _presence(meeting, participants):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer scribe-secret")
    return client.post(
        f"/api/v1.0/scribe/rooms/{meeting.livekit_room}/presence/",
        {"participants": participants},
        format="json",
    )


def _create(user, **details):
    client = APIClient()
    client.force_login(user)
    return client.post(
        "/api/v1.0/meetings/",
        {"chat_id": ROOM, "title": "Point hebdo", **details},
        format="json",
    )


def _mock_meet():
    responses.post(f"{MEET_API_URL}/application/token/", json={"access_token": "t"})
    responses.post(
        f"{MEET_API_URL}/rooms/",
        status=201,
        json={"id": "room-uuid", "slug": "abc-defg-hij", "url": "https://m/abc"},
    )


@override_settings(**SETTINGS)
@responses.activate
def test_creating_a_meeting_now_tells_it_starts(homeserver):
    """A meeting started right away is announced as starting, with its link."""
    _mock_meet()
    organizer = _user("orga")
    homeserver.members[ROOM] = {"@orga:hack42"}

    _create(organizer)

    [(_, body)] = homeserver.sent
    assert body.startswith("🎥 La réunion « Point hebdo » commence")
    assert "https://m/abc" in body
    meeting = models.Meeting.objects.get()
    assert meeting.url == "https://m/abc"
    assert meeting.scheduled_notified_at is None


@override_settings(**SETTINGS)
@responses.activate
def test_scheduling_a_meeting_tells_it_is_scheduled(homeserver):
    """A meeting for later is announced as scheduled; its start comes later."""
    _mock_meet()
    organizer = _user("orga")
    homeserver.members[ROOM] = {"@orga:hack42"}
    starts_at = timezone.now() + timedelta(minutes=10)

    _create(organizer, starts_at=starts_at.isoformat())

    [(_, body)] = homeserver.sent
    assert body.startswith("📅 Réunion programmée")
    meeting = models.Meeting.objects.get()
    assert meeting.started_notified_at is None

    # Before its start, the scribe's reports do not announce it.
    _presence(meeting, [])
    assert len(homeserver.sent) == 1

    models.Meeting.objects.filter(pk=meeting.pk).update(
        starts_at=timezone.now() - timedelta(seconds=5)
    )
    _presence(meeting, [])
    _presence(meeting, [{"identity": "orga-id", "name": "Orga"}])

    assert len(homeserver.sent) == 2
    assert homeserver.sent[1][1].startswith("🎥 La réunion « Point hebdo » commence")


@override_settings(**SETTINGS)
def test_organizer_closing_tells_the_members(homeserver):
    """Closing by the organizer is announced once, even without Docs."""
    meeting = _meeting()
    homeserver.members[ROOM] = {"@orga:hack42"}
    client = APIClient()
    client.force_login(meeting.organizer)

    for _ in range(2):
        response = client.post(
            f"/api/v1.0/meetings/{meeting.slug}/transcript/", {"title": "Point hebdo"}
        )
        assert response.status_code == 503

    [(_, body)] = homeserver.sent
    assert body.startswith("✅ La réunion « Point hebdo » de « Équipe produit »")
    assert "automatiquement" not in body


@override_settings(**SETTINGS)
def test_automatic_closing_tells_the_members(homeserver, monkeypatch):
    """The automatic closing is announced as such."""
    monkeypatch.setattr(matrix, "ensure_in_room", lambda room_id: None)
    monkeypatch.setattr(
        matrix, "get_room_state", lambda *args: {"meetingUrl": "u", "startedAt": 1}
    )
    monkeypatch.setattr(matrix, "set_room_state", lambda *args: None)
    meeting = _meeting(
        planned_end_at=timezone.now() - timedelta(minutes=1),
        started_notified_at=timezone.now(),
    )
    homeserver.members[ROOM] = {"@orga:hack42"}

    _presence(meeting, [])

    [(_, body)] = homeserver.sent
    assert "(clôturée automatiquement)" in body


@override_settings(**{**SETTINGS, "MEETING_NOTIFICATIONS_ENABLED": False})
@responses.activate
def test_notifications_can_be_turned_off(homeserver):
    """Nothing is sent when notifications are off."""
    _mock_meet()
    homeserver.members[ROOM] = {"@orga:hack42"}

    _create(_user("orga"))

    assert homeserver.sent == []
