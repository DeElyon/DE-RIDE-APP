KNOWN_CORRIDORS = {"Lagos-Ibadan", "East-West", "Abuja-Kaduna"}


def corridor_context(corridor: str) -> str:
    if corridor not in KNOWN_CORRIDORS:
        return ""
    return f"The user mentioned the {corridor} corridor. You have no live traffic feed; do not claim current conditions."
