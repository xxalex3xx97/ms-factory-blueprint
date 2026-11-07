"""Dev-time: re-embed catalog.js icons at --px (default 128). Copy of make_icons.py (see its docstring for origin).

Usage:  python -I make_icons.py [--px 64]   (falls back to 48px if icons.json > 600KB)
Copied (not imported) from F:\\MSDemoMods-public\\ue\\MiningUnitUI\\scripts\\extract_textures.py
(parse/to_png/block_bytes/dds_wrap) and extract_item_icons.py (icon lookup); originals untouched.
Texture lookup: first T_* name in the uasset name table that exists as <name>.uexp under Materials\\Icons.
"""
import base64
import io
import json
import os
import re
import struct
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MODS_ROOT = os.environ.get("MS_MODS_ROOT", r"F:\MSDemoMods")
CONTENT = os.path.join(MODS_ROOT, "legacy", "MainSequence", "Content")
BP_DIR = os.path.join(CONTENT, "Blueprints", "BuildingBlocks")
BUILD_DIR = os.path.join(CONTENT, "Data", "Buildables")
ICONS_ROOT = os.path.join(CONTENT, "Materials", "Icons")
RENDER_DIR = os.path.join(CONTENT, "Editor", "IconRender")
PRIMARY_DIRS = ["BuildingBlocks", "Machines", "Items", "Stations", "UI"]

TAG = bytes.fromhex("c1832a9e")
PF_RE = re.compile(rb"PF_[A-Za-z0-9_]+\x00")
TEX_RE = re.compile(r"^T_[A-Za-z0-9_\-]+$")
# same station filter as extract_catalog.py STEM_RE
STATION_RE = re.compile(r'^BPO_(Station|Dock|TradeDock|DockingCollar|Hangar|Plaza|Workstation|Vendor|'
                        r'Elevator|ItemElevator|Ladder|BriefingRoom|Penthouse|NPC_|Abandoned|Window)')


class Unsupported(ValueError):
    pass


def block_bytes(fmt, w, h):
    if fmt == "PF_DXT1":
        return max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * 8
    if fmt == "PF_DXT5":
        return max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * 16
    if fmt == "PF_B8G8R8A8":
        return w * h * 4
    if fmt == "PF_FloatRGBA":
        return w * h * 8
    raise Unsupported(fmt)


def float_rgba_to_rgba8(data, w, h):
    vals = struct.unpack("<%de" % (w * h * 4), data[:w * h * 8])
    return bytes(min(255, max(0, int(round(v * 255)))) for v in vals)


def dds_wrap(fourcc, w, h, data):
    hdr = struct.pack("<4sIIIIIII", b"DDS ", 124, 0x81007, h, w, len(data), 0, 1)
    hdr += b"\x00" * 44
    hdr += struct.pack("<II4sIIIII", 32, 4, fourcc, 0, 0, 0, 0, 0)
    hdr += struct.pack("<IIIII", 0x1000, 0, 0, 0, 0)
    return hdr + data


def parse(name, ui_dir):
    """Return dict(name, w, h, fmt, mips, data) ; data = mip0 bytes or None (ubulk too short)."""
    base = os.path.join(ui_dir, name)
    uexp_p, ubulk_p = base + ".uexp", base + ".ubulk"
    d = open(uexp_p, "rb").read()
    if d[-4:] != TAG:
        raise ValueError("no package tag at end of uexp")
    m = PF_RE.search(d)
    if not m:
        raise ValueError("no PixelFormat string")
    p = m.start()
    w, h = struct.unpack_from("<ii", d, p - 16)
    fmt = m.group()[:-1].decode("ascii")
    mips = struct.unpack_from("<i", d, m.end() + 4)[0]
    sizes = []
    mw, mh = w, h
    for _ in range(max(1, mips)):
        sizes.append(block_bytes(fmt, mw, mh))
        mw, mh = max(1, mw // 2), max(1, mh // 2)
    total = sum(sizes)
    info = dict(name=name, w=w, h=h, fmt=fmt, mips=mips, data=None)
    if os.path.exists(ubulk_p):
        # ponytail: mip0 assumed at ubulk offset 0 (same as extract_textures.py)
        ub = open(ubulk_p, "rb").read()
        if len(ub) >= sizes[0]:
            info["data"] = ub[:sizes[0]]
        return info
    trail = d.rfind(d[p - 16:p - 4], 0, len(d) - 4)
    if trail < 0 or trail - total < 0:
        raise ValueError("cannot locate mip data (trailing header not found)")
    start = trail - total
    info["data"] = d[start:start + sizes[0]]
    return info


def to_image(info):
    fmt, w, h, data = info["fmt"], info["w"], info["h"], info["data"]
    if fmt == "PF_B8G8R8A8":
        return Image.frombytes("RGBA", (w, h), data, "raw", "BGRA")
    if fmt == "PF_FloatRGBA":
        return Image.frombytes("RGBA", (w, h), float_rgba_to_rgba8(data, w, h))
    fourcc = b"DXT1" if fmt == "PF_DXT1" else b"DXT5"
    return Image.open(io.BytesIO(dds_wrap(fourcc, w, h, data))).convert("RGBA")


def read_names(a):
    # copied from extract_catalog.py read_names
    fl = struct.unpack_from('<i', a, 52)[0]
    if not 0 < fl < 1000:
        raise ValueError('bad FolderName length %d' % fl)
    nn = struct.unpack_from('<i', a, 60 + fl)[0]
    p = struct.unpack_from('<i', a, 64 + fl)[0]
    names = []
    for _ in range(nn):
        n = struct.unpack_from('<i', a, p)[0]
        if n >= 0:
            s = a[p + 4:p + 4 + n].rstrip(b'\x00').decode('latin1')
            p += 8 + n
        else:
            s = a[p + 4:p + 4 - 2 * n].decode('utf-16-le', 'replace').rstrip('\x00')
            p += 8 - 2 * n
        names.append(s)
    return names


def texture_index():
    """name -> dir. Primary folders first, then any other Icons subfolder."""
    subs = [s for s in PRIMARY_DIRS if os.path.isdir(os.path.join(ICONS_ROOT, s))]
    subs += sorted(s for s in os.listdir(ICONS_ROOT)
                   if s not in subs and os.path.isdir(os.path.join(ICONS_ROOT, s)))
    dirs = [os.path.join(ICONS_ROOT, s) for s in subs]
    # fallback like extract_item_icons.py RENDER_DIR: many buildable icons only exist as editor renders
    dirs.append(RENDER_DIR)
    idx = {}
    for d in dirs:
        for fn in os.listdir(d):
            if fn.endswith(".uexp") and TEX_RE.match(fn[:-5]):
                idx.setdefault(fn[:-5], d)
    return idx


def ids_to_map():
    out = []
    for fn in sorted(os.listdir(BP_DIR)):
        if fn.startswith("BPO_") and fn.endswith(".uasset") and STATION_RE.match(fn[:-7]):
            if os.path.isfile(os.path.join(BP_DIR, fn[:-7] + ".uexp")):
                out.append((fn[:-7], os.path.join(BP_DIR, fn)))
    for fn in sorted(os.listdir(BUILD_DIR)):
        if fn.startswith("DAT_") and fn.endswith(".uasset"):
            out.append((fn[:-7], os.path.join(BUILD_DIR, fn)))
    return out


# explicit near-miss overrides: buildable id -> texture (no fallback; missing file -> null)
OVERRIDES = {
    "DAT_Container": "T_Container_1",
    "DAT_SmartContainerResearch": "T_Container_1",
    "DAT_Splitter": "T_Splitter_1",
    "DAT_Splitter_2": "T_Splitter_2",
    "DAT_Splitter_3": "T_Splitter_3",
    "DAT_UndergroundBelt": "T_Underground_1",
    "DAT_UndergroundBelt_2": "T_Underground_2",
    "DAT_UndergroundBelt_3": "T_Underground_3",
}


def build(px, tex):
    icons, mapping, problems = {}, {}, []
    unsupported = set()
    for ident, path in ids_to_map():
        try:
            names = read_names(open(path, "rb").read())
        except (struct.error, ValueError, IndexError) as e:
            problems.append("%s: name table %r" % (ident, e))
            mapping[ident] = None
            continue
        if ident in OVERRIDES:
            names = [OVERRIDES[ident]]
        chosen = None
        for n in names:
            if not TEX_RE.match(n) or n not in tex:
                continue
            try:
                info = parse(n, tex[n])
                if info["data"] is None:
                    raise ValueError("ubulk too short")
                im = to_image(info); img = im.resize((px, px), Image.LANCZOS if max(im.size) > px else Image.BICUBIC)
            except Unsupported as e:
                unsupported.add(str(e))
                continue
            except Exception as e:
                problems.append("%s: %s decode %r" % (ident, n, e))
                continue
            buf = io.BytesIO()
            img.save(buf, "PNG", optimize=True)
            icons[ident] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            chosen = n
            break
        mapping[ident] = chosen
    return icons, mapping, problems, unsupported


def main():
    px = 128
    cat_path = None
    if "--px" in sys.argv:
        px = int(sys.argv[sys.argv.index("--px") + 1])
    if "--catalog" in sys.argv:
        cat_path = sys.argv[sys.argv.index("--catalog") + 1]
    assert cat_path, "--catalog PATH required"
    tex = texture_index()
    icons, mapping, problems, unsupported = build(px, tex)
    with open(cat_path, encoding="utf-8", newline="") as f:
        t = f.read()
    ls = t.split("\n")
    ix = [i for i, l in enumerate(ls) if l.startswith("const CATALOG = ")]
    assert len(ix) == 1
    eol = "\r" if ls[ix[0]].endswith("\r") else ""  # catalog.js is CRLF
    cat = json.loads(ls[ix[0]][len("const CATALOG = "):].rstrip("\r;"))
    old = cat["icons"]
    fallback = sorted(k for k in old if k not in icons)
    for k in fallback:
        icons[k] = old[k]
    cat["icons"] = {k: icons[k] for k in old}
    c = json.dumps(cat, separators=(",", ":"), ensure_ascii=True).replace("</", "<\\/")
    ls[ix[0]] = "const CATALOG = " + c + ";" + eol
    with open(cat_path, "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(ls))
    print("px=%d textures_indexed=%d icons_in_catalog=%d" % (px, len(tex), len(cat["icons"])))
    print("fallback to previous icon (old size): " + (", ".join(fallback) or "none"))
    print("unsupported formats seen: %s" % (sorted(unsupported) or "none"))
    for p in problems:
        print("problem: " + p)


if __name__ == "__main__":
    main()
