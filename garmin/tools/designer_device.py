"""Atomic target-watch conversion using native fonts and geometry."""
import copy
import math


def convert_device(payload, device):
    from designer_model import DEVICES, validate_scene
    from designer_typography import (TEXT_SOURCES, DATA_SOURCES, DATE_SOURCES,
                                     element_settings, generate, _fit_clock)
    scene = validate_scene(payload)
    if not isinstance(device, str) or device not in DEVICES:
        raise ValueError("Choose a supported epix Pro watch.")
    if device == scene["device"]:
        return scene
    edited = copy.deepcopy(scene)
    edited["device"] = device
    old_size, size = DEVICES[scene["device"]], DEVICES[device]
    inset = scene.get("edgeInset", 0)
    ratio = (size / 2 - inset) / (old_size / 2 - inset)
    cache = {}
    # Generate every new device font before fitting any element. Old generated
    # keys are device-bound and must never enter the target validator.
    for element in edited["elements"]:
        source = element["source"]
        if source not in TEXT_SOURCES:
            continue
        original = next(item for item in scene["elements"] if item["id"] == element["id"])
        if source == "secondsRing" and not element["font"].startswith("generated:"):
            continue
        value = element_settings(original, scene["device"])
        signature = (source, tuple(sorted(value.items())))
        if signature not in cache:
            cache[signature] = generate(device, value, divider=source == "divider",
                date=source in DATE_SOURCES, data=source in DATA_SOURCES, label=source == "label")
        key, record = cache[signature]
        element.update(font=key, typography=value)
    for original in scene["elements"]:
        element = next(item for item in edited["elements"] if item["id"] == original["id"])
        if element["source"] in TEXT_SOURCES and element["source"] != "secondsRing":
            # Retain fixed clipping boxes; fit automatic boxes with target glyphs.
            edited = _fit_clock(edited, element["id"], None, validate=False)
            element = next(item for item in edited["elements"] if item["id"] == original["id"])
        if element["source"] == "secondsRing":
            scale = size / old_size
            width = max(4, math.floor(original["width"] * scale + 0.5))
            element.update(width=width, height=width,
                x=math.floor((original["x"] + original["width"] / 2) * scale - width / 2 + 0.5),
                y=math.floor((original["y"] + original["height"] / 2) * scale - width / 2 + 0.5))
        else:
            for axis, dimension in (("x", "width"), ("y", "height")):
                centre = original[axis] + original[dimension] / 2
                element[axis] = math.floor(size / 2 + (centre - old_size / 2) * ratio - element[dimension] / 2 + 0.5)
    try:
        return validate_scene(edited)
    except ValueError as error:
        raise ValueError("This design does not fit the selected watch. Move elements towards the centre or reduce their size, then try again.") from error
