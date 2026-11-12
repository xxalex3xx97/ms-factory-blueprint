"""Patch the generated CATALOG line of js/catalog.js with EA data (python -I extract/ea_catalog.py). Idempotent.

Replaces the old index.html pipeline (build_catalog4/inject_catalog in the mod repo) for the EA update; edits only what EA data decides:
- recipes: rebuilt from extract/rea/recipes_labeled.json (by_crafter) like build_catalog4 (o/i/t=time_raw)
- items: names for every recipe item that is missing (ITEM_StrangeMatterCrystal: EA string typo "StrangegMatterCrystal" -> "Strange Matter Crystal"; Thruster; UpgradeShipSpeed_1/_2 keep the asset id as label)
- research: every RSC_* of extract/rea/research.json {requires, unlocks}
- blocks (the 18 base blocks): cost + research from EA (floors.json ea.item_cost, research unlocks) when EA has them
- buildables: Container / Large Container portsLayout.toggleable=true (EA: toggleable ports); DAT_DeepSpaceObservatory + DAT_T1Observatory
  (hidden, footprint/ports/power UNKNOWN: no w/h; EA DAT_DeepSpaceObservatory has no MachineDimensions)
Icons: python -I extract/hd_icons.py --catalog js/catalog.js (MS_MODS_ROOT=F:\\MSEAroot).
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
CAT = os.path.join(HERE, '..', 'js', 'catalog.js')
rd = lambda n: json.load(open(os.path.join(HERE, n), encoding='utf-8'))
RC, RS, IT, MA, FL = rd('rea/recipes_labeled.json')['by_crafter'], rd('rea/research.json'), rd('rea/items.json'), rd('rea/machines.json'), rd('floors.json')['blocks']
ITEM_FIX = {'ITEM_StrangeMatterCrystal': 'Strange Matter Crystal'}

t = open(CAT, encoding='utf-8', newline='').read()
ls = t.split('\n')
ix = [i for i, l in enumerate(ls) if l.startswith('const CATALOG = ')]
assert len(ix) == 1
eol = '\r' if ls[ix[0]].endswith('\r') else ''
cat = json.loads(ls[ix[0]][len('const CATALOG = '):].rstrip('\r;'))
rep = []

# recipes
nm = {}
for rs in RC.values():
    for r in rs:
        for x in r['inputs'] + [r['output']]:
            nm[x['id']] = x['item']
rec = {c: [{'o': [r['output']['id'], r['output']['count']], 'i': [[x['id'], x['count']] for x in r['inputs']], 't': r['time_raw']} for r in rs] for c, rs in RC.items()}
rep.append('recipes %d -> %d (crafters %d -> %d)' % (sum(map(len, cat['recipes'].values())), sum(map(len, rec.values())), len(cat['recipes']), len(rec)))
cat['recipes'] = rec
# items
miss = []
need = {x[0] for rs in rec.values() for r in rs for x in [r['o']] + r['i']}
for i in sorted(need):
    if i not in cat['items']:
        n = ITEM_FIX.get(i) or nm.get(i)   # game label from the recipe data (UpgradeShipSpeed_x: the game data has only the asset id as label)
        if n:
            cat['items'][i] = {'n': n}
            miss.append('+' + i)
        else:
            miss.append('?' + i)   # WIP clone item / name unknown: not added
rep.append('items: ' + ', '.join(miss))
# research
old_r = len(cat['research'])
cat['research'] = {k: {'requires': v.get('requires', []), 'unlocks': v.get('unlocks', [])} for k, v in RS.items()}
rep.append('research %d -> %d' % (old_r, len(cat['research'])))
unl = {}
for k, v in RS.items():
    for u in v.get('unlocks', []):
        unl.setdefault(u, []).append(k)
# base blocks
ch = []
for b in cat['blocks']:
    f = FL.get(b['name'])
    ic = (f or {}).get('ea', {}).get('item_cost')
    if ic:
        c = [[k, v] for k, v in ic.items()]
        if b.get('cost') != c:
            ch.append('cost %s %s -> %s' % (b['name'], b.get('cost'), c))
            b['cost'] = c
    r = sorted(unl.get(b['name'], []))
    if r and b.get('research') != r:
        ch.append('research %s %s -> %s' % (b['name'], b.get('research'), r))
        b['research'] = r
rep.extend(ch)
# demo-era wording (E1): the 2x2 C is a normal block now; balcony buildability is unknown, not 'non-buildable'
TXT = {'second floor is a non-buildable balcony; treat as 2x2 A': 'second floor balcony: buildability unknown (needs live probe); treat as 2x2 A',
       'the locked 2x2 C)': 'the 2x2 C)'}
for b in cat['blocks']:
    for k, v in b.items():
        if isinstance(v, str):
            for x, y in TXT.items():
                v = v.replace(x, y)
            b[k] = v
# buildables
bd = {b['id']: b for b in cat['buildables']}
for i in ('DAT_Container', 'DAT_Container_2'):
    bd[i]['portsLayout']['toggleable'] = True
rep.append('toggleable: Container, Large Container')
UNK = 'footprint/ports/power unknown (EA data has no MachineDimensions)'
if 'DAT_DeepSpaceObservatory' not in bd:
    cat['buildables'].append({'id': 'DAT_DeepSpaceObservatory', 'name': 'DeepSpaceObservatory', 'category': 'Machine', 'research': ['RSC_DeepSpaceObservatory'],
                              'machineClass': None, 'stationOnly': True, 'hidden': True, 'label': 'Deep Space Observatory', 'verified': False, 'source': 'EA game data',
                              'evidence': UNK, 'note': 'Deep Space Observatory machine (BPO_DeepSpaceObservatoryMachine, assembler child): ' + UNK, 'inMenu': False,
                              'directional': False, 'crafters': ['CRAFT_DeepSpaceObservatory'], 'icon': None})
if 'DAT_T1Observatory' not in bd:
    cat['buildables'].append({'id': 'DAT_T1Observatory', 'name': 'T1Observatory', 'category': 'Machine', 'research': ['RSC_T1Observatory'], 'machineClass': None,
                              'stationOnly': True, 'hidden': True, 'label': 'Observatory', 'verified': False, 'source': 'EA game data',
                              'evidence': 'EA DAT_T1Observatory has no size/ports', 'note': 'T1 Observatory (BP_StationBuildProgressObject): ' + UNK, 'inMenu': False,
                              'directional': False, 'cost': [['ITEM_HullPlates', 10], ['ITEM_Silica', 10]], 'icon': None})
ls[ix[0]] = 'const CATALOG = ' + json.dumps(cat, separators=(',', ':'), ensure_ascii=True).replace('</', '<\\/') + ';' + eol
open(CAT, 'w', encoding='utf-8', newline='').write('\n'.join(ls))
print('\n'.join(rep))
