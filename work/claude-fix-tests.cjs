// Regression tests for review findings F1–F8 (see CLAUDE_FINDINGS.txt).
// Runs real source slices from the current HTML in node:vm. Unlike priority-tests.cjs, the
// module-level helpers are evaluated in a context with NO global `symbol`, matching the browser.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('outputs/optionstrat_color_lab.html','utf8');
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw Error('Missing source slice: '+a);return html.slice(i,j);};
const enums=slice('      const OptionType','      /*');
const core=slice('      function cdf','      const formatCurrency');
const data=slice('      const deepExtract','      const TRADE_CACHE')+slice('      const chainContractPrice','      const generatePythonCode');
const helpers=slice('      const validateStrategyImport','      const comparisonRows');
const fetchSrc=slice('        const handleYahooFetch =','        // --- Initial auto-load');
const loadSrc=slice('        const loadSavedStrategy =','        const deleteSavedStrategy');
const persistSrc=slice('        const storageReady = useRef(false);','        // Initial market load');
const updateSrc=slice('        const updateLeg =','        const totalCost');
const saveSrc=slice('        const saveCurrentStrategy =','        const loadSavedStrategy');
const results=[];const pending=[];
const test=(name,fn)=>pending.push((async()=>{try{await fn();results.push({name,pass:true})}catch(e){results.push({name,pass:false,error:e.message})}})());
const setterNames=['MarketLoading','MarketError','CallCount','DataRelay','Market','Symbol','DraftSymbol','UnderlyingSource','CurrentPrice','LastUpdated','Iv','SelectedExpiryEpoch','LoadNotice','Model','StrategyType','CodeVerified'];
const baseContext=()=>{const ctx=vm.createContext({console,Math,Date,Number,Map,Set,String,JSON,Promise,Error,Array,Object});vm.runInContext(enums+core+data+helpers+';globalThis.normalizeCboeOptions=normalizeCboeOptions;',ctx);return ctx;};
const chainFor=(sym,spot)=>{const e=new Date(Date.now()+30*864e5);const ymd=String(e.getUTCFullYear()).slice(2)+String(e.getUTCMonth()+1).padStart(2,'0')+String(e.getUTCDate()).padStart(2,'0');const k=String(spot*1000).padStart(8,'0');
  return {timestamp:'2026-11-20 16:15:00',data:{current_price:spot,iv30:18,options:[{option:`${sym}${ymd}C${k}`,bid:9,ask:9.2,iv:.2},{option:`${sym}${ymd}P${k}`,bid:8,ask:8.2,iv:.22}]}};};
// Runs handleYahooFetch inside a closure that owns App-like state, as in the browser.
const runFetch=async({symbol,previous,chain,fetchSymbol,opts={}})=>{
  const ctx=baseContext();const state={};const calls={apply:[],history:[]};
  ctx.normalized=chain?ctx.normalizeCboeOptions(chainFor(fetchSymbol,chain)):null;
  ctx.getTradeData=async s=>({symbol:s,price:chain||100,fetchedAt:Date.now(),quote:{name:s,source:'Yahoo regular market quote',timestamp:Date.now(),delay:null,prevClose:null},chain:ctx.normalized});
  ctx.applyStrategy=async(t,p,v)=>{calls.apply.push({t,p,v})};ctx.setHistory=v=>calls.history.push(v);
  for(const n of setterNames)ctx['set'+n]=v=>{state[n]=v};
  vm.runInContext(`(function(){let symbol=${JSON.stringify(symbol)},draftSymbol=symbol,iv=20,strategyType='Custom';const requestVersion={current:0},previousSymbolRef={current:${JSON.stringify(previous)}},marketRef={current:null};${fetchSrc};globalThis.fetchQuote=handleYahooFetch;})()`,ctx);
  await ctx.fetchQuote(fetchSymbol,opts);return {state,calls};
};

// ---- F1 ----
test('F1 atmIvFromChain runs without a global symbol',()=>{const ctx=baseContext();ctx.chain=ctx.normalizeCboeOptions(chainFor('SPY',600));
  const iv=vm.runInContext('atmIvFromChain({symbol:"SPY",price:600,chain},600,30,"SPY")',ctx);assert(Math.abs(iv-21)<1e-9,'ATM IV '+iv);
  assert.equal(vm.runInContext('atmIvFromChain({symbol:"SPY",price:600,chain},600,30,"QQQ")',ctx),null);});
test('F1 live fetch with a chain sets IV and rebuilds without error',async()=>{const {state,calls}=await runFetch({symbol:'SPY',previous:null,chain:600,fetchSymbol:'SPY',opts:{rebuild:true,template:'Iron Condor'}});
  assert.equal(state.MarketError,null,'error: '+state.MarketError);assert.equal(state.Iv,21);assert.equal(state.CurrentPrice,600);
  assert.equal(calls.apply.length,1);assert.equal(calls.apply[0].t,'Iron Condor');assert.equal(calls.apply[0].p,600);});
test('F1 new ticker with a chain rebuilds at the new spot',async()=>{const {state,calls}=await runFetch({symbol:'SPY',previous:'SPY',chain:230,fetchSymbol:'AAPL'});
  assert.equal(state.MarketError,null,'error: '+state.MarketError);assert.equal(state.Symbol,'AAPL');assert.equal(calls.apply.length,1);assert.equal(calls.apply[0].p,230);});

// ---- F2 ----
test('F2 loading a saved strategy records its symbol',()=>{const ctx=baseContext();const prev={current:'SPY'};ctx.previousSymbolRef=prev;
  Object.assign(ctx,{marketRef:{current:{}},model:{rate:.05},invalidateQuote:()=>{},setLegs:()=>{},replaceLegs:()=>{},setHistory:()=>{},window:{scrollTo:()=>{}}});
  for(const n of setterNames)ctx['set'+n]=()=>{};
  vm.runInContext(loadSrc+'loadSavedStrategy({symbol:"AAPL",underlyingPrice:230,underlyingIv:25,legs:[],model:{rate:.04}});',ctx);
  assert.equal(prev.current,'AAPL');});
test('F2 refresh of the loaded symbol keeps the loaded legs',async()=>{const {calls}=await runFetch({symbol:'AAPL',previous:'AAPL',chain:null,fetchSymbol:'AAPL'});
  assert.equal(calls.apply.length,0,'applyStrategy called');assert(!calls.history.some(h=>Array.isArray(h)&&!h.length),'history cleared');});
test('F2 explicit fetch of a different ticker still rebuilds',async()=>{const {calls}=await runFetch({symbol:'AAPL',previous:'AAPL',chain:null,fetchSymbol:'MSFT'});assert.equal(calls.apply.length,1);});

// ---- F3 ----
const model={rate:.05,dividend:0,commission:0,stockCommission:0,slippage:0};
const leg={id:'a',type:'Call',action:'Buy',strike:600,expiry:30,iv:18,price:9,contracts:1,model};
const saved=(extra={})=>({id:'s',name:'n',symbol:'SPY',timestamp:1,underlyingPrice:600,underlyingIv:18,model,legs:[leg],...extra});
// Runs the two real persistence effects, in commit order, against a fake localStorage.
const runPersistence=(storedValue,session=[])=>{const ctx=baseContext();const store=new Map();if(storedValue!==undefined)store.set('optionstrat_saved_strategies',storedValue);
  const effects=[];let savedStrategies=session,notice=null;
  Object.assign(ctx,{persistStrategies:true,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},
    useRef:(()=>{const ref={current:false};return ()=>ref;})(),useEffect:fn=>effects.push(fn),setStorageNotice:v=>notice=v,setSavedStrategies:v=>{savedStrategies=typeof v==='function'?v(savedStrategies):v}});
  vm.runInContext('const STORAGE_KEY="optionstrat_saved_strategies",STORAGE_BACKUP_KEY="optionstrat_saved_strategies_backup";globalThis.getSaved=()=>savedStrategies;',ctx);
  ctx.savedStrategies=session;
  vm.runInContext('(function(){'+persistSrc+'})()',ctx);
  effects.forEach(fn=>fn());                                    // commit that enables persistence
  ctx.savedStrategies=savedStrategies;effects.length=0;
  vm.runInContext('(function(){'+persistSrc+'})()',ctx);         // re-render after setSavedStrategies
  effects[1]();                                                 // only the [savedStrategies] effect re-runs
  return {store,savedStrategies,notice,effects,ctx};
};
test('F3 one invalid stored entry no longer wipes the valid ones',()=>{const raw=JSON.stringify([saved(),saved({legs:[]})]);const r=runPersistence(raw);
  assert.equal(r.savedStrategies.length,1);assert.equal(r.store.get('optionstrat_saved_strategies_backup'),raw,'original not backed up');assert(/1 saved strategy was invalid/.test(r.notice||''),'notice '+r.notice);});
test('F3 corrupt JSON is backed up before the main key is rewritten',()=>{const r=runPersistence('{not json');assert.equal(r.store.get('optionstrat_saved_strategies_backup'),'{not json');assert(r.notice);});
test('F3 clean storage loads without backup or notice',()=>{const r=runPersistence(JSON.stringify([saved(),saved()]));assert.equal(r.savedStrategies.length,2);assert(!r.store.has('optionstrat_saved_strategies_backup'));assert.equal(r.notice,null);});
test('F3 parseStoredStrategies validates per entry',()=>{const ctx=baseContext();const p=vm.runInContext('parseStoredStrategies',ctx);
  const r=p(JSON.stringify([saved(),saved({legs:[{...leg,iv:600}]}),null,saved()]));assert.equal(r.valid.length,2);assert.equal(r.rejected,2);assert(r.needsBackup);
  assert.deepEqual({...p('{}'),valid:[]},{valid:[],rejected:0,needsBackup:true});});
const trySave=(legs,{price=600,iv=18,name='My strategy'}={})=>{const ctx=baseContext();const out={alerts:[],saved:null};
  Object.assign(ctx,{strategyType:'Custom',symbol:'SPY',legs,currentPrice:price,iv,model,alert:m=>out.alerts.push(m),window:{prompt:()=>name},setSavedStrategies:f=>{out.saved=f([])}});
  vm.runInContext(saveSrc+'saveCurrentStrategy();',ctx);return out;};
for(const [label,legs,opts] of [['zero legs',[]],['41 legs',Array(41).fill(leg)],['leg IV 600',[{...leg,iv:600}]],['DTE 4000',[{...leg,expiry:4000}]],['underlying 200000',[leg],{price:200000}]])
  test(`F3 save rejects strategy the loader would reject: ${label}`,()=>{const r=trySave(legs,opts);assert.equal(r.saved,null);assert.equal(r.alerts.length,1);assert(/Cannot save/.test(r.alerts[0]));});
test('F3 valid strategy saves and round-trips through the loader',()=>{const r=trySave([leg]);assert.equal(r.alerts.length,0);assert.equal(r.saved.length,1);assert.equal(r.saved[0].name,'My strategy');
  const ctx=baseContext();const p=vm.runInContext('parseStoredStrategies',ctx)(JSON.stringify(r.saved));assert.equal(p.valid.length,1);assert.equal(p.rejected,0);});

// ---- F4 ----
test('F4 enabling persistence merges session and stored strategies',()=>{const session=[saved({id:'sess',name:'session one'})];
  const r=runPersistence(JSON.stringify([saved({id:'b',timestamp:123})]),session);
  assert.deepEqual(r.savedStrategies.map(s=>s.id),['sess','b']);assert.equal(r.savedStrategies[1].timestamp,123);
  const written=JSON.parse(r.store.get('optionstrat_saved_strategies'));assert.deepEqual(written.map(s=>s.id),['sess','b'],'merged list persisted');});
test('F4 session copy wins when ids collide; no duplicates',()=>{const r=runPersistence(JSON.stringify([saved({id:'same',name:'stored'})]),[saved({id:'same',name:'session'})]);
  assert.equal(r.savedStrategies.length,1);assert.equal(r.savedStrategies[0].name,'session');});
test('F4 bad timestamps become null and duplicate or unsafe ids are renamed',()=>{const ctx=baseContext();const p=vm.runInContext('parseStoredStrategies',ctx);
  const r=p(JSON.stringify([saved({id:'d',timestamp:'yesterday'}),saved({id:'d',timestamp:Date.now()+1e12}),saved({id:'<script>',timestamp:5})]));
  assert.deepEqual(r.valid.map(s=>s.id),['d','stored-1','stored-2']);assert.deepEqual(r.valid.map(s=>s.timestamp),[null,null,5]);});

// ---- F5 / F8 (leg editor) ----
const runUpdate=(start,field,value,extra={})=>{const ctx=baseContext();let o;Object.assign(ctx,{legs:[start],stockPrice:600,iv30:18,model:{rate:.05,dividend:0},chainLookup:null,setLegs:x=>o=x,spotProvenance:()=>({premiumSource:'Underlying: Yahoo regular market quote',quoteTimestamp:1234}),...extra});
  vm.runInContext('{'+updateSrc+`updateLeg("x",${JSON.stringify(field)},${JSON.stringify(value)});}`,ctx);return o[0];};
const callLeg={id:'x',type:'Call',action:'Buy',strike:600,expiry:30,iv:18,price:12,contracts:1,premiumSource:'CBOE bid/ask midpoint'};
test('F5 Stock -> Call restores 30 DTE and the current IV, and prices it',()=>{const st=runUpdate(callLeg,'type','Stock');const back=runUpdate(st,'type','Call');
  assert.equal(back.expiry,30);assert.equal(back.iv,18);assert(back.price>5&&back.price<30,'price '+back.price);assert.equal(back.premiumSource,'Theoretical model');});
test('F5 Stock -> Put falls back to 30% IV when no IV is known',()=>{const st=runUpdate(callLeg,'type','Stock');const back=runUpdate(st,'type','Put',{iv30:null});assert.equal(back.iv,30);assert.equal(back.expiry,30);});
test('F5 Call -> Put keeps the existing DTE and IV',()=>{const r=runUpdate({...callLeg,expiry:45,iv:25},'type','Put');assert.equal(r.expiry,45);assert.equal(r.iv,25);});
test('F8 Call -> Stock is labelled with the underlying source',()=>{const st=runUpdate(callLeg,'type','Stock');assert.equal(st.premiumSource,'Underlying: Yahoo regular market quote');assert.equal(st.quoteTimestamp,1234);assert.equal(st.price,600);});
test('F8 Call -> Stock without provenance is labelled unknown, not theoretical',()=>{const st=runUpdate(callLeg,'type','Stock',{spotProvenance:undefined});assert.equal(st.premiumSource,'Underlying spot (source unknown)');});
const provSrc=slice('        const spotProvenance =','        const applyStrategy');
const applySrc=slice('        const applyStrategy =','        // --- LIVE CHAIN ENRICHMENT');
const hedgeSrc=slice('        const handleDeltaHedge =','        const saveCurrentStrategy');
test('F8 template and hedge stock legs carry spot provenance',async()=>{const ctx=baseContext();let built=null,hedged=null,type=null;
  Object.assign(ctx,{marketRef:{current:{source:'Yahoo regular market quote',quoteTimestamp:99}},underlyingSource:'Manual underlying',model:{rate:.05,dividend:0},symbol:'SPY',
    setStrategyType:t=>type=t,setLoadNotice:()=>{},enrichLegsFromChain:async l=>{built=l},legs:[{...callLeg,model:{rate:.05,dividend:0}}],currentPrice:600,setLegs:l=>hedged=l,alert:()=>{}});
  vm.runInContext('(function(){'+provSrc+applySrc+hedgeSrc+'globalThis.apply=applyStrategy;globalThis.hedge=handleDeltaHedge;globalThis.prov=spotProvenance;})()',ctx);
  await ctx.apply('Covered Call (Buy-Write)',600,18);const stock=built.find(l=>l.type==='Stock');
  assert.equal(stock.premiumSource,'Underlying: Yahoo regular market quote');assert.equal(stock.quoteTimestamp,99);
  assert.equal(built.find(l=>l.type==='Call').premiumSource,'Theoretical model');
  ctx.hedge();const h=hedged[hedged.length-1];assert.equal(h.type,'Stock');assert.equal(h.premiumSource,'Underlying: Yahoo regular market quote');assert.equal(type,'Custom');
  ctx.marketRef.current=null;const p=ctx.prov();assert.equal(p.premiumSource,'Underlying: Manual underlying');assert.equal(p.quoteTimestamp,null);});

// ---- F6 ----
// Shape and values from the live Yahoo SPY response retrieved 2026-11-22 (session of 2026-11-20).
const liveShape={meta:{regularMarketPrice:689.81,regularMarketTime:1795208404,chartPreviousClose:754.37},
  timestamp:[1794843000,1794929400,1795015800,1795102200,1795188600],indicators:{quote:[{close:[739.95,732.44,730.2,715.87,689.81]}]}};
const prevClose=()=>vm.runInContext('yahooPreviousClose',baseContext());
test('F6 previous close is the prior session, not chartPreviousClose',()=>assert.equal(prevClose()(liveShape),715.87));
test('F6 meta.previousClose is preferred when present',()=>assert.equal(prevClose()({...liveShape,meta:{...liveShape.meta,previousClose:716}}),716));
test('F6 later bars, null closes and missing data are handled',()=>{const f=prevClose();
  assert.equal(f({...liveShape,timestamp:[...liveShape.timestamp,1795275000],indicators:{quote:[{close:[...liveShape.indicators.quote[0].close,null]}]}}),715.87);
  assert.equal(f({...liveShape,indicators:{quote:[{close:[739.95,732.44,730.2,null,689.81]}]}}),730.2);
  assert.equal(f({meta:{chartPreviousClose:1}}),null);});

// ---- F7 ----
const gtdSrc=slice('      const getTradeData','      const chainContractPrice');
const runGtd=async(yahoo,cboe)=>{const ctx=baseContext();ctx.mock=u=>u.includes('yahoo')?yahoo:cboe;
  vm.runInContext(`(function(){const fetchViaRelay=async u=>{const v=globalThis.mock(u);if(v instanceof Error)throw v;return v;};const TRADE_CACHE=new Map();${gtdSrc};globalThis.g=getTradeData;})()`,ctx);return ctx.g('SPY');};
test('F7 string price from a relay is rejected instead of reaching state',async()=>{await assert.rejects(runGtd({chart:{result:[{meta:{regularMarketPrice:'600.5'}}]}},Error('x')),/Neither Yahoo nor CBOE/);});
test('F7 non-finite / out-of-range prices are rejected',async()=>{for(const p of [Infinity,-5,0,2e6,NaN])await assert.rejects(runGtd({chart:{result:[{meta:{regularMarketPrice:p}}]}},Error('x')));});
test('F7 Yahoo without a price falls back to CBOE and is not labelled Yahoo',async()=>{const d=await runGtd({chart:{result:[{meta:{symbol:'SPY',regularMarketTime:5}}]}},{timestamp:'t',data:{current_price:601,options:[]}});
  assert.equal(d.price,601);assert.equal(d.quote.source,null);assert.equal(d.quote.timestamp,null);});
const ymd=()=>{const e=new Date(Date.now()+30*864e5);return String(e.getUTCFullYear()).slice(2)+String(e.getUTCMonth()+1).padStart(2,'0')+String(e.getUTCDate()).padStart(2,'0');};
test('F7 CBOE string and garbage fields are ignored; numeric ones parse',()=>{const ctx=baseContext();const y=ymd();
  const n=ctx.normalizeCboeOptions({timestamp:{evil:1},data:{current_price:'600',iv30:'x',options:[null,{option:42},{option:`SPY${y}C00600000`,bid:'9',ask:'9.2',last_trade_price:8.5,iv:'0.2',delta:7},{option:`SPY${y}P00600000`,bid:8,ask:8.2,iv:0.22,prev_day_close:'1'}]}});
  assert.equal(n.price,null);assert.equal(n.iv30,null);assert.equal(n.asOf,null);const rows=Object.values(n.chains)[0];const c=rows.calls[0],p=rows.puts[0];
  assert.equal(c.mid,0);assert.equal(c.price,8.5);assert.equal(c.premiumSource,'CBOE last trade');assert.equal(c.iv,null);assert.equal(c.delta,0);
  assert.equal(p.mid,8.1);assert.equal(p.iv,22);});
test('F7 crossed CBOE quote (ask < bid) is not used as a midpoint',()=>{const ctx=baseContext();
  const n=ctx.normalizeCboeOptions({data:{options:[{option:`SPY${ymd()}C00600000`,bid:9,ask:3,theo:6}]}});const c=Object.values(n.chains)[0].calls[0];
  assert.equal(c.mid,0);assert.equal(c.premiumSource,'CBOE theoretical');assert.equal(c.price,6);});
test('F7 app root is wrapped in an error boundary',()=>{assert(/<AppErrorBoundary>\s*<App \/>\s*<\/AppErrorBoundary>/.test(html));assert(html.includes('static getDerivedStateFromError(error) { return { error }; }'));});

// ---- S1 (saved strategies age to today) ----
const DAY=86400000;
const helpersApi=()=>{const ctx=baseContext();return vm.runInContext('({ageSavedLegs,stampExpiryDates,describeAging,validateStrategyImport,parseStoredStrategies})',ctx);};
test('S1 ageSavedLegs uses expiryAt, then savedAt, and leaves stock alone',()=>{const {ageSavedLegs}=helpersApi();const now=Date.UTC(2026,10,22,12);
  const r=ageSavedLegs([{...leg,expiry:30,expiryAt:now+20*DAY},{...leg,expiry:30},{type:'Stock',action:'Buy',strike:0,expiry:0,iv:0,price:600,contracts:1}],now-9*DAY,now);
  assert.deepEqual(r.legs.map(l=>l.expiry),[20,21,0]);assert.equal(r.changed,2);assert.equal(r.expired,0);assert.equal(r.unknown,0);assert.equal(r.legs[1].expiryAt,now+21*DAY);});
test('S1 expired legs drop to 0 DTE and are counted',()=>{const {ageSavedLegs}=helpersApi();const now=Date.now();
  const r=ageSavedLegs([{...leg,expiry:5,expiryAt:now-DAY},{...leg,expiry:30,expiryAt:now+30*DAY}],now-40*DAY,now);
  assert.deepEqual(r.legs.map(l=>l.expiry),[0,30]);assert.equal(r.expired,1);assert.equal(r.changed,1);});
test('S1 with no save date or expiry date the DTE is kept and flagged unknown',()=>{const {ageSavedLegs,describeAging}=helpersApi();const r=ageSavedLegs([{...leg,expiry:30}],null);
  assert.equal(r.legs[0].expiry,30);assert.equal(r.unknown,1);assert(/Save date unknown/.test(describeAging(r,null)));});
test('S1 notice states elapsed days, expiries and unchanged premiums',()=>{const {ageSavedLegs,describeAging}=helpersApi();const now=Date.now();
  const r=ageSavedLegs([{...leg,expiry:5},{...leg,expiry:30}],now-9*DAY-3600000,now);const t=describeAging(r,now-9*DAY-3600000,now);
  assert(/Saved 9 days ago/.test(t),t);assert(/1 option leg has expired/.test(t),t);assert(/Entry premiums are unchanged/.test(t),t);
  assert.equal(describeAging(ageSavedLegs([{type:'Stock',action:'Buy',strike:0,expiry:0,iv:0,price:1,contracts:1}],now),now),null);});
test('S1 stampExpiryDates sets dates, keeps consistent ones and replaces edited ones',()=>{const {stampExpiryDates}=helpersApi();const now=Date.now();
  const r=stampExpiryDates([{...leg,expiry:30},{...leg,expiry:20,expiryAt:now+20*DAY+3600000},{...leg,expiry:45,expiryAt:now+20*DAY},{type:'Stock',expiry:0,expiryAt:123}],now);
  assert.equal(r[0].expiryAt,now+30*DAY);assert.equal(r[1].expiryAt,now+20*DAY+3600000);assert.equal(r[2].expiryAt,now+45*DAY);assert.equal(r[3].expiryAt,null);});
test('S1 import validation: expiryAt kept when valid, rejected when malformed; bad timestamp becomes null',()=>{const {validateStrategyImport:v}=helpersApi();const at=Date.now()+10*DAY;
  const ok=v(saved({timestamp:Date.now()+5*DAY,legs:[{...leg,expiryAt:at}]}));assert.equal(ok.legs[0].expiryAt,at);assert.equal(ok.timestamp,null);
  assert.equal(v(saved()).legs[0].expiryAt,null);assert.equal(v(saved({legs:[{type:'Stock',action:'Buy',strike:0,expiry:0,iv:0,price:600,contracts:1,expiryAt:'x'}]})).legs[0].expiryAt,null);
  for(const bad of ['soon',-1,Date.now()+4000*DAY])assert.throws(()=>v(saved({legs:[{...leg,expiryAt:bad}]})),/expiry date/);});
test('S1 save stamps dates; reload 5 days later ages 30 DTE to 25',()=>{const r=trySave([leg]);const rec=r.saved[0];assert.equal(typeof rec.timestamp,'number');
  assert(Math.abs(rec.legs[0].expiryAt-(rec.timestamp+30*DAY))<1,'expiryAt');const {parseStoredStrategies,ageSavedLegs}=helpersApi();
  const loaded=parseStoredStrategies(JSON.stringify(r.saved)).valid[0];assert.equal(loaded.legs[0].expiry,30);
  assert.equal(ageSavedLegs(loaded.legs,loaded.timestamp,rec.timestamp+5*DAY).legs[0].expiry,25);});
test('S1 loadSavedStrategy applies the aged legs and sets the notice',()=>{const ctx=baseContext();let replaced=null,notice=null;
  Object.assign(ctx,{previousSymbolRef:{current:'SPY'},marketRef:{current:{}},model:{rate:.05},invalidateQuote:()=>{},replaceLegs:l=>replaced=l,setLegs:()=>{throw Error('load must not create an undo entry')},
    setHistory:()=>{},window:{scrollTo:()=>{}}});for(const n of setterNames)ctx['set'+n]=()=>{};ctx.setLoadNotice=v=>notice=v;
  ctx.savedIn={symbol:'SPY',timestamp:Date.now()-10*DAY,underlyingPrice:600,underlyingIv:18,model,legs:[{...leg,expiry:30}]};
  vm.runInContext(loadSrc+'loadSavedStrategy(savedIn);',ctx);assert.equal(replaced[0].expiry,20);assert(/Saved 10 days ago/.test(notice),notice);});

// ---- S5 (undo history) ----
const legsSrc=slice('        const rawLegsRef=useRef','        const [compareSnapshot');
const undoHarness=()=>{const ctx=vm.createContext({});const st={raw:[],history:[],type:null};
  Object.assign(ctx,{useRef:v=>({current:v}),setRawLegs:v=>{st.raw=v},setCodeVerified:()=>{},setStrategyType:t=>{st.type=t},StrategyTemplate:{Custom:'Custom'},
    setHistory:v=>{st.history=typeof v==='function'?v(st.history):v;ctx.__h=st.history;}});
  // `history` is read from scope by undo(); keep it pointed at the latest state, as a re-render would.
  vm.runInContext(`(function(){Object.defineProperty(globalThis,'history',{get:()=>globalThis.__h||[],configurable:true});${legsSrc};globalThis.api={setLegs,replaceLegs,undo};})()`,ctx);ctx.__h=[];return {api:ctx.api,st};};
test('S5 a handler created once records the real previous legs (no stale closure)',()=>{const {api,st}=undoHarness();const handler=api.setLegs;
  handler(['A']);handler(['A','B']);assert.deepEqual(st.history,[[],['A']]);assert.deepEqual(st.raw,['A','B']);});
test('S5 functional updates apply to current legs',()=>{const {api,st}=undoHarness();api.setLegs(p=>[...p,'x']);api.setLegs(p=>[...p,'y']);assert.deepEqual(st.raw,['x','y']);assert.equal(st.history.length,2);});
test('S5 replaceLegs makes no undo entry and clears history; undo walks back',()=>{const {api,st}=undoHarness();api.setLegs(['A']);api.replaceLegs(['L']);assert.deepEqual(st.history,[]);
  api.setLegs(['L','M']);api.undo();assert.deepEqual(st.raw,['L']);assert.deepEqual(st.history,[]);assert.equal(st.type,'Custom');api.undo();assert.deepEqual(st.raw,['L']);});
test('S5 history keeps at most 30 entries',()=>{const {api,st}=undoHarness();for(let i=0;i<40;i++)api.setLegs([i]);assert.equal(st.history.length,30);assert.deepEqual(st.history.at(-1),[38]);});
test('S5 startup build and rebuild fetch leave no undo history',async()=>{assert(html.includes('applyStrategy(StrategyTemplate.IronCondor, 450, 20).then(() => setHistory([]));'));
  const {calls}=await runFetch({symbol:'SPY',previous:null,chain:null,fetchSymbol:'SPY',opts:{rebuild:true,template:'Iron Condor'}});
  assert(calls.history.some(h=>Array.isArray(h)&&!h.length),'history not cleared after startup rebuild');});

// ---- S2 (exchange timestamps are US Eastern) ----
const parseTs=()=>vm.runInContext('parseExchangeTimestamp',baseContext());
test(`S2 naive CBOE times are read as New York time (process TZ=${process.env.TZ||'system'})`,()=>{const p=parseTs();
  assert.equal(p('2026-11-20 16:15:00'),Date.UTC(2026,10,20,21,15));   // EST, UTC-5
  assert.equal(p('2026-07-01 16:15:00'),Date.UTC(2026,6,1,20,15));     // EDT, UTC-4
  assert.equal(p('2026-07-01T09:30'),Date.UTC(2026,6,1,13,30));
  assert.equal(p('2026-03-08 03:30:00'),Date.UTC(2026,2,8,7,30));      // just after spring-forward
  assert.equal(p('2026-03-08 01:30:00'),Date.UTC(2026,2,8,6,30));      // just before
  assert([Date.UTC(2026,10,1,5,30),Date.UTC(2026,10,1,6,30)].includes(p('2026-11-01 01:30:00')),'ambiguous fall-back hour');});
test('S2 explicit offsets and epoch numbers are respected',()=>{const p=parseTs();
  assert.equal(p('2026-11-20T16:15:00Z'),Date.UTC(2026,10,20,16,15));assert.equal(p('2026-11-20T16:15:00+01:00'),Date.UTC(2026,10,20,15,15));
  assert.equal(p(1795208404),1795208404000);assert.equal(p(1795208404000),1795208404000);});
test('S2 unrecognised or invalid values give null, not a wrong time',()=>{const p=parseTs();
  for(const v of ['yesterday','2026-13-01 10:00:00','2026-11-20 25:00:00','Nov 20 2026 4:15 PM','',{},null,undefined,-1,NaN,Infinity])assert.equal(p(v),null,String(v));});
test('S2 normalizeCboeOptions stores epoch ms for the chain and each contract',()=>{const ctx=baseContext();
  const n=ctx.normalizeCboeOptions({timestamp:'2026-11-20 16:15:00',data:{options:[{option:`SPY${ymd()}C00600000`,bid:9,ask:9.2}]}});
  assert.equal(n.asOf,Date.UTC(2026,10,20,21,15));assert.equal(Object.values(n.chains)[0].calls[0].quoteTimestamp,Date.UTC(2026,10,20,21,15));});
test('S2 formatStamp shows a zone name and handles legacy strings',()=>{const f=vm.runInContext('formatStamp',baseContext());
  const a=f(Date.UTC(2026,10,20,21,15)),b=f('2026-11-20 16:15:00');assert.equal(a,b);assert(/2026/.test(a)&&/(GMT|UTC|[A-Z]{2,4}T)/.test(a),a);assert.equal(f('junk'),null);});

// ---- S3 (governance text matches the data flows) ----
const charter=()=>{const ctx=baseContext();vm.runInContext(slice('      const AGENT_CHARTER','      // Illustrative reference values')+';globalThis.gov={AGENT_CHARTER,FORBIDDEN_ACTIONS,DATA_FLOWS,DATA_KEPT_LOCAL};globalThis.relays=CORS_RELAYS;',ctx);return ctx;};
test('S3 every relay host in CORS_RELAYS is disclosed in DATA_FLOWS and the known limitations',()=>{const ctx=charter();
  const hosts=ctx.relays.filter(r=>r.name!=='direct').map(r=>new URL(r.fetch('https://example.com/x')).hostname);assert.equal(hosts.length,3);
  const flows=JSON.stringify(ctx.gov.DATA_FLOWS),lim=ctx.gov.AGENT_CHARTER.knownLimitations.join(' ');
  for(const h of hosts){assert(flows.includes(h),'DATA_FLOWS missing '+h);assert(lim.includes(h),'limitations missing '+h);}});
test('S3 every external library/font host in the page is disclosed',()=>{const ctx=charter();const flows=JSON.stringify(ctx.gov.DATA_FLOWS);
  const hosts=new Set([...html.matchAll(/(?:src|href)="https:\/\/([^/"]+)/g),...html.matchAll(/"https:\/\/([^/"]+)\/[^"]*@\d/g)].map(m=>m[1]));
  assert(hosts.size>=4,[...hosts].join());for(const h of hosts)assert(flows.includes(h)||(/fonts\.(googleapis|gstatic)\.com/.test(h)&&flows.includes('Google Fonts')),'undisclosed host '+h);});
test('S3 no rule forbids what the code does by default; auto-load and LLM payload are disclosed',()=>{const ctx=charter();const forb=ctx.gov.FORBIDDEN_ACTIONS.join(' | ');
  assert(!/symbols/i.test(forb),'forbidden list still bans sending symbols: '+forb);assert(!/user-configured proxy/.test(forb));
  assert(html.includes("handleYahooFetch('SPY'"),'auto-load moved?');const flows=JSON.stringify(ctx.gov.DATA_FLOWS);
  assert(/Automatically for SPY when the page opens/.test(flows));assert(/every leg/.test(flows)&&/Generate/.test(flows));
  assert(!html.includes('user-initiated and unaffected'),'kill-switch text still claims fetches are user-initiated');
  for(const k of ['legs','model','symbol'])assert(new RegExp('\\$\\{[^}]*'+(k==='legs'?'legDescriptions':k==='model'?'JSON.stringify\\(legs\\[0\\]\\?\\.model':'symbol')).test(slice('      const generatePythonCode','      /*')),'LLM prompt no longer contains '+k);});

// ---- S4 (external-call counter counts real requests) ----
const res=(status,body)=>({ok:status>=200&&status<300,status,text:async()=>body});
const countingContext=(fetchImpl)=>{const ctx=baseContext();ctx.fetch=fetchImpl;ctx.AbortSignal={timeout:()=>undefined};
  const log=[];vm.runInContext('globalThis.__listen=fn=>externalCallListeners.add(fn);',ctx);ctx.__listen((k,ok)=>log.push(k+':'+(ok?'ok':'fail')));return {ctx,log};};
test('S4 every relay attempt is counted, failed ones included',async()=>{let n=0;
  const {ctx,log}=countingContext(async()=>{n++;if(n===1)throw Error('CORS');if(n===2)return res(500,'');if(n===3)return res(200,'<html>challenge</html>');return res(200,'{"a":1}');});
  vm.runInContext('preferredRelay=0',ctx);const out=await vm.runInContext('fetchViaRelay("https://example.com/q")',ctx);
  assert.deepEqual({...out},{a:1});assert.deepEqual(log,['data:fail','data:fail','data:fail','data:ok']);});
test('S4 a cache hit sends and counts nothing; the first fetch counts each request',async()=>{
  const {ctx,log}=countingContext(async u=>res(200,u.includes('yahoo')?JSON.stringify({chart:{result:[{meta:{regularMarketPrice:600,regularMarketTime:1}}]}}):JSON.stringify({data:{options:[]}})));
  vm.runInContext(`(function(){const TRADE_CACHE=new Map();${gtdSrc};globalThis.g=getTradeData;})()`,ctx);
  await ctx.g('SPY');assert.equal(log.length,2,log.join());await ctx.g('SPY');assert.equal(log.length,2,'cache hit was counted');});
test('S4 an LLM call is counted once (also on failure); no endpoint means nothing sent or counted',async()=>{
  const llmSrc=slice('      const getProxyUrl','      // Step 3 — Fetch returns');
  const run=async(win,fetchImpl)=>{const {ctx,log}=countingContext(fetchImpl);ctx.window=win;ctx.GoogleGenAI=function(){};vm.runInContext(llmSrc+';globalThis.cg=callGemini;',ctx);
    let err=null;try{await ctx.cg('q')}catch(e){err=e.message}return {log,err};};
  let r=await run({GEMINI_PROXY_URL:'https://proxy.test/x'},async()=>res(500,''));assert.deepEqual(r.log,['llm:fail']);assert(/Proxy error 500/.test(r.err));
  r=await run({GEMINI_PROXY_URL:'https://proxy.test/x'},async()=>({ok:true,status:200,json:async()=>({text:'hi'})}));assert.deepEqual(r.log,['llm:ok']);
  r=await run({},async()=>{throw Error('must not fetch')});assert.deepEqual(r.log,[]);assert(/No LLM endpoint/.test(r.err));});
test('S4 the App no longer hand-increments the counter',()=>{assert(!html.includes('setCallCount'));assert(html.includes('externalCallListeners.add(onCall)'));});

// ---- S7 (expiry time and same-day DTE) ----
const atNow=(nowMs)=>{const RealDate=Date;class FakeDate extends RealDate{constructor(...a){super(...(a.length?a:[nowMs]))}static now(){return nowMs}}
  const ctx=vm.createContext({console,Math,Date:FakeDate,Number,Map,Set,String,JSON,Promise,Error,Array,Object,Intl});vm.runInContext(enums+core+data+helpers+';globalThis.normalizeCboeOptions=normalizeCboeOptions;',ctx);return ctx;};
test('S7 contract expiry is 4:00 PM New York in winter and summer; bad dates rejected',()=>{const ctx=baseContext();const p=vm.runInContext('parseContractSymbol',ctx);
  assert.equal(p('SPY261218C00600000').expMs,Date.UTC(2026,11,18,21));assert.equal(p('SPY260717P00600000').expMs,Date.UTC(2026,6,17,20));
  assert.equal(p('SPY261318C00600000'),null);assert.equal(p('SPY261232C00600000'),null);});
test('S7 dteFromExpiry: whole days from 1 day out, fractions below, 0 after expiry',()=>{const f=vm.runInContext('dteFromExpiry',baseContext());const n=Date.UTC(2026,0,1);
  assert.equal(f(n+30.4*DAY,n),30);assert.equal(f(n+1*DAY,n),1);assert.equal(f(n+0.25*DAY,n),0.25);assert.equal(f(n+60000,n),0.01);assert.equal(f(n-1,n),0);assert.equal(f(n,n),0);});
test('S7 same-day contract stays listed until 4 PM ET in winter, with fractional DTE and a back-solvable IV',()=>{
  const opt={option:'SPY261218C00600000',bid:1,ask:1.2},gone={option:'SPY261217C00600000',bid:1,ask:1.2};
  let ctx=atNow(Date.UTC(2026,11,18,15));let n=ctx.normalizeCboeOptions({data:{options:[opt,gone]}});   // 10:00 AM EST
  assert.equal(n.expirations.length,1);assert.equal(n.expirations[0].dte,0.25);
  const iv=vm.runInContext('impliedVolFromPrice',ctx)(600,600,0.25/365,.05,1.1,true);assert(iv>0,'IV '+iv);
  ctx=atNow(Date.UTC(2026,11,18,20,30));n=ctx.normalizeCboeOptions({data:{options:[opt]}});              // 3:30 PM EST — old code had dropped it at 3:00
  assert.equal(n.expirations.length,1);assert.equal(n.expirations[0].dte,0.02);
  ctx=atNow(Date.UTC(2026,11,18,21,1));assert.equal(ctx.normalizeCboeOptions({data:{options:[opt]}}).expirations.length,0);});
test('S7 leg editor and saved-strategy aging keep fractional DTE',()=>{assert.equal(runUpdate(callLeg,'expiry','0.25').expiry,0.25);assert.equal(runUpdate(callLeg,'expiry','-3').expiry,0);
  const {ageSavedLegs}=helpersApi();const now=Date.now();assert.equal(ageSavedLegs([{...leg,expiry:1,expiryAt:now+6*3600000}],now-DAY,now).legs[0].expiry,0.25);});
test('S7 chain expiry labels use the New York date',()=>assert(html.includes("year: '2-digit', timeZone: 'America/New_York' })")));

// ---- S6 (typing in the ticker box does not silently drop an AI price suggestion) ----
const staleFn=()=>vm.runInContext('verificationStaleReason',baseContext());
test('S6 staleness depends on the active underlying, not on typing',()=>{const f=staleFn();const basis={symbol:'SPY',price:600,fetchedAt:5};
  assert.equal(f(null,{symbol:'SPY',price:600,fetchedAt:5}),null);assert.equal(f({basis},{symbol:'SPY',price:600,fetchedAt:5}),null);
  assert(/SPY to QQQ/.test(f({basis},{symbol:'QQQ',price:600,fetchedAt:5})));assert(/refreshed or replaced/.test(f({basis},{symbol:'SPY',price:600,fetchedAt:9})));
  assert(/\$600\.00 to \$601\.00/.test(f({basis},{symbol:'SPY',price:601,fetchedAt:5})));assert.equal(f({result:{}},{symbol:'X',price:1,fetchedAt:null}),null);});
const llmFlowSrc=slice('        const handleFetchData = async','        const rejectVerification');
const llmFlow=(state)=>{const ctx=baseContext();const out={alerts:[],set:{},pending:state.pendingVerification??null};let resolveLlm;
  Object.assign(ctx,{externalCallsEnabled:true,isExternalConfigured:()=>true,fetchStockPriceDetailed:()=>new Promise(r=>resolveLlm=r),
    validateFetchResult:()=>({issues:[],warnings:[],isValid:true}),iv:20,requestVersion:{current:0},invalidateQuote:()=>{ctx.requestVersion.current++},
    alert:m=>out.alerts.push(m),setIsLoading:()=>{},setPendingVerification:v=>{out.pending=v},setMarket:()=>{},setLastUpdated:()=>{},
    setCurrentPrice:v=>{out.set.price=v},setUnderlyingSource:v=>{out.set.source=v},setIv:v=>{out.set.iv=v},...state});
  vm.runInContext('(function(){'+llmFlowSrc+'globalThis.fetchAi=handleFetchData;globalThis.accept=acceptVerifiedPrice;})()',ctx);
  return {ctx,out,resolve:v=>resolveLlm(v)};};
test('S6 typing while the AI request is in flight no longer discards the result',async()=>{
  const base={symbol:'SPY',currentPrice:600,marketRef:{current:{fetchedAt:5}},market:{fetchedAt:5},pendingVerification:null};
  const f=llmFlow(base);const p=f.ctx.fetchAi();f.ctx.invalidateQuote();f.ctx.invalidateQuote();   // two keystrokes
  f.resolve({ok:true,price:601,iv:21,priceCandidates:[601],ivCandidates:[21]});await p;
  assert(f.out.pending&&f.out.pending.result.price===601,'suggestion was dropped');assert.deepEqual({...f.out.pending.basis},{symbol:'SPY',price:600,fetchedAt:5});
  const g=llmFlow({...base,pendingVerification:f.out.pending});g.ctx.accept(601,21);                   // re-render with pending; accept
  assert.equal(g.out.set.price,601);assert.equal(g.out.set.iv,21);assert(/Human-verified/.test(g.out.set.source));assert.equal(g.out.alerts.length,0);});
test('S6 a suggestion made stale by a real underlying change is refused with a message',()=>{
  const pending={result:{price:601},validation:{issues:[],warnings:[]},symbol:'SPY',basis:{symbol:'SPY',price:600,fetchedAt:5}};
  for(const cur of [{symbol:'QQQ',currentPrice:600,market:{fetchedAt:5}},{symbol:'SPY',currentPrice:600,market:{fetchedAt:9}},{symbol:'SPY',currentPrice:610,market:null}]){
    const g=llmFlow({...cur,marketRef:{current:null},pendingVerification:pending});g.ctx.accept(601,21);
    assert.equal(g.out.set.price,undefined,'stale price applied');assert.equal(g.out.alerts.length,1);assert(/^Not applied: /.test(g.out.alerts[0]),g.out.alerts[0]);assert.equal(g.out.pending,null);}});
test('S6 the dialog shows the stale reason and disables Accept',()=>{assert(html.includes('staleReason={verificationStale}'));
  assert(html.includes("disabled={!checked || validation.issues.length > 0 || Boolean(staleReason)}"));assert(html.includes('This suggestion no longer applies.'));
  assert(!/pendingVerification\?\.ticket/.test(html),'old ticket check still present');});

// ---- S8 (chain enrichment keeps price, contract and label consistent) ----
const enrichSrc=slice('        const enrichLegsFromChain =','        const chainLookup');
test('S8 a listed contract without a quote is model-priced at the snapped strike and expiry, with no chain timestamp',async()=>{const ctx=baseContext();
  const y=ymd();const chain=ctx.normalizeCboeOptions({timestamp:'2026-11-20 16:15:00',data:{options:[
    {option:`SPY${y}C00600000`,iv:.25},{option:`SPY${y}C00610000`,bid:3,ask:3.2,iv:.2},{option:`SPY${y}P00590000`}]}});
  const mdl={rate:.05,dividend:.01};let out=null;
  Object.assign(ctx,{symbol:'SPY',model:mdl,marketRef:{current:{symbol:'SPY',price:600,chain}},setLegs:l=>out=l});
  vm.runInContext('(function(){'+enrichSrc+'globalThis.enrich=enrichLegsFromChain;})()',ctx);
  const base={action:'Buy',contracts:1,premiumSource:'Theoretical model',quoteTimestamp:null};
  await ctx.enrich([{...base,id:'a',type:'Call',strike:601,expiry:29,iv:18,price:99},{...base,id:'b',type:'Call',strike:611,expiry:29,iv:18,price:99},{...base,id:'c',type:'Put',strike:588,expiry:29,iv:22,price:99}],'SPY');
  const dte=chain.expirations[0].dte;const calc=vm.runInContext('calculateOptionPrice',ctx);const [a,b,c]=out;
  assert.equal(a.strike,600);assert.equal(a.expiry,dte);assert.equal(a.iv,25);assert.equal(a.price,+calc(600,600,dte/365,.05,.25,'Call',.01).toFixed(2));
  assert.equal(a.quoteTimestamp,null);assert(/^Theoretical model/.test(a.premiumSource),a.premiumSource);assert.notEqual(a.price,99);
  assert.equal(b.strike,610);assert.equal(b.price,3.1);assert.equal(b.premiumSource,'CBOE bid/ask midpoint');assert.equal(b.quoteTimestamp,Date.UTC(2026,10,20,21,15));assert.equal(b.iv,20);
  assert.equal(c.strike,590);assert.equal(c.iv,22,'no feed IV: keeps the leg IV');assert.equal(c.price,+calc(600,590,dte/365,.05,.22,'Put',.01).toFixed(2));assert.equal(c.quoteTimestamp,null);});

// ---- S9 (IV back-solve uses the shared rate and dividend yield) ----
const ivApi=()=>vm.runInContext('({iv:impliedVolFromPrice,price:calculateOptionPrice,civ:chainContractIv,legPL:calculateLegProfit})',baseContext());
test('S9 back-solve recovers the true IV under a non-default rate and dividend (calls and puts, ITM and OTM)',()=>{const a=ivApi();
  for(const [K,type] of [[560,'Call'],[640,'Call'],[560,'Put'],[640,'Put']]){const p=a.price(600,K,45/365,.03,.27,type,.025);
    const solved=a.iv(600,K,45/365,.03,p,type==='Call',.025);assert(Math.abs(solved-27)<1e-6,`${type} ${K}: ${solved}`);}});
test('S9 with dividends the old fixed-5%/no-dividend solve was biased; the new one is not',()=>{const a=ivApi();
  const p=a.price(600,600,60/365,.02,.22,'Call',.04);const now=a.iv(600,600,60/365,.02,p,true,.04),old=a.iv(600,600,60/365,.05,p,true,0);
  assert(Math.abs(now-22)<1e-6,'new '+now);assert(Math.abs(old-22)>1,'old approach would have been unbiased?! '+old);});
test('S9 an unchanged position re-prices to its entry at T+0 (chain IV from the shared model)',()=>{const a=ivApi();const mdl={rate:.01,dividend:.03,commission:0,stockCommission:0,slippage:0};
  const c={strike:540,mid:72.4,last:0,theo:0,iv:null};const dte=40;
  const ivNew=a.civ(c,600,dte,18,true,mdl),ivOld=a.civ(c,600,dte,18,true);
  const pl=iv=>Math.abs(a.legPL({type:'Call',action:'Buy',strike:540,expiry:dte,iv,price:72.4,contracts:1,model:mdl},600,0,0));
  assert(pl(ivNew)<5,`new T+0 P/L ${pl(ivNew)}`);assert(pl(ivNew)<pl(ivOld),`new ${pl(ivNew)} vs old ${pl(ivOld)}`);
  assert.equal(Math.round(ivNew*10)/10,ivNew,'IV rounded to 0.1');});
test('S9 prices outside what any volatility can produce give null, not 0.5%; chainContractIv then falls back to iv30',()=>{const a=ivApi();
  const T=30/365,intrinsicPut=700*Math.exp(-.05*T)-600;
  assert.equal(a.iv(600,700,T,.05,intrinsicPut*0.97,false,0),null,'below intrinsic');assert.equal(a.iv(600,500,T,.05,650,true,0),null,'above spot');
  assert.equal(a.iv(600,600,T,.05,0,true,0),null);assert.equal(a.civ({strike:700,mid:intrinsicPut*0.97,iv:null},600,30,18.5,false,{rate:.05,dividend:0}),18.5);});
test('S9 every chain IV call site passes the shared model',()=>{const n=(html.match(/chainContractIv\([^)]*,\s*model\)/g)||[]).length;assert.equal(n,3,'call sites with model: '+n);
  assert(html.includes('impliedVolFromPrice(spot, c.strike, viewChain.dte / 365, model.rate, chainContractPrice(c), !isPut, model.dividend)'),'chain panel ≈ IV not using model');});

// ---- S10 (chain shading per side) ----
test('S10 moneyness: calls ITM below spot, puts ITM above, neither at spot',()=>{const m=vm.runInContext('moneyness',baseContext());
  assert.equal(m(590,600,false),'itm');assert.equal(m(610,600,false),'otm');assert.equal(m(590,600,true),'otm');assert.equal(m(610,600,true),'itm');
  assert.equal(m(600,600,false),'atm');assert.equal(m(600,600,true),'atm');});
test('S10 the row-level shading and its "In the money" title are gone; cells carry their own state',()=>{
  assert(!html.includes("strike <= spot ? 'bg-yellow-400/5'"));assert(!html.includes("'In the money (shaded)'"));assert(html.includes('data-moneyness={m}'));
  assert(html.includes('Shaded cells are in the money: calls below spot, puts above it.'));});

// ---- S12 (number inputs commit on blur/Enter, not per keystroke) ----
// The real NumberField JSX is compiled with the bundled Babel and driven by a minimal hooks
// renderer: state and refs persist between renders, as in React.
const numberFieldHarness=(value,onCommit)=>{const babel=require('./babel.min.cjs');
  const src=babel.transform(slice('      const isNumericDraft','      const StrategyBuilder'),{presets:['react']}).code;
  const hooks=[];let i=0;const ctx=vm.createContext({React:{createElement:(type,props)=>({type,props})},
    useState:init=>{const k=i++;if(!(k in hooks))hooks[k]=init;return [hooks[k],v=>{hooks[k]=typeof v==='function'?v(hooks[k]):v;}]},
    useRef:init=>{const k=i++;if(!(k in hooks))hooks[k]={current:init};return hooks[k];}});
  vm.runInContext(src+';globalThis.NF=NumberField;globalThis.isNum=isNumericDraft;',ctx);
  const st={value};const render=()=>{i=0;return ctx.NF({value:st.value,onCommit,className:'x','aria-label':'f'}).props;};
  const ev={focus:()=>render().onFocus(),type:t=>render().onChange({target:{value:t}}),enter:()=>render().onKeyDown({key:'Enter',preventDefault(){}}),
    esc:()=>render().onKeyDown({key:'Escape',preventDefault(){}}),blur:()=>render().onBlur()};return {ctx,st,render,ev};};
test('S12 typing a new strike commits once, on Enter, not per keystroke',()=>{const commits=[];const h=numberFieldHarness(600,v=>{commits.push(v);});
  h.ev.focus();h.ev.type('');assert.equal(h.render().value,'');h.ev.type('6');h.ev.type('65');h.ev.type('650');assert.deepEqual(commits,[]);
  assert.equal(h.render().value,'650');h.ev.enter();assert.deepEqual(commits,['650']);});
test('S12 clearing a field and leaving it keeps the old value (no snap to spot / 1 / 0)',()=>{const commits=[];const h=numberFieldHarness(600,v=>{commits.push(v);});
  h.ev.focus();h.ev.type('');h.ev.blur();assert.deepEqual(commits,[]);assert.equal(h.render().value,'600');assert.equal(h.render()['aria-invalid'],undefined);});
test('S12 Escape reverts; an unchanged value does not commit',()=>{const commits=[];const h=numberFieldHarness(30,v=>{commits.push(v);});
  h.ev.focus();h.ev.type('45');h.ev.esc();assert.equal(h.render().value,'30');h.ev.blur();h.ev.focus();h.ev.blur();assert.deepEqual(commits,[]);});
test('S12 non-numbers and values the owner rejects are flagged, not applied',()=>{const commits=[];const h=numberFieldHarness(5,v=>{commits.push(v);return Number(v)<=100?undefined:false;});
  h.ev.focus();h.ev.type('abc');h.ev.blur();assert.deepEqual(commits,[]);assert.equal(h.render()['aria-invalid'],true);assert.equal(h.render().value,'5');
  h.ev.focus();h.ev.type('150');assert.equal(h.render()['aria-invalid'],undefined,'editing clears the flag');h.ev.enter();assert.deepEqual(commits,['150']);assert.equal(h.render()['aria-invalid'],true);
  assert(/previous value was kept/.test(h.render().title));});
test('S12 numeric draft rules',()=>{const {ctx}=numberFieldHarness(0,()=>{});for(const ok of ['1','-0.5','.5','5.','1e3','+2',' 7 '])assert(ctx.isNum(ok),ok);
  for(const bad of ['','-','.','1,000','abc','1e','Infinity','0x10','1.2.3'])assert(!ctx.isNum(bad),bad);});
test('S12 all leg, pricing and comparison number inputs use NumberField',()=>{assert.equal((html.match(/<input[^>]*type="number"/g)||[]).length,0);
  for(const l of ['quantity','days to expiry','strike','IV percent','premium'])assert(html.includes('aria-label={`Leg ${legIndex + 1} '+l+'`}'),l);
  assert(html.includes('<NumberField aria-label={label} invalidHint'));for(const c of ['Comparison days','Comparison common IV','Comparison IV shift'])assert(html.includes(`<NumberField aria-label="${c}"`),c);});

// ---- S13 (smaller items) ----
const extract=()=>vm.runInContext(slice('      const extractPriceCandidates','      // Step 3 — Fetch returns')+';extractPriceCandidates',baseContext());
test('S13 LLM price extraction: thousands separators, whole dollars, and IVs not taken as prices',()=>{const f=extract();
  assert.deepEqual([...f('Shares trade at $1,234.56 today.')],[1234.56]);assert.deepEqual([...f('Last price: $580, IV 18.5%')],[580]);
  assert.deepEqual([...f('SPY is at 691.25 with IV 19.50%.')],[691.25]);assert.deepEqual([...f('IV 19.50 % and price $ 690.10')],[690.1]);
  assert.deepEqual([...f('between $580.10 and $581.20, last $580.10')],[580.1,581.2]);assert.deepEqual([...f('no numbers here, 12%')],[]);});
test('S13 Duplicate no longer needs crypto.randomUUID (absent on plain-http LAN pages)',()=>assert(!html.includes('crypto.randomUUID')));
test('S13 header names the real source and labels the time as retrieval time',()=>{assert(!html.includes("'manual/quote'"));assert(html.includes('` · retrieved ${lastUpdated.toLocaleTimeString()}`'));
  assert(html.includes("{market.source || 'Quote'}{market.chain ? ' + CBOE chain (delayed)' : ''}"));});
test('S13 relay label comes from the relays that served this result, and says when it is cached',async()=>{
  const {ctx}=countingContext(async u=>u.startsWith('https://query1')?(()=>{throw Error('CORS')})():res(200,u.includes('yahoo')?JSON.stringify({chart:{result:[{meta:{regularMarketPrice:600,regularMarketTime:1}}]}}):JSON.stringify({data:{current_price:600,options:[{option:`SPY${ymd()}C00600000`,bid:1,ask:1.2}]}})));
  vm.runInContext('preferredRelay=0',ctx);vm.runInContext(`(function(){const TRADE_CACHE=new Map();${gtdSrc};globalThis.g=getTradeData;})()`,ctx);
  // Yahoo's direct request fails (mocked CORS) and falls through to r.jina.ai; CBOE's direct request succeeds.
  const d1=await ctx.g('SPY');assert.deepEqual({...d1.relays},{quote:'r.jina.ai',chain:'direct'});assert(!d1.fromCache);
  const d2=await ctx.g('SPY');assert.equal(d2.fromCache,true);
  const exprSrc=/setDataRelay\((data\.relays \?[^;]*)\);/.exec(html)[1];const label=data=>vm.runInContext(`(function(data){return ${exprSrc};})`,vm.createContext({}))(data);
  assert.equal(label(d1),`quote ${d1.relays.quote} · chain ${d1.relays.chain}`);assert.equal(label(d2),`quote ${d1.relays.quote} · chain ${d1.relays.chain} (cached)`);
  assert.equal(label({relays:{quote:'r.jina.ai'}}),'quote r.jina.ai');assert.equal(label({}),null);});
test('S13 color-regression.cjs now fails when the current app fails',()=>{const t=fs.readFileSync('work/color-regression.cjs','utf8');
  assert(t.includes("x.file==='outputs/optionstrat_color_lab.html'&&!x.pass))process.exitCode=1"));assert(!t.includes("x.file.includes('fixed')"));});

// ---- D1–D3 (import/export polish) ----
const exportApi=()=>{const ctx=baseContext();vm.runInContext(slice('      const LEG_COLORS','      const buildColorChartData')+';globalThis.ex={safeFileName,localDateStamp,csvText,scenarioCSV,buildScenarioMatrix};',ctx);return ctx.ex;};
test('D1 export filenames contain only safe characters',()=>{const {safeFileName:f}=exportApi();
  assert.equal(f('IC test 1/2 "Nov"'),'IC_test_1_2_Nov');assert.equal(f('BRK/B'),'BRK_B');assert.equal(f('^SPX'),'SPX');assert.equal(f('a:b*c?d<e>f|g\\h'),'a_b_c_d_e_f_g_h');
  assert.equal(f('..\\..\\evil'),'evil');assert.equal(f(''),'strategy');assert.equal(f('///'),'strategy');assert.equal(f(null,'symbol'),'symbol');assert.equal(f('x'.repeat(200)).length,80);
  for(const s of ['IC test 1/2 "Nov"','Café à 5%','../../x','CON:'])assert(/^[A-Za-z0-9._-]+$/.test(f(s)),s);
  assert(html.includes("a.setAttribute('download', `${safeFileName(strategy.name)}_${safeFileName(strategy.symbol, 'symbol')}.json`);"));});
test('D2 CSV without meta is unchanged; with meta it appends a traceable assumptions block',()=>{const {scenarioCSV,buildScenarioMatrix}=exportApi();
  const legs=[{...leg,model:{rate:.0425,dividend:.013,commission:.65,stockCommission:.005,slippage:.02}}];const m=buildScenarioMatrix(legs,600);
  const plain=scenarioCSV(m).split('\r\n');assert.equal(plain.length,8);
  const t=scenarioCSV(m,{symbol:'SPY',spot:600,source:'Yahoo regular market quote',quoteTimestamp:Date.UTC(2026,10,20,21,0,4),model:legs[0].model,legCount:1,exportedAt:Date.UTC(2026,10,22,15)}).split('\r\n');
  assert.deepEqual(t.slice(0,8),plain,'table part changed');assert.equal(t[8],'');assert.equal(t[9],'Assumption,Value');
  const kv=Object.fromEntries(t.slice(10).map(l=>{const i=l.indexOf(',');return [l.slice(0,i),l.slice(i+1)];}));
  assert.equal(kv.Symbol,'SPY');assert.equal(kv['Underlying price'],'600.00');assert.equal(kv['Underlying source'],'Yahoo regular market quote');assert.equal(kv['Quote time (UTC)'],'2026-11-20T21:00:04.000Z');
  assert.equal(kv['Interest rate %'],'4.25');assert.equal(kv['Dividend yield %'],'1.3');assert.equal(kv['Option commission $/contract/side'],'0.65');assert.equal(kv['Legs'],'1');assert.equal(kv['Exported at (UTC)'],'2026-11-22T15:00:00.000Z');
  assert(/stock dividend cashflows excluded/.test(kv.Costs));});
test('D2 CSV text cells are quoted and formula-safe',()=>{const {csvText:c}=exportApi();assert.equal(c('plain'),'plain');assert.equal(c('a,b'),'"a,b"');assert.equal(c('say "hi"'),'"say ""hi"""');
  assert.equal(c('=HYPERLINK("x")'),`"'=HYPERLINK(""x"")"`);assert.equal(c('+1'),"'+1");assert.equal(c('@cmd'),"'@cmd");assert.equal(c(null),'');});
test('D2 CSV filename carries symbol and local date; ScenarioLab gets the meta it needs',()=>{const {localDateStamp}=exportApi();
  assert.equal(localDateStamp(new Date(2026,0,5)),'2026-01-05');assert(html.includes("a.download=`scenario_${safeFileName(meta.symbol, 'underlying')}_${localDateStamp()}.csv`"));
  assert(html.includes('<ScenarioLab legs={legs} stockPrice={currentPrice} meta={{ symbol, source: market?.source || underlyingSource, quoteTimestamp: market?.quoteTimestamp ?? null, model }} />'));});
test('D3 non-object files get a clear message; real strategies still validate',()=>{const {validateStrategyImport:v}=helpersApi();
  for(const bad of [null,[],[1,2],42,'SPY',true])assert.throws(()=>v(bad),/Not a strategy file/,JSON.stringify(bad));
  assert.throws(()=>v({symbol:42,legs:[leg]}),/Invalid symbol/);assert.throws(()=>v({symbol:'spy',legs:[leg]}),/Invalid symbol/);assert.equal(v(saved()).symbol,'SPY');});

// ---- F7 error boundary behaviour (the real class, compiled with the bundled Babel) ----
test('F7 AppErrorBoundary passes children through, then shows the fallback with the message and a Reload button',()=>{
  const babel=require('./babel.min.cjs');const src=babel.transform(slice('      // Top-level error boundary','      const rootElement'),{presets:['react']}).code;
  const logged=[];let reloaded=0;const text=n=>n==null||n===false?'':typeof n!=='object'?String(n):[].concat(n.props?.children??[]).map(text).join('');
  const find=(n,pred)=>!n||typeof n!=='object'?null:pred(n)?n:[].concat(n.props?.children??[]).map(c=>find(c,pred)).find(Boolean)||null;
  const ctx=vm.createContext({console:{error:(...a)=>logged.push(a)},window:{location:{reload:()=>reloaded++}},
    React:{Component:class{constructor(p){this.props=p}},createElement:(type,props,...children)=>({type,props:{...props,children:children.length<2?children[0]:children}})}});
  vm.runInContext(src+';globalThis.B=AppErrorBoundary;',ctx);
  const child={type:'app'};const b=new ctx.B({children:child});assert.equal(b.render(),child,'healthy render passes children through');
  const err=new Error('boom '+'x'.repeat(400));b.state=ctx.B.getDerivedStateFromError(err);b.componentDidCatch(err,{componentStack:'at X'});
  const out=b.render();const t=text(out);assert.equal(out.props.role,'alert');assert(/hit an error while rendering/.test(t));assert(t.includes('boom'));
  assert(!t.includes('x'.repeat(301)),'message is capped at 300 characters');assert(/No orders can be placed/.test(t));assert(/switch persistence on again in the Charter panel/.test(t),"persistence hint missing");
  assert.equal(logged.length,1);assert.equal(logged[0][0],'Render failure');
  const btn=find(out,n=>n.type==='button');assert(btn&&text(btn)==='Reload');btn.props.onClick();assert.equal(reloaded,1);
  b.state=ctx.B.getDerivedStateFromError('plain string thrown');assert(text(b.render()).includes('plain string thrown'));});

Promise.all(pending).then(()=>{fs.writeFileSync('outputs/claude-fix-tests.json',JSON.stringify(results,null,2));
  for(const r of results)console.log(r.pass?'PASS':'FAIL',r.name,r.error||'');console.log(`${results.filter(r=>r.pass).length}/${results.length} review-fix checks passed (F1–F8, S1–S13, D1–D3)`);
  if(results.some(r=>!r.pass))process.exitCode=1;});
