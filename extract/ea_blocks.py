"""Add the EA station blocks to extract/shapes_src.json (add:true entries) + `levels` for every block.

usage: python -I extract/ea_blocks.py            (idempotent; then python -I extract/gen_shapes.py)
Inputs: extract/floors.json (EA colliders/BlockBounds/cost, see ea_floors.py), extract/rea/blocks_raw.json (strings/icon),
        extract/rea/research.json (unlocks), extract/rea/localization.json (labels/descriptions).
Rules (nothing invented): size = ceil(max(BlockBounds, hull/16)) cells (non-integer / sub-cell footprints are rounded up, flagged in `note`);
levels = ceil(BlockBounds z / 4) (EA: 1 level = 4 floor units); label/description = in-game text when extractable else the asset id;
research = RSC_* whose `unlocks` lists the block, else [] + researchNote. Only Station_03, Adapter_01 and Corridor_02 get a buildable floor
(user ground truth 2026-11-12 / decoded walls); every other new block is nofloor (its footprint is a no-build tile, interior unknown).
EXCLUDED (not station blocks): see EXCLUDE below; printed at the end.
"""
import json, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
rd = lambda n: json.load(open(os.path.join(HERE, n), encoding='utf-8'))
fl, raw, rsc, loc = rd('floors.json')['blocks'], rd('rea/blocks_raw.json'), rd('rea/research.json'), rd('rea/localization.json')
P = os.path.join(HERE, 'shapes_src.json')
src = rd('shapes_src.json')
B = src['blocks']

# name -> category
ADD = {}
for c, names in {
    'Basic': 'Station_03 StationAdapter_01 StationCorridor_02 Plaza_01 StationCurve_01 StationFoundation_01 StationHUB_01 Penthouse_01 NPC_Apartment_01 NPC_Cafeteria_01 BriefingRoom VendorCorridor_01 VendorCorridor_02 VendorCorridor_03 WindowBlock WindowBlock_02',
    'Vertical': 'ElevatorBlock_01 ElevatorBlock_02 ElevatorBlock_02A ElevatorBlock_04 ElevatorBlock_05 ItemElevatorBlock_01 StationLift_01 LadderBlock',
    'Functional Blocks': 'Hangar_1 Hangar_2 TradeDock_01 Dock_3 WorkstationBlock ScannerModule DeepSpaceObservatory AstronomicScanner BiosampleCollector ReactorBlock_Small SolarPanelBlock_03',
}.items():
    for n in names.split():
        ADD['BPO_' + n] = c
EXCLUDE = ('ship parts (Thruster_*, Cockpit_*, Body_*, Frame*, Armour_01L/R, ArmourSlope*, Cannon/Lance/MissileLauncher/MiningLaser/RelicPulseCannon, ShipContainer, ShipCorner, ShipElevator, ShipLaserTurret, ShipShield, ShipTurret, ShipOffice, TractorBeam, '
           'Fighter*, LandingGear, DockingCollar, WarpDrive/InterstellarWarpDrive), Abandoned* (POI pieces), ShipyardTop/Bottom (shipyard extension parts, 0.9x1 footprint, no colliders), connectors (Basic/Large/XLarge/Connector_0*), ship _B mirrors, StationArmour_01B (shape mirror of _01)')

# site / user names where the in-game text key is not extractable (hex key) or is shared
LABELS = {'BPO_Station_03': 'Station 2x2 C', 'BPO_StationCorridor_02': 'Corridor 2x2'}
# floored blocks (user ground truth / decoded walls); everything else nofloor
FLOORED = {
    'BPO_Station_03': dict(floor=dict(w=30, h=30, verified=True, source='user 2026-11-12 (screenshots, internal floor 30x30) + decoded: hull 32x32, 1-thick walls, 8 corner posts 1x4, one 22-wide opening per side, no doors'),
                           floorOrigin=[-15, -15], verified=True,
                           door=dict(w=6, depth=2, offset=4, verified=False, source='real opening = one 22-wide gap (-11..11) per side, no door; the model slots (6 wide, 2 per side) lie inside it'),
                           entrance=dict(kind='doors', evidence='decoded BPO_Station_03 colliders: 22-wide opening (-11..11) on each side, no door frames')),
    'BPO_StationAdapter_01': dict(floor=dict(w=14, h=30, verified=True, source='user 2026-11-12 (internal floor 14x30) + decoded hull 16x32'),
                                  floorOrigin=[-7, -15], verified=False,
                                  door=dict(w=6, depth=2, offset=4, verified=False, source='decoded: N/S 6-wide gaps, one 22-wide gap on W, two 6-wide gaps on E (narrow-side rotation vs site axes unverified)'),
                                  entrance=dict(kind='doors', evidence='decoded BPO_StationAdapter_01 colliders; rotation vs site axes unverified')),
    'BPO_StationCorridor_02': dict(floor=dict(w=32, h=26, verified=False, source='inferred from colliders: slabs y +-13..15 (2 thick), strip y -13..13 x -16..16, open W/E; not user verified'),
                                   floorOrigin=[-16, -13], floorCenter=True, doorMatch=True, verified=False,
                                   door=dict(w=6, depth=2, offset=0, flush=True, sides=['E', 'W'], verified=False, source='decoded: W/E openings 23 wide (-11.5..11.5); the model slot is 6 wide'),
                                   entrance=dict(kind='doors', evidence='decoded BPO_StationCorridor_02: open ends W and E')),
}
# extra shape keys per block (hatch inside the closed outline: walled blocks with machines/shafts inside)
HATCH = {'BPO_ElevatorBlock_01', 'BPO_ElevatorBlock_02A', 'BPO_Hangar_2', 'BPO_AstronomicScanner', 'BPO_BiosampleCollector'}
# EA icon texture missing in the extracted files
NO_ICON = {'BPO_Plaza_01'}
# collider z0 >= 1 boxes are lintels/overhead: not drawn in the ground plan
GROUND = {'BPO_ElevatorBlock_01', 'BPO_ElevatorBlock_02A', 'BPO_Station_03', 'BPO_StationAdapter_01', 'BPO_StationCorridor_02'}


def ascii_(s):
    return re.sub(r'[^\x20-\x7e]', 'x', s).strip()


def text(key):
    if not key:
        return None
    for t in ('STB_GameObjects', 'STB_Descriptions', 'STB_Details', 'STB_CommonMachines'):
        if key in loc.get(t, {}):
            return ascii_(loc[t][key])
    return None if re.fullmatch(r'[0-9A-F]{32}', key) else ascii_(key)   # hex = untranslatable text key


def label(n):
    st = raw.get(n, {}).get('strings', [])
    go = loc.get('STB_GameObjects', {})
    for k in st:
        if k in go:
            return ascii_(go[k]), False
    for k in st:
        if not re.fullmatch(r'[0-9A-F]{32}', k) and not k.endswith('Desc') and len(k) < 30 and not k.endswith('.') and not any(k in loc.get(t, {}) for t in ('STB_Descriptions', 'STB_Details', 'STB_CommonMachines')):
            return ascii_(k), False
    return re.sub(r'(?<=[a-z0-9])(?=[A-Z])|_', ' ', n[4:]).strip(), True


def desc(n):
    for k in raw.get(n, {}).get('strings', [])[::-1]:
        if k.endswith('Desc') or k in loc.get('STB_Descriptions', {}) or k in loc.get('STB_Details', {}):
            t = text(k)
            if t:
                return t
    st = raw.get(n, {}).get('strings', [])
    return text(st[1]) if len(st) > 1 and not re.fullmatch(r'[0-9A-F]{32}', st[1]) and ' ' in st[1] else None


unl = {}
for k, v in rsc.items():
    for u in v.get('unlocks', []):
        unl.setdefault(u, []).append(k)


def levels(n):
    bb = fl[n].get('block_bounds_decoded')
    return max(1, math.ceil(bb[1][2] / 4 - 0.05)) if bb and bb[1][2] > 0.5 else 1


def size(n):
    v = fl[n]
    cb = v.get('cells_from_block_bounds') or [0, 0]
    hu = (v.get('hull') or {}).get('size') or [0, 0]
    return [max(1, math.ceil(max(cb[i], hu[i] / 16) - 0.05)) for i in (0, 1)]


def build():
    out, labels = {}, {}
    for n, cat in ADD.items():
        f = fl[n]
        w, h = size(n)
        lab, derived = label(n)
        lab = LABELS.get(n, lab).replace('Mk. ', 'Mk.')   # site style 'Mk.1'
        if n not in LABELS:
            labels.setdefault(lab, []).append(n)
        e = {'add': True, 'label': lab, 'class': '/Game/Blueprints/BuildingBlocks/%s.%s_C' % (n, n), 'category': cat, 'w': w, 'h': h, 'verified': False}
        sp = FLOORED.get(n)
        notes = []
        cb = f.get('cells_from_block_bounds')
        if cb and (abs(cb[0] - w) > 0.05 or abs(cb[1] - h) > 0.05):
            notes.append('BlockBounds %sx%s cells, hull %s: footprint rounded up to %dx%d (in-game snapping unverified)' % (cb[0], cb[1], (f.get('hull') or {}).get('size'), w, h))
        if sp:
            e.update({k: v for k, v in sp.items()})
            if n not in GROUND:
                pass
            e['ground'] = True
        else:
            e.update(nofloor=True, floor=None, floorOrigin=[-8 * w, -8 * h])
            if not f.get('colliders_raw'):
                e['fill'] = [-8 * w, -8 * h, 8 * w, 8 * h]
                notes.append('no colliders decoded: footprint shown as one solid no-build tile (interior unknown)')
            else:
                e['ground'] = n in GROUND
                if n in HATCH:
                    e['hatch'] = 'interior'
        e['source'] = 'decoded from EA files (BPO %s: colliders, BlockBounds, ItemCost); not tested in game' % n[4:]
        d = desc(n)
        if d:
            e['description'] = d
        if n == 'BPO_Station_03':
            notes.append("label = the user's name '2x2 C' (in-game text key not extractable)")
        if derived:
            notes.append('label derived from the asset id (in-game text key not extractable)')
        r = sorted(unl.get(n, []))
        e['research'] = r
        if not r:
            e['researchNote'] = 'no RSC_* unlock found in EA data (unknown)'
        e['confidence'] = 'decoded from EA assets, untested in game'
        e['icon'] = None if n in NO_ICON else n
        if n in NO_ICON:
            e['iconNote'] = 'EA icon property T_Station has no texture in the extracted files: placeholder'
        lv = levels(n)
        if lv > 1:
            e['levels'] = lv
        ic = f['ea']['item_cost']
        e['cost'] = [[k, v] for k, v in ic.items()]
        if f['ea']['default_machines']:
            notes.append('default machines: ' + ', '.join(m['class'][4:] for m in f['ea']['default_machines'][:4]) + (' ...' if len(f['ea']['default_machines']) > 4 else ''))
        if notes:
            e['note'] = '; '.join(notes)
        out[n] = e
    # duplicate labels: append the asset suffix
    for lab, ns in labels.items():
        if len(ns) > 1:
            for n in ns:
                out[n]['label'] = '%s (%s)' % (lab, n[4:])
    return out


def main():
    new = build()
    for n, e in new.items():
        old = B.get(n, {})
        keep = {k: old[k] for k in ('entrance', 'wallIdx', 'ring', 'drop', 'chain', 'polys') if k in old and k not in e}
        B[n] = {**e, **keep} if n in B and old.get('add') else e
    # levels for every existing catalog block (decoded BlockBounds z / 4); changes only existing entries that lack it
    for n, e in B.items():
        if e.get('add') or e.get('mirrorOf') or n not in fl:
            continue
        lv = levels(n)
        if lv > 1:
            e['levels'] = lv
        else:
            e.pop('levels', None)
    # demo wording / flags (E1)
    for e in B.values():
        e.pop('lockedInDemo', None)
        for k in ('source', 'confidence'):
            if isinstance(e.get(k), str):
                e[k] = e[k].replace('; bLockedInDemo', '').replace('locked in demo, ', '').replace('; locked in demo', '')
    with open(P, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(src, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print('ADD (%d):' % len(new))
    for n, e in new.items():
        print('  %-28s %-17s %dx%d lv%d floor=%s  %s' % (n, e['category'], e['w'], e['h'], e.get('levels', 1), 'yes' if e.get('floor') else 'no', e['label']))
    print('EXCLUDE:', EXCLUDE)


if __name__ == '__main__':
    main()
