"""Activity elements and integer icon masks shared by canvas and export."""
import copy

# Native 12 × 16 masks. Scale with integer cell boundaries, without antialiasing.
ICON_MASKS = {
    "stepsIcon": (
        "000011000000", "000111100000", "000111100000", "000111000000",
        "000110000000", "001110000000", "001110000000", "000000000000",
        "000000001100", "000000011110", "000000011110", "000000001110",
        "000000000110", "000000000111", "000000000111", "000000000000"),
    "walkIcon": (
        "000001110000", "000001110000", "000001110000", "000000000000",
        "000001100000", "000011110000", "000110111000", "001100110110",
        "001000110010", "000000110000", "000001111000", "000011001100",
        "000110000110", "001100000011", "001100000011", "000000000000"),
    "runIcon": (
        "000000011100", "000000011100", "000000011100", "000000000000",
        "000001110000", "000011111001", "001110011111", "011000111100",
        "010001110000", "000011110000", "000110111000", "111100011000",
        "110000001100", "000000000110", "000000000011", "000000000000"),
}
ACTIVITY_SOURCES = {"steps", "weeklyWalk", "weeklyRun", "stepsWeek", "walkWeek", "runWeek", *ICON_MASKS}


def icon_ops(element):
    rows = ICON_MASKS[element["source"]]
    operations = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] != "1":
                x += 1
                continue
            end = x + 1
            while end < len(row) and row[end] == "1":
                end += 1
            left, right = x * element["width"] // 12, end * element["width"] // 12
            top, bottom = y * element["height"] // 16, (y + 1) * element["height"] // 16
            if right > left and bottom > top:
                operations.append(dict(kind="rect", x=element["x"]+left, y=element["y"]+top,
                                       width=right-left, height=bottom-top))
            x = end
    return operations


def add_activity(scene, source):
    from designer_model import validate_scene, DEVICES, font_pack
    scene = validate_scene(scene)
    if source not in ACTIVITY_SOURCES:
        raise ValueError("Choose a supported activity element.")
    if len(scene["elements"]) >= 40:
        raise ValueError("A design can contain at most 40 elements.")
    size = DEVICES[scene["device"]]
    width, height = ((24, 32) if source in ICON_MASKS else (112, 24) if source.endswith("Week")
                     else (112, font_pack(scene["device"])["fonts"]["widget"]["height"]))
    identities = {element["id"] for element in scene["elements"]}
    identity, suffix = source, 2
    while identity in identities:
        identity = f"{source}-{suffix}"
        suffix += 1
    edited = copy.deepcopy(scene)
    edited["elements"].append(dict(id=identity, source=source, font="widget", x=(size-width)//2,
        y=(size-height)//2, width=width, height=height, align="centre", colour=0xdceccf,
        nightColour=0x8d99ae, visible="both"))
    return validate_scene(edited)
