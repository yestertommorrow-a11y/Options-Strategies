const fs=require('fs'),babel=require('./babel.min.cjs');
const html=fs.readFileSync('outputs/optionstrat_color_lab.html','utf8');const code=html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];
const compiled=babel.transform(code,{presets:['react','typescript'],filename:'app.tsx'}).code;
fs.writeFileSync('work/compiled-app.mjs',compiled);console.log('Full React code compiled successfully');
