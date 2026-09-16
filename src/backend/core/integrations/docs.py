"""Minimal client for creating and sharing documents in La Suite Docs."""

from dataclasses import asdict, dataclass
from urllib.parse import quote, urljoin

from django.conf import settings

import requests


class DocsConfigurationError(Exception):
    """Raised when the Docs integration is not configured."""


class DocsUnavailableError(Exception):
    """Raised when Docs cannot be reached."""


class DocsResponseError(Exception):
    """Raised when Docs rejects a request or returns an invalid response."""

    def __init__(self, status: int | None = None):
        self.status = status
        super().__init__(f"Unexpected Docs response ({status})")


@dataclass(frozen=True)
class CreatedDocsDocument:
    """Normalized reference to a newly created Docs document."""

    id: str
    provider: str
    title: str
    address: str


def create_document(*, access_token: str, title: str) -> dict[str, str]:
    """Create one Docs document using the authenticated user's access token."""
    base_url = getattr(settings, "DOCS_BASE_URL", None)
    if not base_url:
        raise DocsConfigurationError

    normalized_base_url = f"{base_url.rstrip('/')}/"
    endpoint = urljoin(normalized_base_url, "external_api/v1.0/documents/")

    try:
        response = requests.post(
            endpoint,
            json={"title": title},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=settings.DOCS_API_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise DocsUnavailableError(str(exc)) from exc

    if response.status_code != requests.codes.created:
        raise DocsResponseError(response.status_code)

    try:
        payload = response.json()
        document_id = str(payload["id"])
    except (
        KeyError,
        TypeError,
        ValueError,
        requests.exceptions.JSONDecodeError,
    ) as exc:
        raise DocsResponseError(response.status_code) from exc

    if not document_id:
        raise DocsResponseError(response.status_code)

    document = CreatedDocsDocument(
        id=document_id,
        provider="docs",
        title=str(payload.get("title") or title),
        address=urljoin(
            normalized_base_url,
            f"docs/{quote(document_id, safe='')}/",
        ),
    )
    return asdict(document)


def create_document_access(
    *, access_token: str, document_id: str, user_id: str
) -> None:
    """Grant read-only access to one Docs user for a document."""
    base_url = getattr(settings, "DOCS_BASE_URL", None)
    if not base_url:
        raise DocsConfigurationError

    normalized_base_url = f"{base_url.rstrip('/')}/"
    endpoint = urljoin(
        normalized_base_url,
        f"external_api/v1.0/documents/{quote(document_id, safe='')}/accesses/",
    )

    try:
        response = requests.post(
            endpoint,
            json={"user_id": user_id, "role": "reader"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=settings.DOCS_API_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise DocsUnavailableError(str(exc)) from exc

    if response.status_code != requests.codes.created:
        raise DocsResponseError(response.status_code)
