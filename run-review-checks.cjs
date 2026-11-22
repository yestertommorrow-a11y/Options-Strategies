const fs=require('fs'),cp=require('child_process');
process.chdir(__dirname);
if(!fs.existsSync('work/babel.min.cjs')){
  console.error([
    'Missing work/babel.min.cjs (Babel standalone 7.26.0, not stored in the repository). Download it first:',
    '  curl -L -o work/babel.min.cjs https://unpkg.com/@babel/standalone@7.26.0/babel.min.js',
  ].join('\n'));
  process.exit(1);
}
for(const file of ['work/compile-check.cjs','work/render-smoke.cjs','work/color-regression.cjs','work/color-tests.cjs','work/priority-tests.cjs','work/claude-fix-tests.cjs']) {
  console.log('\nRunning '+file);
  const result=cp.spawnSync(process.execPath,[file],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
const files=['outputs/color-lab-regression-tests.json','outputs/color-lab-scenario-tests.json','outputs/priority-tests.json','outputs/claude-fix-tests.json'];
let count=0;
for(const file of files){let rows=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));if(file.includes('regression'))rows=rows.filter(r=>r.file==='outputs/optionstrat_color_lab.html');if(!rows.length||rows.some(r=>!r.pass))throw Error('Failed current-app checks: '+file);count+=rows.length;}
console.log('\nCurrent application passed '+count+' logic checks, compilation and mocked rendering. Browser behavior remains unverified.');
