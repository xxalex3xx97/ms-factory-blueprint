// QUICK gate (target <= 4 min): one representative per feature, 4 parallel node workers (one browser each), page compose memo on, per-job FAIL lines + table.
// Covers: Basic Motor 100 + groups ac:30 (cmp_groups), normal docks (cmp_dockedge Nickel/Capacitor/Enzyme 2x2, 2x2c),
// industrial docks (cmp_indonly Capacitor/Nickel 2x2, 2x2c), placed world BC100 2x2 no docks / ind / nrm (cmp_placed), Armoury Backpack Mk1 no heavy (cmp_armoury), ports_gc_sc, plan_rk, tpl_plan + tpl_iface.
// NOT here (see full.mjs): Exoskeleton Mk3, big rates (Capacitor 1000, BC 600), the full block x dock matrices.
// Run: node tests/quick.mjs   Exit 1 on any FAIL.
import {runJobs} from './lib/pool.mjs';
const J = (file, args, env, tag) => ({name: file + (tag ? ' ' + tag : ''), file, args, env});
const jobs = [
  J('cmp_placed', ['BC100 Mk1 2x2'], {}, 'BC100 2x2'),
  J('cmp_indonly', [], {CASE: 'Capacitor 2x2c? ind both|Nickel Plates 2x2 ind both'}, 'Capacitor/Nickel'),
  J('cmp_dockedge', ['Capacitor 100 2x2c|Nickel 480 2x2 |Enzyme 30 2x2 '], {}, 'Cap/Nickel/Enzyme'),
  J('cmp_armoury', [], {ARM_ONLY: 'Backpack Mk. 1'}, 'Backpack Mk1'),
  J('cmp_groups', ['basicmotor:100,ac:30'], {}, 'basicmotor:100 ac:30'),
  J('ports_gc_sc'), J('plan_rk'), J('tpl_plan'), J('tpl_iface'),
];
process.exit(await runJobs(jobs, +process.env.CONC || 4, 'quick') ? 1 : 0);
