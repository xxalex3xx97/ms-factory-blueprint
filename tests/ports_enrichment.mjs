// Enrichment chamber game port byte order (user game test 2026-11-23): byte -> face/position. Run: node tests/ports_enrichment.mjs   Exit 1 on FAIL.
import fs from 'fs';
import vm from 'vm';
vm.runInThisContext(fs.readFileSync(new URL('../js/port_order.js', import.meta.url), 'utf8') + ';globalThis.PORT_ORDER=PORT_ORDER');
const t = PORT_ORDER.DAT_EnrichmentChamber;
const WANT = ['9,0', '9,-4', '9,4', '0,9', '-4,9', '4,9', '-9,0', '-9,-4', '-9,4', '0,-9', '-4,-9', '4,-9'];
const ok = t.verified && JSON.stringify(t.cells.map(q => q.join(','))) === JSON.stringify(WANT);
console.log((ok ? 'PASS' : 'FAIL') + ' Enrichment PORT_ORDER');
process.exit(ok ? 0 : 1);
