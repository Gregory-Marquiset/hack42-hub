"""Which Albert model answers."""

from django.test import override_settings

import pytest

from bots import albert


@pytest.fixture(name="catalogue")
def fixture_catalogue(monkeypatch):
    """Albert's catalogue, as the test sets it."""
    served = {}
    monkeypatch.setattr(albert, "available_models", lambda: served)
    return served


@override_settings(ALBERT_MODELS_SMALL=["small-a", "small-b"])
def test_pick_model_takes_the_first_preference_served(catalogue):
    """Preferences are ordered, and checked against the live catalogue."""
    catalogue.update({"small-b": "text-generation", "other": "text-generation"})

    assert albert.pick_model("small") == "small-b"


@override_settings(ALBERT_MODELS_LARGE=["retired"])
def test_pick_model_falls_back_to_a_chat_model(catalogue):
    """With no preference served, any model that can chat, never an embedding."""
    catalogue.update(
        {
            "embeddings": "text-embeddings-inference",
            "whisper": "automatic-speech-recognition",
            "chat": "text-generation",
        }
    )

    assert albert.pick_model("large") == "chat"


@override_settings(ALBERT_MODELS_LARGE=["retired"])
@pytest.mark.parametrize(
    "served", [{}, {"embeddings": "text-embeddings-inference", "reranker": None}]
)
def test_pick_model_without_a_chat_model(catalogue, served):
    """No chat model at all is an Albert failure, said as such in the room."""
    catalogue.update(served)

    with pytest.raises(albert.AlbertError):
        albert.pick_model("large")
