"""
Test the meeting transcript endpoints: the scribe relay and the Docs export.
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
    HTTP_401_UNAUTHORIZED,
    HTTP_403_FORBIDDEN,
    HTTP_404_NOT_FOUND,
    HTTP_410_GONE,
    HTTP_502_BAD_GATEWAY,
    HTTP_503_SERVICE_UNAVAILABLE,
)
from rest_framework.test import APIClient

from core import factories, models, transcripts

pytestmark = pytest.mark.django_db

DOCS_BASE_URL = "https://docs.test"
CREATE_FOR_OWNER_URL = f"{DOCS_BASE_URL}/api/v1.0/documents/create-for-owner/"

TRANSCRIPT_SETTINGS = {
    "DOCS_BASE_URL": DOCS_BASE_URL,
    "DOCS_SERVER_TO_SERVER_API_TOKEN": "docs-secret",
}


def _segments_url(meeting):
    return f"/api/v1.0/scribe/rooms/{meeting.livekit_room}/segments/"


def _transcript_url(meeting):
    return f"/api/v1.0/meetings/{meeting.slug}/transcript/"


# Scribe: rooms to follow


@override_settings(**TRANSCRIPT_SETTINGS)
@pytest.mark.parametrize("token", ["", "wrong", "scribe-secreT", "é"])
def test_api_scribe_rooms_wrong_token(token, scribe_client):
    """Without the exact scribe token, nothing is listed."""
    factories.MeetingFactory()

    scribe_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = scribe_client.get("/api/v1.0/scribe/rooms/")

    assert response.status_code in (HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN)


@override_settings(MEETING_SCRIBE_TOKEN=None)
def test_api_scribe_rooms_not_configured():
    """Without a configured token, even an empty one is refused."""
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer ")

    response = client.get("/api/v1.0/scribe/rooms/")

    assert response.status_code in (HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN)


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_scribe_rooms_user_session_refused(logged_in):
    """A logged-in Hub user is not the scribe."""
    factories.MeetingFactory()
    client = logged_in(factories.UserFactory())

    response = client.get("/api/v1.0/scribe/rooms/")

    assert response.status_code in (HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN)


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_scribe_rooms_lists_open_recent_meetings(scribe_client):
    """Only open meetings of the last day are followed."""
    open_meeting = factories.MeetingFactory()
    factories.MeetingFactory(closed_at=timezone.now())
    old = factories.MeetingFactory()
    models.Meeting.objects.filter(pk=old.pk).update(
        created_at=timezone.now() - timedelta(hours=25)
    )

    response = scribe_client.get("/api/v1.0/scribe/rooms/")

    assert response.status_code == 200
    assert response.json() == {"rooms": [open_meeting.livekit_room]}


# Scribe: sentences


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_scribe_segments_wrong_token(scribe_client):
    """Sentences are refused without the scribe token."""
    meeting = factories.MeetingFactory()

    scribe_client.credentials(HTTP_AUTHORIZATION="Bearer wrong")

    response = scribe_client.post(
        _segments_url(meeting),
        {"segments": [{"id": "SG_1", "speaker_identity": "a", "text": "Bonjour"}]},
        format="json",
    )

    assert response.status_code in (HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN)
    assert not models.MeetingTranscriptSegment.objects.exists()


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_scribe_segments_recorded_and_replaced(scribe_client):
    """A sentence sent again replaces its text and keeps its time."""
    meeting = factories.MeetingFactory()
    client = scribe_client
    first = {
        "id": "SG_1",
        "speaker_identity": "alice-id",
        "speaker_name": "Alice",
        "text": "Bonjour à tous",
    }

    response = client.post(_segments_url(meeting), {"segments": [first]}, format="json")
    assert response.status_code == HTTP_204_NO_CONTENT
    spoken_at = models.MeetingTranscriptSegment.objects.get().spoken_at

    response = client.post(
        _segments_url(meeting),
        {
            "segments": [
                {**first, "text": "Bonjour à toutes et à tous"},
                {"id": "SG_2", "speaker_identity": "bob-id", "text": "Salut"},
            ]
        },
        format="json",
    )

    assert response.status_code == HTTP_204_NO_CONTENT
    segments = list(meeting.transcript_segments.order_by("segment_id"))
    assert [(s.segment_id, s.speaker_name, s.text) for s in segments] == [
        ("SG_1", "Alice", "Bonjour à toutes et à tous"),
        ("SG_2", "", "Salut"),
    ]
    assert segments[0].spoken_at == spoken_at


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_scribe_segments_unknown_room(scribe_client):
    """A room the Hub did not create is not recorded."""
    response = scribe_client.post(
        "/api/v1.0/scribe/rooms/not-a-hub-room/segments/",
        {"segments": [{"id": "SG_1", "speaker_identity": "a", "text": "Bonjour"}]},
        format="json",
    )

    assert response.status_code == HTTP_404_NOT_FOUND
    assert not models.MeetingTranscriptSegment.objects.exists()


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_scribe_segments_closed_meeting(scribe_client):
    """Once closed, the meeting takes no more sentences: the scribe leaves."""
    meeting = factories.MeetingFactory(closed_at=timezone.now())

    response = scribe_client.post(
        _segments_url(meeting),
        {"segments": [{"id": "SG_1", "speaker_identity": "a", "text": "Bonjour"}]},
        format="json",
    )

    assert response.status_code == HTTP_410_GONE
    assert not models.MeetingTranscriptSegment.objects.exists()


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_scribe_segments_invalid_payload(scribe_client):
    """Malformed sentences are refused as a whole."""
    meeting = factories.MeetingFactory()

    response = scribe_client.post(
        _segments_url(meeting),
        {
            "segments": [
                {"id": "SG_1", "speaker_identity": "a", "text": "Bonjour"},
                {"id": "SG_2", "text": "sans orateur"},
            ]
        },
        format="json",
    )

    assert response.status_code == HTTP_400_BAD_REQUEST
    assert not models.MeetingTranscriptSegment.objects.exists()


# Organizer: saving the transcript in Docs


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_meeting_transcript_anonymous():
    """Anonymous users cannot save a transcript."""
    meeting = factories.MeetingFactory()

    response = APIClient().post(_transcript_url(meeting), {"title": "Point"})

    assert response.status_code == HTTP_401_UNAUTHORIZED


@override_settings(**TRANSCRIPT_SETTINGS)
@responses.activate
def test_api_meeting_transcript_not_organizer(logged_in):
    """Another user gets a 404 and the meeting stays open."""
    meeting = factories.MeetingFactory()
    factories.MeetingTranscriptSegmentFactory(meeting=meeting)

    response = logged_in(factories.UserFactory()).post(
        _transcript_url(meeting), {"title": "Point"}
    )

    assert response.status_code == HTTP_404_NOT_FOUND
    meeting.refresh_from_db()
    assert meeting.closed_at is None
    assert len(responses.calls) == 0


@override_settings(**TRANSCRIPT_SETTINGS)
def test_api_meeting_transcript_title_required(logged_in):
    """The meeting name titles the document."""
    meeting = factories.MeetingFactory()

    response = logged_in(meeting.organizer).post(
        _transcript_url(meeting), {"title": "  "}
    )

    assert response.status_code == HTTP_400_BAD_REQUEST


@override_settings(**TRANSCRIPT_SETTINGS)
@responses.activate
def test_api_meeting_transcript_nothing_said(logged_in):
    """Without any sentence, the meeting is closed and no document is created."""
    meeting = factories.MeetingFactory()

    response = logged_in(meeting.organizer).post(
        _transcript_url(meeting), {"title": "Point"}
    )

    assert response.status_code == HTTP_204_NO_CONTENT
    meeting.refresh_from_db()
    assert meeting.closed_at is not None
    assert len(responses.calls) == 0


@override_settings(
    DOCS_BASE_URL=None,
    DOCS_SERVER_TO_SERVER_API_TOKEN=None,
)
def test_api_meeting_transcript_docs_not_configured(logged_in):
    """Without Docs, the meeting is still closed for the scribe."""
    meeting = factories.MeetingFactory()
    factories.MeetingTranscriptSegmentFactory(meeting=meeting)

    response = logged_in(meeting.organizer).post(
        _transcript_url(meeting), {"title": "Point"}
    )

    assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE
    meeting.refresh_from_db()
    assert meeting.closed_at is not None


@override_settings(**TRANSCRIPT_SETTINGS)
@responses.activate
def test_api_meeting_transcript_saved_in_docs(logged_in):
    """The organizer gets a Docs document holding the transcript, once."""
    organizer = factories.UserFactory(
        sub="organizer-sub", email="orga@example.com", language="fr-fr"
    )
    meeting = factories.MeetingFactory(organizer=organizer)
    for segment_id, name, text in [
        ("SG_1", "Alice", "Bonjour à tous."),
        ("SG_2", "Alice", "On commence ?"),
        ("SG_3", "Bob", "Oui, allons-y."),
    ]:
        factories.MeetingTranscriptSegmentFactory(
            meeting=meeting,
            segment_id=segment_id,
            speaker_name=name,
            text=text,
            spoken_at=timezone.now(),
        )
    responses.post(CREATE_FOR_OWNER_URL, status=201, json={"id": "doc-123"})
    client = logged_in(organizer)

    response = client.post(_transcript_url(meeting), {"title": "Point hebdo"})

    assert response.status_code == HTTP_201_CREATED
    assert response.json() == {
        "id": "doc-123",
        "title": "Transcription : Point hebdo",
        "url": "https://docs.test/docs/doc-123/",
    }
    assert len(responses.calls) == 1
    request = responses.calls[0].request
    assert request.headers["Authorization"] == "Bearer docs-secret"
    body = json.loads(request.body)
    assert {k: body[k] for k in ("title", "sub", "email", "language")} == {
        "title": "Transcription : Point hebdo",
        "sub": "organizer-sub",
        "email": "orga@example.com",
        "language": "fr-fr",
    }
    assert body["send_notification_email"] is False
    content = body["content"]
    assert "**Alice**" in content
    assert "Bonjour à tous.\nOn commence ?" in content
    assert content.index("**Alice**") < content.index("**Bob**")
    assert content.count("**Alice**") == 1

    meeting.refresh_from_db()
    assert meeting.closed_at is not None
    assert meeting.transcript_document_id == "doc-123"

    # Closing it again answers the same document without a new one.
    response = client.post(_transcript_url(meeting), {"title": "Point hebdo"})
    assert response.status_code == HTTP_201_CREATED
    assert response.json()["id"] == "doc-123"
    assert len(responses.calls) == 1


@override_settings(**TRANSCRIPT_SETTINGS)
@responses.activate
def test_api_meeting_transcript_docs_failure(logged_in):
    """A Docs failure is reported without leaking its answer, and can be retried."""
    meeting = factories.MeetingFactory()
    factories.MeetingTranscriptSegmentFactory(meeting=meeting)
    responses.post(CREATE_FOR_OWNER_URL, status=400, json={"email": ["invalid"]})

    response = logged_in(meeting.organizer).post(
        _transcript_url(meeting), {"title": "Point"}
    )

    assert response.status_code == HTTP_502_BAD_GATEWAY
    assert response.json() == {"detail": "Docs could not save the transcript."}
    meeting.refresh_from_db()
    assert meeting.transcript_document_id is None


@override_settings(**TRANSCRIPT_SETTINGS)
@responses.activate
def test_save_transcript_answers_a_document_saved_meanwhile():
    """
    The automatic closing and the organizer can both hold the meeting as it was
    before either saved the transcript: the second answers the first document.
    """
    meeting = factories.MeetingFactory()
    factories.MeetingTranscriptSegmentFactory(meeting=meeting)
    stale = models.Meeting.objects.get(pk=meeting.pk)
    models.Meeting.objects.filter(pk=meeting.pk).update(
        transcript_document_id="doc-first"
    )

    assert transcripts.save_transcript(stale, "Point") == "doc-first"
    assert stale.transcript_document_id == "doc-first"
    assert len(responses.calls) == 0
