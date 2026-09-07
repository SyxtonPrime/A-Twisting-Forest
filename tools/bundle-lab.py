#!/usr/bin/env python3
"""Fold the workshop into one self-contained HTML file.

The site itself still has no build step: this exists only so the workshop can
be published somewhere a phone can reach, where a page has to be a single file
with nothing to fetch. Each module is wrapped in a closure and its imports are
resolved by hand, which is enough because every import here names its bindings
and nothing is exported by default.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# in dependency order; the last one is the entry point and runs on load
MODULES = [
    ('world', None),                      # stubbed: the workshop brings its own colours
    ('scene3d', 'src/scene3d.js'),
    ('handle', 'src/handle.js'),
    ('roll', 'src/roll/roll.js'),
    ('smooth', 'src/roll/smooth.js'),
    ('sheet', 'src/roll/sheet.js'),
    ('cap', 'src/roll/cap.js'),
    ('piece', 'src/roll/piece.js'),
    ('net', 'src/roll/net.js'),
    ('lab', 'src/roll/lab.js'),
]
KEY = {'world.js': 'world', 'scene3d.js': 'scene3d', 'handle.js': 'handle',
       'roll.js': 'roll', 'smooth.js': 'smooth', 'sheet.js': 'sheet',
       'piece.js': 'piece', 'net.js': 'net', 'cap.js': 'cap'}

IMPORT = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$", re.M)
EXPORT = re.compile(r"^export\s+(function|const|class|let)\s+([A-Za-z_$][\w$]*)", re.M)


def wrap(name, path):
    if path is None:
        return "const MOD_world = { TERRAIN: {} };\n"
    src = (ROOT / path).read_text()
    names = [m.group(2) for m in EXPORT.finditer(src)]

    def swap(m):
        binds = ' '.join(m.group(1).split())
        return f"const {{ {binds} }} = MOD_{KEY[m.group(2).rsplit('/', 1)[-1]]};"

    src = IMPORT.sub(swap, src)
    src = re.sub(r"^export\s+", "", src, flags=re.M)
    body = '\n'.join('  ' + line if line.strip() else '' for line in src.split('\n'))
    return f"const MOD_{name} = (() => {{\n{body}\n  return {{ {', '.join(names)} }};\n}})();\n"


def main(out):
    css = (ROOT / 'style.css').read_text()
    html = (ROOT / 'lab.html').read_text()
    body = html[html.index('<main id="lab">'):html.index('</main>') + len('</main>')]
    # the forest is not part of this page, so the tab bar goes and the stage
    # takes the height the bar was leaving room for
    css = css.replace('height: calc(100vh - 50px)', 'height: 100vh')
    js = ''.join(wrap(n, p) for n, p in MODULES)
    page = (
        '<title>The Rolling Net</title>\n'
        '<style>\n' + css + '\n</style>\n'
        + body + '\n'
        '<script type="module">\n' + js + '</script>\n'
    )
    pathlib.Path(out).write_text(page)
    print(f'{out}: {len(page)} bytes')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'lab-standalone.html')
