const fs=require('fs'),vm=require('vm');
function load(file){const html=fs.readFileSync(file,'utf8'); const ctx=vm.createContext({console,Math,Date,Number,Map,Set});
 const enums=html.slice(html.indexOf('      const OptionType'),html.indexOf('      /*',html.indexOf('      const OptionType')));
 const core=html.slice(html.indexOf('      function cdf'),html.indexOf('      const formatCurrency'));
 vm.runInContext(enums+core+';globalThis.api={bsCall,bsPut,calculateGreeks,calculateStrategyMetrics,generatePayoffData,calculateLegProfit};',ctx);return {html,ctx,api:ctx.api};}
const leg=(extra={})=>({id:'x',type:'Call',action:'Buy',strike:100,expiry:30,iv:20,price:5,contracts:1,...extra});
const cases=[]; function test(name,fn){cases.push({name,fn});} const near=(a,b,t=1e-5)=>{if(!Number.isFinite(a)||Math.abs(a-b)>t)throw Error(`${a} != ${b}`)};
test('Zero-IV ATM call remains finite',a=>near(a.bsCall(100,100,1,0,0),0));
test('Zero-IV call includes discounted strike',a=>near(a.bsCall(100,100,1,.05,0),100-100*Math.exp(-.05)));
test('Zero-IV ATM put remains finite',a=>near(a.bsPut(100,100,1,0,0),0));
test('Zero-spot put boundary',a=>near(a.bsPut(0,100,1,.05,.2),100*Math.exp(-.05)));
test('Zero-IV Greeks finite',a=>{for(const v of Object.values(a.calculateGreeks(100,100,1,0,0,'Call')))if(!Number.isFinite(v))throw Error('Nonfinite Greek')});
test('Short-dated unexpired ATM delta not zero',a=>{const d=a.calculateGreeks(100,100,.001,0,.2,'Call').delta;if(d<.49||d>.51)throw Error('Delta '+d)});
test('Long call breakeven exactly on grid',a=>near(a.calculateStrategyMetrics([leg()]).breakevens[0],105));
test('Narrow butterfly maximum at strike',a=>{const legs=[leg({strike:100.1,price:.1}),leg({strike:100.2,price:0,contracts:2,action:'Sell'}),leg({strike:100.3,price:0})]; near(a.calculateStrategyMetrics(legs).maxProfit,0,1e-6)});
test('Long call unlimited gain, bounded loss',a=>{const m=a.calculateStrategyMetrics([leg()]);if(m.maxProfit!=='Unlimited')throw Error('Not unlimited');near(m.maxLoss,-500)});
test('Credit spread bounds',a=>{const m=a.calculateStrategyMetrics([leg({action:'Sell',price:3}),leg({strike:110,price:1})]);near(m.maxProfit,200);near(m.maxLoss,-800);near(m.breakevens[0],102)});
test('Calendar marked approximate',a=>{if(!a.calculateStrategyMetrics([leg(),leg({expiry:60,action:'Sell'})]).approximate)throw Error('Missing estimate label')});
test('IV shift to zero produces finite chart',a=>{const rows=a.generatePayoffData([leg()],100,0,-20);if(rows.some(r=>!Number.isFinite(r.currentPL)))throw Error('NaN in chart')});
test('Stock lot P/L is 100 shares',a=>near(a.calculateLegProfit(leg({type:'Stock',price:100,strike:0}),110),1000));
test('Black-Scholes reference call',a=>near(a.bsCall(100,100,1,.05,.2),10.45058,.0001));
test('Put-call parity',a=>near(a.bsCall(110,100,.5,.05,.3)-a.bsPut(110,100,.5,.05,.3),110-100*Math.exp(-.025),.0001));
const results=[];
// The original baseline is optional (it is not published); compare against it only when present.
const FILES=['work/original.html','outputs/optionstrat_color_lab.html'].filter(f=>fs.existsSync(f));
for(const file of FILES){const {api,html,ctx}=load(file);for(const {name,fn} of cases){try{fn(api);results.push({file,test:name,pass:true})}catch(e){results.push({file,test:name,pass:false,error:e.message})}}
}
// Execute the actual form update handler with simulated data-entry values.
for(const file of FILES){const {html,ctx}=load(file);let start=html.indexOf('        const updateLeg =');let end=html.indexOf('        const totalCost',start);const source=html.slice(start,end);
for(const [name,input,field,value,check] of [
 ['Stock to call restores valid strike',leg({type:'Stock',strike:0,expiry:0,iv:0,price:100}),'type','Call',l=>l.strike>0&&Number.isFinite(l.price)],
 ['Infinite numeric input rejected',leg(),'iv','1e309',l=>Number.isFinite(l.iv)&&Number.isFinite(l.price)],
 ['Negative premium clamped',leg(),'price','-4',l=>l.price===0],
 ['Negative DTE clamped',leg(),'expiry','-3',l=>l.expiry===0],
 ['Fractional stock lot supported',leg({type:'Stock'}),'contracts','0.25',l=>l.contracts===.25]
 ]){ctx.legs=[input];ctx.stockPrice=100;ctx.iv30=20;ctx.model={rate:.05,dividend:0};ctx.chainLookup=()=>null;let output;ctx.setLegs=x=>output=x;try{vm.runInContext('{'+source+'updateLeg("x",'+JSON.stringify(field)+','+JSON.stringify(value)+');}',ctx);if(!check(output[0]))throw Error(JSON.stringify(output[0]));results.push({file,test:name,pass:true});}catch(e){results.push({file,test:name,pass:false,error:e.message})}}}
fs.writeFileSync('outputs/color-lab-regression-tests.json',JSON.stringify(results,null,2));
for(const file of FILES){const r=results.filter(x=>x.file===file);console.log(file, r.filter(x=>x.pass).length+'/'+r.length);for(const f of r.filter(x=>!x.pass))console.log('FAIL',f.test,f.error)}
// S13: this used to test for 'fixed' in the file name, which never matched, so it never failed.
if(results.some(x=>x.file==='outputs/optionstrat_color_lab.html'&&!x.pass))process.exitCode=1;


