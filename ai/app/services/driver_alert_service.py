def driver_safety_check(language: str) -> str:
    prompts = {
        "EN": "When it is safe to stop, take a moment to check how alert you feel. If tired, pull over somewhere safe and rest.",
        "PCM": "When e safe to stop, check how your body dey. If sleep dey catch you, park for safe place make you rest.",
    }
    return prompts.get(language, prompts["EN"])
