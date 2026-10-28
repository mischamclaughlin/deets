"""Validated RGB values and reusable live colour presets."""
import re


def colour_value(value):
    if type(value) is not int or not 0 <= value <= 0xFFFFFF:
        raise ValueError("Choose an RGB colour from 0x000000 to 0xFFFFFF.")
    return value


def colour_presets(value):
    if not isinstance(value, list) or len(value) > 20:
        raise ValueError("Keep at most 20 named colour presets.")
    result, identities, names = [], set(), set()
    for original in value:
        if not isinstance(original, dict) or set(original) != {"id", "name", "colour"}:
            raise ValueError("Each colour preset needs an identifier, name and RGB colour.")
        identity, name = original["id"], original["name"]
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", identity) or identity in identities:
            raise ValueError("Each colour preset needs a unique valid identifier.")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40 or name.strip().casefold() in names:
            raise ValueError("Give each colour preset a unique name from 1 to 40 characters.")
        identities.add(identity)
        names.add(name.strip().casefold())
        result.append({"id": identity, "name": name.strip(), "colour": colour_value(original["colour"])})
    return result


def colour_channel(channel):
    if not isinstance(channel, str) or channel not in {"day", "night"}:
        raise ValueError("Choose the day or night colour channel.")
    return ("colour", "colourPresetId") if channel == "day" else ("nightColour", "nightColourPresetId")
