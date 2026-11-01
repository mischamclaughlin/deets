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


DEFAULT_ZONE_COLOURS = (0x4D9DE0, 0x35D7FF, 0x27813F, 0xFF7A00, 0xFF4D67)
ZONE_SOURCES = {"heartZones", "temperatureZones"}


def colour_channel(channel):
    if not isinstance(channel, str) or not re.fullmatch(r"(day|night)(:zone:[0-4])?", channel):
        raise ValueError("Choose a day, night or chart-band colour channel.")
    night = channel.startswith("night")
    index = int(channel[-1]) if ":zone:" in channel else None
    if index is None:
        return ("nightColour", "nightColourPresetId", None) if night else ("colour", "colourPresetId", None)
    return ("nightZoneColours", "nightZoneColourPresetIds", index) if night else ("zoneColours", "zoneColourPresetIds", index)


def zone_colours(element, night=False):
    key = "nightZoneColours" if night else "zoneColours"
    return element.get(key, DEFAULT_ZONE_COLOURS)


def set_channel(element, channel, colour=None, preset_id=None):
    value_key, link_key, index = colour_channel(channel)
    if index is None:
        if colour is not None:
            element[value_key] = colour
        if preset_id is None:
            element.pop(link_key, None)
        else:
            element[link_key] = preset_id
        if element["source"] in ZONE_SOURCES:
            palette_key, links_key = (("zoneColours", "zoneColourPresetIds") if channel == "day"
                                      else ("nightZoneColours", "nightZoneColourPresetIds"))
            if colour is not None:
                element[palette_key] = [colour] * 5
            element.pop(links_key, None)
        return
    if element["source"] not in ZONE_SOURCES:
        raise ValueError("Choose a heart-rate or temperature zone chart to edit a band.")
    if colour is not None:
        element[value_key] = list(element.get(value_key, DEFAULT_ZONE_COLOURS))
        element[value_key][index] = colour
    links = list(element.get(link_key, [None] * 5))
    links[index] = preset_id
    if any(link is not None for link in links):
        element[link_key] = links
    else:
        element.pop(link_key, None)
    # A band edit makes its appearance independent of a whole-chart preset.
    element.pop("nightColourPresetId" if channel.startswith("night") else "colourPresetId", None)


def validate_zone_colours(original, result, registry):
    for palette_key, links_key, base_link in (("zoneColours", "zoneColourPresetIds", "colourPresetId"),
                                               ("nightZoneColours", "nightZoneColourPresetIds", "nightColourPresetId")):
        if palette_key not in original and links_key not in original:
            continue
        palette = original.get(palette_key)
        if original["source"] not in ZONE_SOURCES or not isinstance(palette, list) or len(palette) != 5:
            raise ValueError("Zone charts need exactly five band colours per appearance.")
        result[palette_key] = [colour_value(value) for value in palette]
        if base_link in original and any(colour != registry[original[base_link]] for colour in palette):
            raise ValueError("The chart bands must match their linked colour preset.")
        if links_key not in original:
            continue
        links = original[links_key]
        if not isinstance(links, list) or len(links) != 5:
            raise ValueError("Zone charts need exactly five band preset links.")
        for index, identity in enumerate(links):
            if identity is not None and (not isinstance(identity, str) or identity not in registry or palette[index] != registry[identity]):
                raise ValueError("Each chart band must match its linked colour preset.")
        result[links_key] = list(links)
