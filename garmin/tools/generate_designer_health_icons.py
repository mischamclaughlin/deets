"""Regenerate the editor's original monochrome health symbols with ImageMagick."""
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

DIRECTORY = Path(__file__).resolve().parent.parent / 'resources/drawables/icons'


def generate(names=('body-battery', 'stress', 'recovery-time')):
    for name in names:
        root = ET.parse(DIRECTORY / f'{name}.svg').getroot()
        arguments = ['magick', '-size', '192x192', 'xc:none']
        for path in root:
            if path.tag.rsplit('}', 1)[-1] != 'path':
                raise ValueError('Health symbols must contain only static paths.')
            arguments += ['-draw', "push graphic-context scale 8,8 fill none stroke white stroke-width 2 stroke-linecap round stroke-linejoin round path '" + path.get('d') + "' pop graphic-context"]
        subprocess.run([*arguments, '-channel', 'A', '-threshold', '50%', '+channel',
            '-trim', '+repage', '-resize', 'x20', '-trim', '+repage', '-strip',
            f'PNG32:{DIRECTORY / (name + ".png")}'], check=True)


if __name__ == '__main__':
    generate()
