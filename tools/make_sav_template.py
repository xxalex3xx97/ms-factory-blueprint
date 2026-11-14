import sys,os,struct,base64,json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gvas_w as g
# usage: python -I make_sav_template.py SRC OUT.js
SRC,OUT=sys.argv[1],sys.argv[2]
d=open(SRC,'rb').read()
h,ps,tail=g.load(d)
assert g.dump(h,ps,tail)==d; print('roundtrip ok')
bp=g.find(ps,'Blueprint').val[1]

def cls(e): return g.fstr_r(g.find(e,'Class').val[1],0)[0]
def short(p): return p.split('/')[-1].split('.')[0]
def tr(e):
    t=g.find(e,'Transform')
    if t.val[0]!='props': print('NEEDS-THINKING: Transform is not a props struct'); sys.exit(1)
    return {x.name:x.val[1] for x in t.val[1]}
def gl(e): return struct.unpack('<ii',tr(e)['GridLocation'])
def hgt(e): return struct.unpack('<i',tr(e)['Height'])[0]
def rot(e): return struct.unpack('<i',tr(e)['GridRotation'])[0]
def cfg(e):
    try: r=g.find(e,'SerializedMachineConfig').val[1]
    except StopIteration: return ''
    return r[4:].hex()
def inv(dx,dy,r):
    for _ in range(r%4): dx,dy=dy,-dx
    return dx,dy
def kind(c):  # same substrings as cfgKind in js/config.js
    c=c.lower()
    if 'splitter' in c or 'beltbalancer' in c: return 'splitter'
    if 'underground' in c: return 'underground'
    if 'miningdronebay' in c: return 'dronebay'
    if 'dock' in c and 'docking' not in c: return 'dock'
    if any(k in c for k in ['assembler','refinery','enrichment','growth','supercomputer','relicsynth']): return 'recipe'
    return None

blocks=g.find(bp,'Blocks').val[1]; conns=g.find(bp,'Connectors').val[1]; mach=g.find(bp,'Machines').val[1]
if not blocks or not conns or not mach:
    print('ERROR: Blocks/Connectors/Machines empty'); sys.exit(1)
bc=blocks+conns
dms=[m for e in bc for m in g.find(e,'DefaultMachines').val[1]]

# Transform sub-prop names check
tn=set()
for e in bc+mach+dms: tn|=set(tr(e))
print('Transform sub-props:',sorted(tn))
if tn!={'GridLocation','Height','GridRotation'}:
    print('NEEDS-THINKING: Transform sub-prop names differ'); sys.exit(1)

# SAV_PATHS
PATHS={}
for e in mach+bc: PATHS[short(cls(e))]=cls(e)
for m in dms: PATHS[short(cls(m))]=cls(m)
# SAV_CONN
CONN=sorted({short(cls(e)) for e in conns})

# SAV_DEFM
# FIX-1: machine pos = 8*block + rotated offset; machine Height = 8*block Height + dh; rot = block rot + dr
def norm_list(b):
    br=rot(b); bx,by=gl(b); bh=hgt(b); out=[]
    for m in g.find(b,'DefaultMachines').val[1]:
        mx,my=gl(m); dx,dy=inv(mx-8*bx,my-8*by,br)
        out.append((cls(m),dx,dy,hgt(m)-8*bh,(rot(m)-br)%4,cfg(m)))
    return out
groups={}
for e in bc:
    if g.find(e,'DefaultMachines').val[1]: groups.setdefault(short(cls(e)),[]).append(e)
DEFM={}; fails=[]; verified=0; total=0
for s,es in groups.items():
    ref=es[0]  # first instance in file order (FIX-1)
    rl=sorted(x[:5] for x in norm_list(ref))
    okc=0
    for e in es:
        total+=1
        nl=sorted(x[:5] for x in norm_list(e))
        if nl==rl: verified+=1; okc+=1
        else: print('DIFF',s,'ref',rl,'got',nl)
    print(s,'OK' if okc==len(es) else 'FAIL',okc,'/',len(es))
    if okc!=len(es): fails.append(s)
    DEFM[s]=[{'c':c,'dx':dx,'dy':dy,'dh':dh,'dr':dr,'hex':hx} for c,dx,dy,dh,dr,hx in norm_list(ref)]
if fails:
    print('NEEDS-THINKING: rotation pattern fails for',fails); sys.exit(1)

# SAV_DEFCFG
DEFCFG={}; seen=set()
for e in mach:
    s=short(cls(e))
    if s in seen: continue
    seen.add(s)
    hx=cfg(e)
    if hx and kind(s) is None: DEFCFG[s]=hx

# Screenshot: blank
sc=g.find(bp,'Screenshot').val[1]
g.find(sc,'GreyscaleValues').val=('raw',struct.pack('<i',0))

# Trim template
g.find(blocks[0],'DefaultMachines').val=('sarr',[])
g.find(conns[0],'DefaultMachines').val=('sarr',[])
g.find(bp,'Blocks').val=('sarr',[blocks[0]])
g.find(bp,'Connectors').val=('sarr',[conns[0]])
g.find(bp,'Machines').val=('sarr',[mach[0]])

out=g.dump(h,ps,tail)
tpl=base64.b64encode(out).decode()
js='const SAV_TPL=%s;const SAV_PATHS=%s;const SAV_CONN=%s;const SAV_DEFM=%s;const SAV_DEFCFG=%s;\n'%(
    json.dumps(tpl),json.dumps(PATHS),json.dumps(CONN),json.dumps(DEFM),json.dumps(DEFCFG))
open(OUT,'w',encoding='utf-8',newline='\n').write(js)

print('SAV_PATHS',len(PATHS),'SAV_CONN',len(CONN),'SAV_DEFM classes',len(DEFM),
      'SAV_DEFM entries',sum(len(v) for v in DEFM.values()),'SAV_DEFCFG',len(DEFCFG))
print('DEFCFG sizes',{k:len(v)//2 for k,v in DEFCFG.items()})
print('rotation instances verified',verified,'of',total)
print('rotation-failing classes',fails if fails else 'none')
print('template bytes',len(out),'base64 chars',len(tpl))
print('OUT',OUT,os.path.getsize(OUT),'bytes')
