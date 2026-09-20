"""Reading a message addressed to Ariane: the ping, the command, the question."""

from django.test import override_settings

import pytest

from bots import commands

pytestmark = pytest.mark.usefixtures("ping_names")


@pytest.fixture(name="ping_names")
def fixture_ping_names():
    """Ariane answers to her name only."""
    with override_settings(BOTS_PING_NAMES=["ariane"]):
        yield


@pytest.mark.parametrize(
    "body",
    [
        "@ariane bonjour",
        "@Ariane, tu peux résumer ?",
        "merci @ARIANE",
        "(@ariane) et ensuite ?",
        "> une citation\n@ariane et vous ?",
    ],
)
def test_is_pinged(body):
    """An explicit `@name`, anywhere and in any case, outside a quote."""
    assert commands.is_pinged(body)


@pytest.mark.parametrize(
    "body",
    [
        "Ariane nous a répondu hier",
        "écrivez à ariane@example.org",
        "a@ariane.fr",
        "@arianette bonjour",
        "@@ariane",
        "> @ariane a dit ceci\nmerci",
        "",
    ],
)
def test_is_not_pinged(body):
    """Her name said aloud, an email address, a longer name or a quote."""
    assert not commands.is_pinged(body)


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ("@ariane bonjour", (None, False)),
        ("@ariane /juriste ma question", ("juriste", False)),
        ("@ariane /JURISTE", ("juriste", False)),
        ("@ariane /aide", ("aide", False)),
        ("@ariane /help", ("aide", False)),
        ("@ariane /inconnue", (None, True)),
        ("@ariane voir http://example.org/juriste", (None, False)),
        ("> @ariane /juriste\n@ariane bonjour", (None, False)),
        ("@ariane /po puis /pm", ("po", False)),
    ],
)
def test_parse_command(body, expected):
    """The first command outside quotes; a path in a link is no command."""
    assert commands.parse_command(body) == expected


def test_clean_question_drops_the_command_and_keeps_the_ping():
    """The mention stays, the command and the quote go."""
    body = "> citée\n@ariane  /juriste   un   préavis ?"

    assert commands.clean_question(body) == "@ariane un préavis ?"


def test_canned_reply():
    """An unknown command and the help are answered without Albert."""
    unknown = commands.canned_reply(None, True, lambda: "aide")

    assert "@Ariane /aide" in unknown
    assert commands.canned_reply("aide", False, lambda: "l'aide") == "l'aide"
    assert commands.canned_reply("juriste", False, lambda: "l'aide") is None
