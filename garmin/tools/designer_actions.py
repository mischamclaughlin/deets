"""Atomic document edits and explicit application of native text defaults."""
import copy

from designer_model import validate_scene
from designer_typography import apply, element_settings, scene_text_defaults, scene_text_presets, text_defaults, text_presets, preset_settings


def _target(scene, element_id):
    if not isinstance(element_id, str):
        raise ValueError("Choose an existing element.")
    for index, element in enumerate(scene["elements"]):
        if element["id"] == element_id:
            return index, element
    raise ValueError("Choose an existing element.")


def copy_element(scene, element_id):
    scene = validate_scene(scene)
    index, target = _target(scene, element_id)
    if len(scene["elements"]) >= 40:
        raise ValueError("A design can contain at most 40 elements.")
    identities = {element["id"] for element in scene["elements"]}
    suffix, count = "-copy", 2
    identity = target["id"][:64-len(suffix)] + suffix
    while identity in identities:
        suffix = f"-copy-{count}"
        identity = target["id"][:64-len(suffix)] + suffix
        count += 1
    edited = copy.deepcopy(scene)
    duplicate = copy.deepcopy(target)
    duplicate["id"] = identity
    edited["elements"].insert(index + 1, duplicate)
    return validate_scene(edited)


def delete_element(scene, element_id):
    scene = validate_scene(scene)
    index, _ = _target(scene, element_id)
    edited = copy.deepcopy(scene)
    edited["elements"].pop(index)
    return validate_scene(edited)


def set_text_defaults(scene, defaults):
    scene = validate_scene(scene)
    edited = copy.deepcopy(scene)
    edited["textDefaults"] = text_defaults(defaults)
    if "textPresets" in edited:
        for preset in edited["textPresets"]:
            if preset["id"] == edited["defaultTextPresetId"]:
                preset.update(edited["textDefaults"])
    return validate_scene(edited)


def apply_text_defaults(scene, element_id):
    scene = validate_scene(scene)
    _, target = _target(scene, element_id)
    if target["source"] not in {"time", "timeSeconds", "hours", "minutes", "seconds", "divider"}:
        raise ValueError("Choose a text element to apply the text defaults.")
    value = {**element_settings(target, scene["device"]), **scene_text_defaults(scene)}
    return apply(scene, element_id, value)


def set_text_presets(scene, presets, default_id):
    scene = validate_scene(scene)
    checked = text_presets(presets, default_id)
    edited = copy.deepcopy(scene)
    edited.pop("textDefaults", None)
    edited.update(textPresets=checked, defaultTextPresetId=default_id)
    return validate_scene(edited)


def apply_text_preset(scene, element_id, preset_id):
    scene = validate_scene(scene)
    _, target = _target(scene, element_id)
    if target["source"] not in {"time", "timeSeconds", "hours", "minutes", "seconds", "divider"}:
        raise ValueError("Choose a text element to apply a text preset.")
    if not isinstance(preset_id, str):
        raise ValueError("Choose an existing named text preset.")
    preset = next((preset for preset in scene_text_presets(scene) if preset["id"] == preset_id), None)
    if preset is None:
        raise ValueError("Choose an existing named text preset.")
    value = {**element_settings(target, scene["device"]), **preset_settings(preset)}
    return apply(scene, element_id, value)
