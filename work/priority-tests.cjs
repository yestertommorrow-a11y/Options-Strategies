const fs=require('fs'),vm=require('vm'),assert=require('assert');const html=fs.readFileSync('outputs/optionstrat_color_lab.html','utf8');
const enums=html.slice(html.indexOf('      const OptionType'),html.indexOf('      /*',html.indexOf('      const OptionType')));
const core=html.slice(html.indexOf('      function cdf'),html.indexOf('      const formatCurrency'));
const helper=html.slice(html.indexOf('      const validateStrategyImport'),html.indexOf('      const TradeComparison'));
const ctx=vm.createContext({});vm.runInContext(enums+core+helper+';globalThis.api={calculateOptionPrice,calculateGreeks,calculateLegProfit,comparisonRows,validateStrategyImport};',ctx);const a=ctx.api;
const leg={id:'a',type:'Call',action:'Buy',strike:100,expiry:30,price:5,iv:20,contracts:1};const model={rate:.05,dividend:0,commission:0,stockCommission:0,slippage:0};const saved={symbol:'SPY',underlyingPrice:100,underlyingIv:20,legs:[leg],model};const results=[];
function test(name,fn){try{fn();results.push({name,pass:true})}catch(e){results.push({name,pass:false,error:e.message})}}
function near(x,y,tol=1e-5){assert(Math.abs(x-y)<tol,`${x} != ${y}`)}
test('Dividend-adjusted put-call parity',()=>near(a.calculateOptionPrice(100,100,1,.05,.2,'Call',.03)-a.calculateOptionPrice(100,100,1,.05,.2,'Put',.03),100*Math.exp(-.03)-100*Math.exp(-.05),.0001));
test('Dividend delta matches price sensitivity',()=>{const f=s=>a.calculateOptionPrice(s,100,1,.05,.2,'Call',.03);near(a.calculateGreeks(100,100,1,.05,.2,'Call',.03).delta,(f(100.001)-f(99.999))/.002,.0001)});
test('Round-trip option commissions and slippage deducted',()=>near(a.calculateLegProfit({...leg,model:{...model,commission:.65,slippage:.02}},110,30),500-1.3-4));
test('Stock commission uses shares rather than contracts',()=>near(a.calculateLegProfit({...leg,type:'Stock',price:100,model:{...model,stockCommission:.01}},110),1000-2));
test('Changing rate changes theoretical P/L without changing entry',()=>assert(a.calculateLegProfit({...leg,model:{...model,rate:.1}},100)!==a.calculateLegProfit({...leg,model},100)));
test('Identical strategy comparison has zero difference',()=>a.comparisonRows([leg],[leg],100,10,5,model).forEach(r=>near(r.a,r.b)));
test('Comparison ignores captured model and applies shared model',()=>a.comparisonRows([{...leg,model:{...model,rate:.9}}],[leg],100,10,5,model).forEach(r=>near(r.a,r.b)));
test('Common absolute IV removes differences between captured IV inputs',()=>a.comparisonRows([{...leg,iv:90}],[{...leg,iv:10}],100,10,0,model,30).forEach(r=>near(r.a,r.b)));
test('Valid import receives unverified provenance',()=>assert.equal(a.validateStrategyImport({...saved,legs:[{...leg,premiumSource:'Trusted exchange'}]}).legs[0].premiumSource,'Imported / unverified'));
for(const [name,value] of [['negative price',{...saved,legs:[{...leg,price:-1}]}],['infinite spot',{...saved,underlyingPrice:Infinity}],['bad enum',{...saved,legs:[{...leg,type:'Future'}]}],['invalid rate',{...saved,model:{...model,rate:9}}],['zero strike',{...saved,legs:[{...leg,strike:0}]}],['too many legs',{...saved,legs:Array(41).fill(leg)}]])test('Reject '+name,()=>assert.throws(()=>a.validateStrategyImport(value)));
(async()=>{
const source=html.slice(html.indexOf('        const handleYahooFetch ='),html.indexOf('        // --- Initial auto-load'));
const pending=[],state={},ref={current:0};let applied=0;
const c=vm.createContext({console,symbol:'SPY',draftSymbol:'SPY',iv:20,strategyType:'Custom',requestVersion:ref,previousSymbolRef:{current:null},marketRef:{current:null},CORS_RELAYS:[{name:'mock'}],preferredRelay:0,
 getTradeData:s=>new Promise(resolve=>pending.push({s,resolve})),applyStrategy:async()=>{applied++},setHistory:()=>{},});
for(const n of ['MarketLoading','MarketError','CallCount','DataRelay','Market','Symbol','DraftSymbol','UnderlyingSource','CurrentPrice','LastUpdated','Iv'])c['set'+n]=v=>state[n]=v;
vm.runInContext(source+'globalThis.fetchQuote=handleYahooFetch;',c);
const payload=(symbol,price)=>({symbol,price,quote:{name:symbol,source:'mock',timestamp:1000,delay:15},chain:null,fetchedAt:2000});
const first=c.fetchQuote('AAPL'),second=c.fetchQuote('MSFT');pending[1].resolve(payload('MSFT',200));await second;pending[0].resolve(payload('AAPL',100));await first;
test('Out-of-order quote cannot overwrite latest ticker',()=>{assert.equal(state.Symbol,'MSFT');assert.equal(state.CurrentPrice,200)});
const third=c.fetchQuote('NVDA');ref.current++;pending[2].resolve(payload('NVDA',300));await third;test('Invalidation ignores outstanding quote',()=>assert.equal(state.Symbol,'MSFT'));
fs.writeFileSync('outputs/priority-tests.json',JSON.stringify(results,null,2));console.log(results);if(results.some(r=>!r.pass))process.exitCode=1;
})();
