import re

UNSAFE = re.compile(r"\b(how to (?:crash|cause an accident|evade (?:police|law enforcement))|target (?:a|the) passenger)\b", re.IGNORECASE)


def is_safe(text: str) -> bool:
    return not UNSAFE.search(text)
