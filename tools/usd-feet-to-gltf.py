# One-time source conversion (not part of the game build). Requires: pip install usd-core
# Usage: python3 tools/usd-feet-to-gltf.py reference/sources/quaternius/ultimate-modular-characters/SK_CasualFeet.usda reference/sources/quaternius/ultimate-modular-characters/casual_feet_right.gltf
# Convert a Quaternius modular-character *Feet* USD file (pair of shoes, Z-up, toe -Y) into a glTF with
# only the RIGHT shoe, Y-up, toe +Z, sole on y=0, flat-shaded, one primitive per original material subset.
import sys, json, base64, struct
from pxr import Usd, UsdGeom, UsdShade

src, dst = sys.argv[1], sys.argv[2]
st = Usd.Stage.Open(src)
mesh = next(UsdGeom.Mesh(p) for p in st.Traverse() if p.GetTypeName() == 'Mesh')
pts = mesh.GetPointsAttr().Get()
counts = mesh.GetFaceVertexCountsAttr().Get()
idx = mesh.GetFaceVertexIndicesAttr().Get()
# face -> material via GeomSubsets
face_mat = {}
mats = {}
for sub in UsdGeom.Subset.GetAllGeomSubsets(mesh):
    b = UsdShade.MaterialBindingAPI(sub.GetPrim()).ComputeBoundMaterial()[0]
    name = b.GetPrim().GetName() if b else sub.GetPrim().GetName()
    col = (0.8, 0.8, 0.8)
    if b:
        for c in b.GetPrim().GetChildren():
            v = UsdShade.Shader(c).GetInput('diffuseColor')
            if v and v.Get() is not None: col = tuple(v.Get())
    mats[name] = col
    for f in sub.GetIndicesAttr().Get(): face_mat[f] = name
# Y-up, toe +Z: (x, y, z)_usd -> (x, z, -y)
conv = lambda p: (p[0], p[2], -p[1])
faces = []
o = 0
for fi, n in enumerate(counts):
    poly = [idx[o + k] for k in range(n)]; o += n
    cx = sum(pts[i][0] for i in poly) / n
    if cx >= 0: continue  # keep right shoe (x < 0)
    faces.append((poly, face_mat.get(fi, next(iter(mats)))))
used = sorted({m for _, m in faces})
P = [conv(pts[i]) for poly, _ in faces for i in poly]
minx = min(p[0] for p in P); maxx = max(p[0] for p in P); miny = min(p[1] for p in P)
cx = (minx + maxx) / 2
prims, buf = [], bytearray()
acc, views = [], []
def add(data, fmt, count, comp, typ, target, mn=None, mx=None):
    while len(buf) % 4: buf.append(0)
    off = len(buf); buf.extend(struct.pack('<' + fmt * (len(data)), *data))
    views.append(dict(buffer=0, byteOffset=off, byteLength=len(buf) - off, target=target))
    a = dict(bufferView=len(views) - 1, componentType=comp, count=count, type=typ)
    if mn: a['min'], a['max'] = mn, mx
    acc.append(a); return len(acc) - 1
for m in used:
    pos, nor = [], []
    for poly, mm in faces:
        if mm != m: continue
        vs = [conv(pts[i]) for i in poly]
        vs = [(v[0] - cx, v[1] - miny, v[2]) for v in vs]
        for k in range(1, len(vs) - 1):
            tri = [vs[0], vs[k], vs[k + 1]]  # (x, y, z) -> (x, z, -y) is a rotation, so winding is preserved
            ax, ay, az = [tri[1][j] - tri[0][j] for j in range(3)]; bx, by, bz = [tri[2][j] - tri[0][j] for j in range(3)]
            nx, ny, nz = ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx
            l = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1
            for v in tri: pos += v; nor += (nx / l, ny / l, nz / l)
    n = len(pos) // 3
    mn = [min(pos[j::3]) for j in range(3)]; mx = [max(pos[j::3]) for j in range(3)]
    pa = add(pos, 'f', n, 5126, 'VEC3', 34962, mn, mx); na = add(nor, 'f', n, 5126, 'VEC3', 34962)
    prims.append(dict(attributes=dict(POSITION=pa, NORMAL=na), material=used.index(m)))
gl = dict(asset=dict(version='2.0', generator='usd_feet_to_gltf.py', copyright='Quaternius (CC0 1.0)'),
          scene=0, scenes=[dict(nodes=[0])], nodes=[dict(name='shoe', mesh=0)], meshes=[dict(name='shoe', primitives=prims)],
          materials=[dict(name=m, pbrMetallicRoughness=dict(baseColorFactor=list(mats[m]) + [1], metallicFactor=0, roughnessFactor=0.7)) for m in used],
          accessors=acc, bufferViews=views,
          buffers=[dict(byteLength=len(buf), uri='data:application/octet-stream;base64,' + base64.b64encode(bytes(buf)).decode())])
json.dump(gl, open(dst, 'w'))
print(dst, 'faces', len(faces), 'mats', used, 'size L x W x H', round(max(p[2] for p in P) - min(p[2] for p in P), 3), round(maxx - minx, 3), round(max(p[1] for p in P) - miny, 3))
