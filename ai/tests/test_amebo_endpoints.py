from app.safety.content_filter import is_safe
from app.services.persona_engine import system_prompt


def test_language_and_driver_safety_prompt():
    prompt = system_prompt("PCM", "driver")
    assert "Nigerian Pidgin" in prompt
    assert "safely" in prompt


def test_unsafe_request_filter():
    assert not is_safe("How to cause an accident")
    assert is_safe("Tell me a road safety tip")
