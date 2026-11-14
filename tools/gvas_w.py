import struct,sys
NATIVE={'Color','IntPoint','Guid','Vector','Rotator','DateTime','Vector2D','Quat','LinearColor','Transform'}
class P:  # prop
    def __init__(s,name,t,flags,extra,val): s.name=name;s.t=t;s.flags=flags;s.extra=extra;s.val=val
    # val: ('props',[P]) | ('sarr',[[P]]) | ('raw',bytes)
def fstr_r(d,p):
    n=struct.unpack_from('<i',d,p)[0]; p+=4
    if n==0: return '',p
    if n>0: return d[p:p+n-1].decode('latin1'),p+n
    return d[p:p-2*n-2].decode('utf-16le'),p-2*n
def fstr_w(s):
    if s=='': return struct.pack('<i',0)
    try: b=s.encode('latin1')+b'\0'; return struct.pack('<i',len(b))+b
    except UnicodeEncodeError:
        b=(s+'\0').encode('utf-16le'); return struct.pack('<i',-(len(b)//2))+b
def tn_r(d,p):
    n,p=fstr_r(d,p); c=struct.unpack_from('<i',d,p)[0]; p+=4; ch=[]
    for _ in range(c): x,p=tn_r(d,p); ch.append(x)
    return (n,ch),p
def tn_w(t): return fstr_w(t[0])+struct.pack('<i',len(t[1]))+b''.join(tn_w(c) for c in t[1])
def structname(t): return t[1][0][0] if t[1] else ''
def props_r(d,p):
    out=[]
    while True:
        name,p=fstr_r(d,p)
        if name=='None': return out,p
        t,p=tn_r(d,p); size,flags=struct.unpack_from('<iB',d,p); p+=5
        ex=b''
        n=(16 if flags&2 else 0)+(4 if flags&1 else 0)+(1 if flags&4 else 0)
        ex=d[p:p+n]; p+=n; end=p+size
        if t[0]=='StructProperty' and structname(t) not in NATIVE:
            v,q=props_r(d,p); val=('props',v)
        elif t[0]=='ArrayProperty' and t[1][0][0]=='StructProperty' and structname(t[1][0]) not in NATIVE:
            c=struct.unpack_from('<i',d,p)[0]; q=p+4; els=[]
            for _ in range(c): e,q=props_r(d,q); els.append(e)
            val=('sarr',els)
        else: val=('raw',d[p:end]); q=end
        assert q==end,(name,t,q,end)
        out.append(P(name,t,flags,ex,val)); p=end
def payload(v):
    if v[0]=='raw': return v[1]
    if v[0]=='props': return props_w(v[1])
    return struct.pack('<i',len(v[1]))+b''.join(props_w(e) for e in v[1])
def props_w(ps):
    o=[]
    for x in ps:
        pl=payload(x.val); o.append(fstr_w(x.name)+tn_w(x.t)+struct.pack('<iB',len(pl),x.flags)+x.extra+pl)
    o.append(fstr_w('None')); return b''.join(o)
def load(d):
    assert d[:4]==b'GVAS'; p=16+6+4
    _,p=fstr_r(d,p); p+=4; n=struct.unpack_from('<i',d,p)[0]; p+=4+n*20
    _,p=fstr_r(d,p); p+=1
    hdr=d[:p]; ps,p=props_r(d,p); return hdr,ps,d[p:]
def dump(h,ps,tail): return h+props_w(ps)+tail
def find(ps,name): return next(x for x in ps if x.name==name)
if __name__=='__main__':
    for f in sys.argv[1:]:
        d=open(f,'rb').read(); print(f,dump(*load(d))==d)
