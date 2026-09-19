"""
Test the meeting lifecycle kept by the Hub: details, presence, automatic
closing and the call chat.
"""

import json
from datetime import timedelta

from django.test import override_settings
from django.utils import timezone

import pytest
import responses
from rest_framework.status import (
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
    HTTP_404_NOT_FOUND,
    HTTP_410_GONE,
)

from bots import matrix
from core import factories, meeting_closing, models

pytestmark = pytest.mark.django_db

MEET_API_URL = "https://meet.test/external-api/v1.0"
DOCS_BASE_URL = "https://docs.test"

SETTINGS = {
    "MEET_API_URL": MEET_API_URL,
    "MEET_APPLICATION_CLIENT_ID": "hub-client-id",
    "MEET_APPLICATION_CLIENT_SECRET": "hub-client-secret",
    "DOCS_BASE_URL": DOCS_BASE_URL,
    "DOCS_SERVER_TO_SERVER_API_TOKEN": "docs-secret",
    "MATRIX_AS_TOKEN": "as-token",
    "MATRIX_ADMIN_TOKEN": "admin-token",
    "MATRIX_BOT_USER_ID": "@ariane:localhost",
}


@pytest.fixture(name="room_state")
def fixture_room_state(monkeypatch):
    """A fake meeting state in Matrix, written as Ariane."""
    state = {"content": None, "joined": [], "written": []}

    def get_room_state(_room_id, event_type, _state_key):
        assert event_type == "io.lasuite.hub.meeting"
        return dict(state["content"])

    def set_room_state(room_id, _event_type, state_key, content):
        state["written"].append((room_id, state_key, content))

    def ensure_in_room(room_id):
        state["joined"].append(room_id)
        return True

    monkeypatch.setattr(matrix, "ensure_in_room", ensure_in_room)
    monkeypatch.setattr(matrix, "get_room_state", get_room_state)
    monkeypatch.setattr(matrix, "set_room_state", set_room_state)
    return state


def _presence(client, meeting, participants):
    return client.post(
        f"/api/v1.0/scribe/rooms/{meeting.livekit_room}/presence/",
        {"participants": participants},
        format="json",
    )


# Creating a meeting with its details


@override_settings(**SETTINGS)
@responses.activate
def test_api_meetings_create_with_details(logged_in):
    """The Hub keeps what it needs for the closing and the archive."""
    responses.post(f"{MEET_API_URL}/application/token/", json={"access_token": "t"})
    responses.post(
        f"{MEET_API_URL}/rooms/",
        status=201,
        json={"id": "room-uuid", "slug": "abc-defg-hij", "url": "https://m/abc"},
    )
    user = factories.UserFactory()

    response = logged_in(user).post(
        "/api/v1.0/meetings/",
        {
            "chat_id": "!room:localhost",
            "title": "Point hebdo",
            "starts_at": "2026-09-17T09:00:00Z",
            "planned_end_at": "2026-09-17T10:00:00Z",
            "agenda": "1. Tour de table\n2. Démo",
            "time_zone": "Europe/Paris",
            "attachments": [
                {"name": "notes.md", "content": "# Notes\n"},
                {"name": "vide.txt", "content": ""},
            ],
        },
        format="json",
    )

    assert response.status_code == HTTP_201_CREATED
    meeting = models.Meeting.objects.get()
    assert (meeting.chat_id, meeting.title, meeting.time_zone) == (
        "!room:localhost",
        "Point hebdo",
        "Europe/Paris",
    )
    assert meeting.planned_end_at.isoformat() == "2026-09-17T10:00:00+00:00"
    assert meeting.agenda == "1. Tour de table\n2. Démo"
    assert [(a.name, a.content, a.size) for a in meeting.attachments.all()] == [
        ("notes.md", "# Notes\n", 8),
        ("vide.txt", "", 0),
    ]


@override_settings(**SETTINGS)
@responses.activate
@pytest.mark.parametrize(
    "body",
    [
        {"time_zone": "Mars/Olympus"},
        {"attachments": [{"name": "a.md"}]},
        {"planned_end_at": "demain"},
        {
            "starts_at": "2026-09-17T10:00:00Z",
            "planned_end_at": "2026-09-17T09:00:00Z",
        },
        {
            "starts_at": "2026-09-17T10:00:00Z",
            "planned_end_at": "2026-09-17T10:00:00Z",
        },
    ],
)
def test_api_meetings_create_invalid_details(body, logged_in):
    """Invalid details are refused before any Meet room is created."""
    response = logged_in(factories.UserFactory()).post(
        "/api/v1.0/meetings/", body, format="json"
    )

    assert response.status_code == HTTP_400_BAD_REQUEST
    assert len(responses.calls) == 0
    assert not models.Meeting.objects.exists()


@override_settings(**SETTINGS)
def test_api_meeting_update_title_and_extend(logged_in):
    """The organizer's renaming and extension reach the Hub's copy."""
    end = timezone.now() + timedelta(minutes=10)
    meeting = factories.MeetingFactory(planned_end_at=end)
    client = logged_in(meeting.organizer)

    response = client.patch(
        f"/api/v1.0/meetings/{meeting.slug}/",
        {"title": " Rétro ", "extend_minutes": 15},
        format="json",
    )

    assert response.status_code == HTTP_204_NO_CONTENT
    meeting.refresh_from_db()
    assert meeting.title == "Rétro"
    assert meeting.planned_end_at == end + timedelta(minutes=15)


@override_settings(**SETTINGS)
def test_api_meeting_update_without_plan_counts_from_now(logged_in):
    """An unplanned meeting gets an end, counted from now."""
    meeting = factories.MeetingFactory()
    before = timezone.now()

    logged_in(meeting.organizer).patch(
        f"/api/v1.0/meetings/{meeting.slug}/", {"extend_minutes": 15}, format="json"
    )

    meeting.refresh_from_db()
    assert meeting.planned_end_at >= before + timedelta(minutes=15)


@override_settings(**SETTINGS)
def test_api_meeting_update_not_organizer(logged_in):
    """Only the organizer may change the meeting."""
    meeting = factories.MeetingFactory(title="Point")

    response = logged_in(factories.UserFactory()).patch(
        f"/api/v1.0/meetings/{meeting.slug}/", {"title": "Piraté"}, format="json"
    )

    assert response.status_code == HTTP_404_NOT_FOUND
    meeting.refresh_from_db()
    assert meeting.title == "Point"


# Scribe: who is in the call


@override_settings(**SETTINGS)
def test_api_scribe_rooms_follow_scheduled_meetings_near_their_start(scribe_client):
    """A meeting scheduled for later is followed only shortly before it starts."""
    soon = factories.MeetingFactory(starts_at=timezone.now() + timedelta(minutes=5))
    factories.MeetingFactory(starts_at=timezone.now() + timedelta(hours=2))
    yesterday = factories.MeetingFactory(starts_at=timezone.now() - timedelta(hours=30))
    models.Meeting.objects.filter(pk=yesterday.pk).update(
        created_at=timezone.now() - timedelta(days=2)
    )

    response = scribe_client.get("/api/v1.0/scribe/rooms/")

    assert response.json() == {"rooms": [soon.livekit_room]}


@override_settings(**SETTINGS)
def test_api_scribe_presence_records_participants(scribe_client):
    """Participants are kept once, with their latest name."""
    meeting = factories.MeetingFactory()

    assert (
        _presence(
            scribe_client, meeting, [{"identity": "a", "name": "Alice"}]
        ).status_code
        == HTTP_204_NO_CONTENT
    )
    first_seen = models.MeetingParticipant.objects.get().first_seen_at
    assert (
        _presence(
            scribe_client,
            meeting,
            [{"identity": "a", "name": "Alice M."}, {"identity": "b"}],
        ).status_code
        == HTTP_204_NO_CONTENT
    )

    participants = list(meeting.participants.order_by("identity"))
    assert [(p.identity, p.name) for p in participants] == [
        ("a", "Alice M."),
        ("b", ""),
    ]
    assert participants[0].first_seen_at == first_seen
    assert participants[0].last_seen_at > first_seen
    meeting.refresh_from_db()
    assert meeting.last_occupied_at is not None
    assert meeting.closed_at is None


@override_settings(**SETTINGS)
@pytest.mark.usefixtures("inline")
def test_api_scribe_presence_empty_before_the_end_keeps_it_open(
    room_state, scribe_client
):
    """An empty call before its planned end stays open."""
    meeting = factories.MeetingFactory(
        planned_end_at=timezone.now() + timedelta(minutes=5)
    )

    assert _presence(scribe_client, meeting, []).status_code == HTTP_204_NO_CONTENT

    meeting.refresh_from_db()
    assert meeting.closed_at is None
    assert room_state["written"] == []


@override_settings(**SETTINGS)
@pytest.mark.usefixtures("inline", "room_state")
def test_api_scribe_presence_occupied_past_the_end_keeps_it_open(scribe_client):
    """People still talking past the planned end keep the meeting open."""
    meeting = factories.MeetingFactory(
        planned_end_at=timezone.now() - timedelta(minutes=5)
    )

    response = _presence(scribe_client, meeting, [{"identity": "a", "name": "Alice"}])

    assert response.status_code == HTTP_204_NO_CONTENT
    meeting.refresh_from_db()
    assert meeting.closed_at is None


@override_settings(**SETTINGS)
@responses.activate
@pytest.mark.usefixtures("inline")
def test_api_scribe_presence_closes_an_empty_meeting_past_its_end(
    room_state, scribe_client
):
    """
    Past its planned end and empty, the meeting closes: the transcript is saved
    and Ariane writes the closing into the meeting state.
    """
    meeting = factories.MeetingFactory(
        chat_id="!room:localhost",
        title="Point hebdo",
        planned_end_at=timezone.now() - timedelta(minutes=1),
    )
    factories.MeetingTranscriptSegmentFactory(meeting=meeting)
    responses.post(
        f"{DOCS_BASE_URL}/api/v1.0/documents/create-for-owner/",
        status=201,
        json={"id": "doc-1"},
    )
    agenda = {"id": "agenda", "title": "Ordre du jour", "url": "https://x/a"}
    room_state["content"] = {
        "meetingUrl": "https://m/abc",
        "startedAt": 1,
        "organizerId": "@orga:localhost",
        "documents": [agenda],
    }

    response = _presence(scribe_client, meeting, [])

    assert response.status_code == HTTP_410_GONE
    meeting.refresh_from_db()
    assert meeting.closed_at is not None
    assert meeting.auto_closed is True
    assert meeting.transcript_document_id == "doc-1"
    assert json.loads(responses.calls[0].request.body)["title"].endswith("Point hebdo")
    assert room_state["joined"] == ["!room:localhost"]
    [(room_id, state_key, content)] = room_state["written"]
    assert (room_id, state_key) == ("!room:localhost", meeting.slug)
    assert content["endedAt"] == int(meeting.closed_at.timestamp() * 1000)
    assert content["endedBy"] == "auto"
    assert content["organizerId"] == "@orga:localhost"
    assert content["documents"] == [
        agenda,
        {
            "id": "doc-1",
            "title": content["documents"][1]["title"],
            "url": f"{DOCS_BASE_URL}/docs/doc-1/",
        },
    ]

    # The scribe reporting again changes nothing.
    assert _presence(scribe_client, meeting, []).status_code == HTTP_410_GONE
    assert len(room_state["written"]) == 1


@override_settings(**SETTINGS)
@pytest.mark.usefixtures("inline", "room_state")
def test_api_scribe_presence_without_plan_keeps_it_open_for_an_hour(scribe_client):
    """A meeting without planned end stays open for an hour, even empty."""
    meeting = factories.MeetingFactory(
        planned_end_at=None, starts_at=timezone.now() - timedelta(minutes=50)
    )

    assert _presence(scribe_client, meeting, []).status_code == HTTP_204_NO_CONTENT
    meeting.refresh_from_db()
    assert meeting.closed_at is None


@override_settings(**SETTINGS)
@pytest.mark.usefixtures("inline", "room_state")
def test_api_scribe_presence_without_plan_closes_after_an_hour(scribe_client):
    """
    Past an hour, a meeting without planned end closes once empty, so that it
    is not left open after the scribe stops following it.
    """
    meeting = factories.MeetingFactory(planned_end_at=None)
    models.Meeting.objects.filter(pk=meeting.pk).update(
        created_at=timezone.now() - timedelta(minutes=70)
    )

    occupied = _presence(scribe_client, meeting, [{"identity": "a", "name": "Alice"}])
    assert occupied.status_code == HTTP_204_NO_CONTENT

    assert _presence(scribe_client, meeting, []).status_code == HTTP_410_GONE
    meeting.refresh_from_db()
    assert meeting.closed_at is not None
    assert meeting.auto_closed


def test_publish_closed_keeps_an_organizer_closing(room_state):
    """A closing already written by the organizer is not replaced."""
    meeting = factories.MeetingFactory(chat_id="!room:localhost")
    meeting_closing.close(meeting)
    room_state["content"] = {"meetingUrl": "u", "startedAt": 1, "endedAt": 42}

    with override_settings(**SETTINGS):
        meeting_closing.publish_closed(meeting)

    assert room_state["written"] == []


def test_publish_closed_without_bot_writes_nothing(room_state):
    """Without Ariane's tokens, the members' clients stay in charge."""
    meeting = factories.MeetingFactory(chat_id="!room:localhost")
    meeting_closing.close(meeting, auto=True)

    with override_settings(MATRIX_AS_TOKEN=None):
        meeting_closing.publish_closed(meeting)

    assert room_state["joined"] == []


def test_publish_closed_not_invited_writes_nothing(monkeypatch, room_state):
    """Ariane not invited into the conversation: nothing to write there."""
    meeting = factories.MeetingFactory(chat_id="!room:localhost")
    meeting_closing.close(meeting, auto=True)
    monkeypatch.setattr(matrix, "ensure_in_room", lambda room_id: False)

    with override_settings(**SETTINGS):
        meeting_closing.publish_closed(meeting)

    assert room_state["written"] == []


def test_publish_closed_matrix_failure_is_only_logged(monkeypatch, room_state):
    """A Matrix failure does not break the closing."""
    meeting = factories.MeetingFactory(chat_id="!room:localhost")
    meeting_closing.close(meeting, auto=True)

    def refuse(room_id):
        raise matrix.MatrixError("forbidden", errcode="M_FORBIDDEN")

    monkeypatch.setattr(matrix, "ensure_in_room", refuse)

    with override_settings(**SETTINGS):
        meeting_closing.publish_closed(meeting)

    assert room_state["written"] == []


# Scribe: the call chat


@override_settings(**SETTINGS)
def test_api_scribe_chat_records_messages_once(scribe_client):
    """Chat messages are kept once, in arrival order."""
    meeting = factories.MeetingFactory()
    url = f"/api/v1.0/scribe/rooms/{meeting.livekit_room}/chat/"
    message = {
        "id": "m1",
        "sender_identity": "a",
        "sender_name": "Alice",
        "text": "Le lien est dans le salon",
    }

    for _ in range(2):
        response = scribe_client.post(url, {"messages": [message]}, format="json")
        assert response.status_code == HTTP_204_NO_CONTENT

    assert [
        (m.sender_name, m.text) for m in models.MeetingChatMessage.objects.all()
    ] == [("Alice", "Le lien est dans le salon")]


@override_settings(**SETTINGS)
def test_api_scribe_chat_closed_meeting(scribe_client):
    """A closed meeting takes no more messages."""
    meeting = factories.MeetingFactory(closed_at=timezone.now())

    response = scribe_client.post(
        f"/api/v1.0/scribe/rooms/{meeting.livekit_room}/chat/",
        {"messages": [{"id": "m1", "sender_identity": "a", "text": "Salut"}]},
        format="json",
    )

    assert response.status_code == HTTP_410_GONE
    assert not models.MeetingChatMessage.objects.exists()


@override_settings(**SETTINGS)
def test_api_scribe_presence_wrong_token(scribe_client):
    """Presence reports need the scribe token."""
    meeting = factories.MeetingFactory(
        planned_end_at=timezone.now() - timedelta(minutes=1)
    )
    scribe_client.credentials(HTTP_AUTHORIZATION="Bearer nope")

    response = _presence(scribe_client, meeting, [])

    assert response.status_code in (401, 403)
    meeting.refresh_from_db()
    assert meeting.closed_at is None
