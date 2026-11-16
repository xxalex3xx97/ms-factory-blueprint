// FULL gate (target well under 30 min): every wider gate file, 4 parallel node workers (one browser each), page compose memo on, MUT=12 (full mutation pass), per-file pass/fail + seconds table.
// Covers: c7d c7h s12 compact layout dockedge dockfb placed placed_enz poollanes armoury(no ARM_HEAVY) route hub indonly groups groups_placed, ports_gc_sc, plan_rk, tpl_* (refinery, assembler x3, enrichment x2, advassembler x2, growth, special, iface, lanes, plan).
// Longest files start first so the wall time is about the longest single file. Env: CONC (workers, default 4), ARM_HEAVY=1 adds Exoskeleton Mk3.
// Run: node tests/full.mjs   Exit 1 on any FAIL.
import {runJobs} from './lib/pool.mjs';
const slow = ['cmp_indonly', 'cmp_c7h', 'cmp_armoury', 'cmp_placed', 'cmp_s12', 'cmp_groups_placed'];
const rest = ['cmp_dockedge', 'cmp_compact', 'cmp_c7d', 'cmp_placed_enz', 'cmp_poollanes', 'cmp_dockfb', 'cmp_layout', 'cmp_route', 'cmp_hub', 'cmp_groups', 'ports_gc_sc', 'plan_rk',
  'tpl_refinery_1in', 'tpl_assembler_1in', 'tpl_assembler_2in', 'tpl_assembler_3in', 'tpl_enrichment_1in', 'tpl_enrichment_2_3in', 'tpl_advassembler_1_2in', 'tpl_advassembler_4in', 'tpl_growth_2_3_4in', 'tpl_supercomputer_2in', 'tpl_special_machines', 'tpl_iface', 'tpl_lanes', 'tpl_plan'];
process.exit(await runJobs([...slow, ...rest].map(file => ({file, env: {MUT: '12'}})), +process.env.CONC || 4, 'full') ? 1 : 0);
