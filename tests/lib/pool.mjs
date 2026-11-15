// Process pool for the runners: runJobs([{name, file, args?, env?}], conc) runs 'node tests/<file>.mjs args' (one browser each, page compose memo on), prints a pass/fail + seconds table, returns failed count.
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
const T = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function runJobs(jobs, conc = +process.env.CONC || 4, label = 'run') {
  const t00 = Date.now(), res = []; let i = 0;
  const one = j => new Promise(ok => {
    const t = Date.now(); let buf = '';
    const p = spawn('node', [path.join(T, j.file + '.mjs'), ...(j.args || [])], {env: {...process.env, ...(j.env || {})}});
    p.stdout.on('data', d => buf += d); p.stderr.on('data', d => buf += d);
    p.on('close', c => { const r = {name: j.name || j.file, sec: Math.round((Date.now() - t) / 1000), code: c, fails: (buf.match(/^FAIL/gm) || []).length, last: buf.trim().split('\n').pop().slice(0, 90), out: buf}; res.push(r); console.log((c ? 'FAIL ' : 'ok   ') + r.name + ' ' + r.sec + 's'); ok() });
  });
  await Promise.all(Array.from({length: conc}, async () => { while (i < jobs.length) await one(jobs[i++]) }));
  console.log('\n' + 'job'.padEnd(34) + 'sec   result');
  res.sort((a, b) => a.name.localeCompare(b.name)).forEach(r => console.log(r.name.padEnd(34) + String(r.sec).padEnd(6) + (r.code ? 'FAIL (exit ' + r.code + ', ' + r.fails + ' FAIL lines) ' + r.last : 'pass')));
  const bad = res.filter(r => r.code);
  bad.forEach(r => console.log('\n--- ' + r.name + ' FAIL lines\n' + r.out.split('\n').filter(l => /^FAIL|FAILS|page errors/.test(l)).slice(0, 8).join('\n')));
  console.log('\n' + label + ': ' + (jobs.length - bad.length) + '/' + jobs.length + ' pass, wall ' + Math.round((Date.now() - t00) / 1000) + 's');
  return bad.length;
}
