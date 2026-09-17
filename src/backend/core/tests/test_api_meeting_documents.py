"""
Test the documents of a meeting: listed, added and downloaded by the members
of its conversation, and put in its archive with its whiteboard.
"""

import io
import json
import zipfile
from datetime import datetime
from datetime import timezone as dt_timezone

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

import pytest
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_404_NOT_FOUND,
    HTTP_409_CONFLICT,
    HTTP_502_BAD_GATEWAY,
    HTTP_503_SERVICE_UNAVAILABLE,
)
from rest_framework.test import APIClient

from bots import matrix
from core import docs, factories, models

SETTINGS = {
    "MATRIX_AS_TOKEN": "as-token",
    "MATRIX_ADMIN_TOKEN": "admin-token",
    "MATRIX_BOT_USER_ID": "@ariane:localhost",
    "STORAGES": {
        "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    },
}
MEMBER = "@bob:localhost"
CLOSED_AT = datetime(2026, 9, 17, 9, 5, tzinfo=dt_timezone.utc)

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("settings_override")]


@pytest.fixture(name="settings_override")
def fixture_settings_override():
    """Matrix is configured, and files are kept in memory."""
    with override_settings(**SETTINGS):
        yield


@pytest.fixture(name="homeserver", autouse=True)
def fixture_homeserver(monkeypatch):
    """A homeserver where the token `bob-token` is Bob's, a room member."""
    monkeypatch.setattr(
        matrix,
        "openid_user_id",
        lambda token: MEMBER if token == "bob-token" else None,
    )
    monkeypatch.setattr(
        matrix, "joined_members", lambda room_id: {"@orga:localhost", MEMBER}
    )
    monkeypatch.setattr(matrix, "room_name", lambda room_id: None)


def _meeting(**overrides):
    return factories.MeetingFactory(
        **{"chat_id": "!room:localhost", "agenda": "1. Tour de table", **overrides}
    )


def _client(user=None):
    client = APIClient()
    client.force_login(user or factories.UserFactory())
    return client


def _upload(client, meeting, name="plan.pdf", content=b"%PDF-1.7", **fields):
    return client.post(
        f"/api/v1.0/meetings/{meeting.slug}/attachments/",
        {"file": SimpleUploadedFile(name, content), **fields},
        format="multipart",
    )


def _list(client, meeting, **body):
    return client.post(
        f"/api/v1.0/meetings/{meeting.slug}/documents/", body, format="json"
    )


def _download(client, meeting, attachment, **body):
    return client.post(
        f"/api/v1.0/meetings/{meeting.slug}/attachments/{attachment.pk}/",
        body,
        format="json",
    )


def test_api_meeting_documents_anonymous():
    """Anonymous users get nothing."""
    meeting = _meeting()

    assert _list(APIClient(), meeting).status_code == HTTP_401_UNAUTHORIZED
    assert _upload(APIClient(), meeting).status_code == HTTP_401_UNAUTHORIZED


def test_api_meeting_documents_list_organizer():
    """The organizer reads the agenda and the documents without Matrix."""
    meeting = _meeting()
    attachment = factories.MeetingAttachmentFactory(
        meeting=meeting, name="notes.md", content="é"
    )

    response = _list(_client(meeting.organizer), meeting)

    assert response.status_code == HTTP_200_OK
    assert response.json() == {
        "agenda": "1. Tour de table",
        "attachments": [
            {
                "id": str(attachment.pk),
                "name": "notes.md",
                "size": 2,
                "created_at": attachment.created_at.isoformat(),
            }
        ],
        "is_closed": False,
    }


def test_api_meeting_documents_list_member():
    """A member proves it with an OpenID token."""
    meeting = _meeting(closed_at=CLOSED_AT)

    response = _list(_client(), meeting, openid_token="bob-token")

    assert response.status_code == HTTP_200_OK
    assert response.json()["is_closed"] is True


@pytest.mark.parametrize("token", ["", "someone-else"])
def test_api_meeting_documents_list_not_a_member(token):
    """Anyone else gets the same 404 as for an unknown meeting."""
    meeting = _meeting()

    assert _list(_client(), meeting, openid_token=token).status_code == (
        HTTP_404_NOT_FOUND
    )


def test_api_meeting_documents_list_unknown_meeting():
    """An unknown meeting is a 404."""
    meeting = factories.MeetingFactory.build()

    assert _list(_client(), meeting).status_code == HTTP_404_NOT_FOUND


def test_api_meeting_documents_list_matrix_down(monkeypatch):
    """When Matrix cannot answer, the member is told so."""

    def fail(token):
        raise matrix.MatrixError("down")

    monkeypatch.setattr(matrix, "openid_user_id", fail)

    response = _list(_client(), _meeting(), openid_token="bob-token")

    assert response.status_code == HTTP_502_BAD_GATEWAY


def test_api_meeting_documents_upload_member():
    """A member adds a file of any kind, kept with the meeting."""
    meeting = _meeting()

    response = _upload(_client(), meeting, openid_token="bob-token")

    assert response.status_code == HTTP_201_CREATED
    attachment = models.MeetingAttachment.objects.get(meeting=meeting)
    assert response.json()["id"] == str(attachment.pk)
    assert response.json()["name"] == "plan.pdf"
    assert response.json()["size"] == 8
    assert attachment.file.name.startswith(f"meetings/{meeting.slug}/")
    assert attachment.file.read() == b"%PDF-1.7"


def test_api_meeting_documents_upload_not_a_member():
    """Someone outside the conversation adds nothing."""
    meeting = _meeting()

    response = _upload(_client(), meeting, openid_token="someone-else")

    assert response.status_code == HTTP_404_NOT_FOUND
    assert not models.MeetingAttachment.objects.exists()


def test_api_meeting_documents_upload_closed_meeting():
    """The documents of a closed meeting do not change."""
    meeting = _meeting(closed_at=CLOSED_AT)

    response = _upload(_client(meeting.organizer), meeting)

    assert response.status_code == HTTP_409_CONFLICT


@override_settings(MEETING_ATTACHMENT_MAX_BYTES=4)
def test_api_meeting_documents_upload_too_large():
    """A file above the limit is refused."""
    meeting = _meeting()

    response = _upload(_client(meeting.organizer), meeting)

    assert response.status_code == HTTP_400_BAD_REQUEST
    assert not models.MeetingAttachment.objects.exists()


@override_settings(MEETING_ATTACHMENTS_MAX=1)
def test_api_meeting_documents_upload_too_many():
    """A meeting holds a limited number of documents."""
    meeting = _meeting()
    factories.MeetingAttachmentFactory(meeting=meeting)

    response = _upload(_client(meeting.organizer), meeting)

    assert response.status_code == HTTP_400_BAD_REQUEST


def test_api_meeting_documents_upload_without_file():
    """A file is required, and may not be empty."""
    meeting = _meeting()
    client = _client(meeting.organizer)

    assert (
        client.post(
            f"/api/v1.0/meetings/{meeting.slug}/attachments/", {}, format="multipart"
        ).status_code
        == HTTP_400_BAD_REQUEST
    )
    assert _upload(client, meeting, content=b"").status_code == HTTP_400_BAD_REQUEST


def test_api_meeting_documents_download():
    """A member downloads an added file, and a text picked at creation."""
    meeting = _meeting()
    _upload(_client(meeting.organizer), meeting)
    uploaded = models.MeetingAttachment.objects.get(meeting=meeting)
    text = factories.MeetingAttachmentFactory(
        meeting=meeting, name="notes.md", content="# Notes"
    )
    client = _client()

    response = _download(client, meeting, uploaded, openid_token="bob-token")
    assert response.status_code == HTTP_200_OK
    assert b"".join(response.streaming_content) == b"%PDF-1.7"
    assert 'filename="plan.pdf"' in response["Content-Disposition"]

    response = _download(client, meeting, text, openid_token="bob-token")
    assert b"".join(response.streaming_content) == b"# Notes"


def test_api_meeting_documents_download_other_meeting():
    """A document is only reached through its own meeting."""
    meeting = _meeting()
    other = factories.MeetingAttachmentFactory()

    response = _download(_client(meeting.organizer), meeting, other)

    assert response.status_code == HTTP_404_NOT_FOUND


def test_api_meeting_documents_download_not_a_member():
    """Someone outside the conversation downloads nothing."""
    meeting = _meeting()
    attachment = factories.MeetingAttachmentFactory(meeting=meeting)

    response = _download(_client(), meeting, attachment, openid_token="x")

    assert response.status_code == HTTP_404_NOT_FOUND


@override_settings(
    DOCS_BASE_URL="https://docs.test", DOCS_SERVER_TO_SERVER_API_TOKEN="docs-secret"
)
def test_api_meeting_documents_create_in_docs(monkeypatch):
    """A member creates an empty Docs document owned by them."""
    meeting = _meeting()
    seen = {}

    def create(*, title, content, user):
        seen.update(title=title, content=content, user=user.email)
        return "doc-1"

    monkeypatch.setattr(docs, "create_document_for_owner", create)
    client = _client()

    response = client.post(
        f"/api/v1.0/meetings/{meeting.slug}/documents/new/",
        {"title": "Compte rendu", "openid_token": "bob-token"},
        format="json",
    )

    assert response.status_code == HTTP_201_CREATED
    assert response.json() == {
        "id": "doc-1",
        "title": "Compte rendu",
        "url": "https://docs.test/docs/doc-1/",
    }
    assert seen["title"] == "Compte rendu"
    assert seen["content"] == "# Compte rendu\n"


@override_settings(
    DOCS_BASE_URL="https://docs.test", DOCS_SERVER_TO_SERVER_API_TOKEN="docs-secret"
)
def test_api_meeting_documents_create_refused(monkeypatch):
    """Someone outside the conversation, and a closed meeting, create nothing."""
    monkeypatch.setattr(docs, "create_document_for_owner", lambda **kwargs: "never")
    meeting = _meeting()
    closed = _meeting(closed_at=CLOSED_AT)
    body = {"title": "Compte rendu"}

    outside = _client().post(
        f"/api/v1.0/meetings/{meeting.slug}/documents/new/",
        {**body, "openid_token": "someone-else"},
        format="json",
    )
    over = _client(closed.organizer).post(
        f"/api/v1.0/meetings/{closed.slug}/documents/new/", body, format="json"
    )

    assert outside.status_code == HTTP_404_NOT_FOUND
    assert over.status_code == HTTP_409_CONFLICT


def test_api_meeting_documents_create_without_docs():
    """Without Docs configured, the Hub says so rather than failing."""
    meeting = _meeting()

    response = _client(meeting.organizer).post(
        f"/api/v1.0/meetings/{meeting.slug}/documents/new/",
        {"title": "Compte rendu"},
        format="json",
    )

    assert response.status_code == HTTP_503_SERVICE_UNAVAILABLE


def test_api_meeting_documents_in_the_archive():
    """The archive holds the added files and the whiteboard."""
    meeting = _meeting(title="Point", board_elements=[{"id": "r1"}])
    _upload(_client(meeting.organizer), meeting)
    models.Meeting.objects.filter(pk=meeting.pk).update(closed_at=CLOSED_AT)

    response = _client(meeting.organizer).post(
        f"/api/v1.0/meetings/{meeting.slug}/archive/", {}, format="json"
    )

    assert response.status_code == HTTP_200_OK
    content = b"".join(response.streaming_content)
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        assert archive.read("files/plan.pdf") == b"%PDF-1.7"
        board = json.loads(archive.read("whiteboard.excalidraw"))
        summary = archive.read("meeting.md").decode()
    assert board["elements"] == [{"id": "r1"}]
    assert "- files/plan.pdf\n- whiteboard.excalidraw" in summary
