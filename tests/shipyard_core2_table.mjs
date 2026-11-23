// Shipyard Core Mk2 export must carry its table (BPO_ShipyardBlockDock_02) like Mk1. Run: node tests/shipyard_core2_table.mjs   Exit 1 on FAIL.
import fs from 'fs';
import vm from 'vm';
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
for (const f of ['config', 'sav_template', 'sav_icon', 'sav_export'])
  vm.runInThisContext(fs.readFileSync(ROOT + 'js/' + f + '.js', 'utf8'), f + '.js');
const i32 = (u8, o = 0) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getInt32(o, true);
const raw = (e, n) => savFind(e, n).val[1];
let fails = 0;
const chk = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) fails++ };
const blk = (cls, X, Y, R) => ({Class: '/Game/Blueprints/BuildingBlocks/' + cls + '.' + cls + '_C', GridLocation: {X, Y}, Height: 4, GridRotation: R, BlockID: 1, PaletteID: 0});
// game-built Mk2 (Musus II Central): block (-8,-2) H28 rot 2 -> table (-96,-16) H224 rot 0
const j = {Version: 2, DisplayName: 't', Blocks: [{...blk('BPO_ShipyardCore_02', -8, -2, 2), Height: 28}], DefaultMachines: []};
const re = savLoad(new Uint8Array(Buffer.from(savExport(j).bytes)));
const b = savFind(savFind(re.props, 'Blueprint').val[1], 'Blocks').val[1][0];
const ms = savFind(b, 'DefaultMachines').val[1];
chk(ms.length === 1, 'Mk2 core has 1 hosted machine');
const m = ms[0], cls = savFstrR(raw(m, 'Class'), 0)[0];
chk(/BPO_ShipyardBlockDock_02/.test(cls), 'hosted machine is BPO_ShipyardBlockDock_02: ' + cls);
const t = raw(m, 'Transform'), g = savFind(t, 'GridLocation').val[1];
chk(i32(g, 0) === -96 && i32(g, 4) === -16 && i32(savFind(t, 'Height').val[1]) === 224 && i32(savFind(t, 'GridRotation').val[1]) === 0, 'position/height/rotation match the game-built one');
process.exit(fails ? 1 : 0);
