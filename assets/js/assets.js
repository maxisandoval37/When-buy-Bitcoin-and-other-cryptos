/** Catálogo dinámico de activos Binance Spot: solo lectura, sin API keys ni Node. */
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const CACHE_KEY = 'atlas.assets.cache.v1';
const SELECTED_KEY = 'atlas.asset.selected.v1';
const TTL = 6 * 60 * 60 * 1000;
const QUOTES = ['USDT','USDC','FDUSD','USD1','TUSD','DAI','BTC','ETH','BNB','EUR','TRY','BRL','ARS'];
export const FEATURED = ['BTC','ETH','BNB','SOL','XRP'];
const NAMES = Object.freeze({BTC:'Bitcoin',ETH:'Ethereum',BNB:'BNB',SOL:'Solana',XRP:'XRP',USDT:'Tether',USDC:'USD Coin',ADA:'Cardano',DOGE:'Dogecoin',TRX:'TRON',AVAX:'Avalanche',LINK:'Chainlink',DOT:'Polkadot',LTC:'Litecoin',BCH:'Bitcoin Cash',SUI:'Sui',XLM:'Stellar',HBAR:'Hedera',TON:'Toncoin',SHIB:'Shiba Inu',UNI:'Uniswap',NEAR:'NEAR Protocol',APT:'Aptos',ATOM:'Cosmos',ETC:'Ethereum Classic',PEPE:'Pepe',ARB:'Arbitrum',OP:'Optimism',FIL:'Filecoin',ICP:'Internet Computer',INJ:'Injective',AAVE:'Aave',MKR:'Maker',ALGO:'Algorand',VET:'VeChain',POL:'Polygon',MATIC:'Polygon',RENDER:'Render',RNDR:'Render',TAO:'Bittensor',FET:'Artificial Superintelligence Alliance',WLD:'Worldcoin',JUP:'Jupiter',BONK:'Bonk',FLOKI:'Floki',CRV:'Curve DAO',LDO:'Lido DAO',PAXG:'PAX Gold',ENA:'Ethena',ONDO:'Ondo',SEI:'Sei',TIA:'Celestia',IMX:'Immutable',GRT:'The Graph',SAND:'The Sandbox',MANA:'Decentraland',AXS:'Axie Infinity',XMR:'Monero',ZEC:'Zcash',DASH:'Dash',XTZ:'Tezos',EOS:'EOS',IOTA:'IOTA',COMP:'Compound',SNX:'Synthetix',RUNE:'THORChain',CAKE:'PancakeSwap',KAS:'Kaspa',FLOW:'Flow',ZIL:'Zilliqa',GALA:'Gala',JASMY:'JasmyCoin',WIF:'dogwifhat',PYTH:'Pyth Network',ORDI:'ORDI','1000SATS':'SATS'});
export const DEFAULT_ASSET = Object.freeze({symbol:'BTCUSDT',base:'BTC',quote:'USDT',name:'Bitcoin'});
export function assetName(base) {return NAMES[base] || base;}
function validAsset(a) {
  return a && typeof a.symbol==='string' && /^[A-Z0-9]{2,30}$/.test(a.symbol)
    && typeof a.base==='string' && /^[A-Z0-9]{1,20}$/.test(a.base)
    && typeof a.quote==='string' && /^[A-Z0-9]{2,10}$/.test(a.quote)
    && a.symbol===a.base+a.quote;
}
function normalizeAsset(a) {return {symbol:a.symbol,base:a.base,quote:a.quote,name:assetName(a.base)};}
function loadJson(key) {try {return JSON.parse(localStorage.getItem(key)||'null');} catch {return null;}}
let currentAsset = validAsset(loadJson(SELECTED_KEY)) ? normalizeAsset(loadJson(SELECTED_KEY)) : DEFAULT_ASSET;
export function getSelectedAsset() {return currentAsset;}
export function selectAsset(asset) {
  if (!validAsset(asset)) throw new Error('Par de mercado no válido');
  const next = normalizeAsset(asset);
  if (next.symbol===currentAsset.symbol) return false;
  currentAsset=next;
  try {localStorage.setItem(SELECTED_KEY,JSON.stringify(next));} catch {/* almacenamiento opcional */}
  document.dispatchEvent(new CustomEvent('atlas:assetchange',{detail:{asset:next}}));
  return true;
}
function spotAllowed(s) {
  if (!s || s.status!=='TRADING' || !s.isSpotTradingAllowed && s.isSpotTradingAllowed!==undefined) return false;
  if (s.permissionSets?.length && !s.permissionSets.some(group => group.includes('SPOT'))) return false;
  if (!s.permissionSets?.length && s.permissions?.length && !s.permissions.includes('SPOT')) return false;
  return typeof s.symbol==='string' && s.symbol===s.baseAsset+s.quoteAsset
    && /^[A-Z0-9]{2,30}$/.test(s.symbol) && /^[A-Z0-9]{1,20}$/.test(s.baseAsset);
}
export function buildCatalog(info) {
  if (!Array.isArray(info?.symbols)) throw new Error('Formato de catálogo inválido');
  const byCoin=new Map();
  for (const s of info.symbols) {
    if (!spotAllowed(s)) continue;
    const rank=QUOTES.indexOf(s.quoteAsset);
    const priority=rank===-1?QUOTES.length:rank;
    const prev=byCoin.get(s.baseAsset);
    if (!prev || priority<prev.priority || priority===prev.priority && s.symbol.localeCompare(prev.symbol)<0)
      byCoin.set(s.baseAsset,{symbol:s.symbol,base:s.baseAsset,quote:s.quoteAsset,priority});
  }
  const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
  return [...byCoin.values()].map(normalizeAsset).sort((a,b)=>collator.compare(a.name,b.name)||collator.compare(a.base,b.base));
}
let memoryCache = null;
let promise = null;
export async function getAssetCatalog({force=false}={}) {
  if (!force && memoryCache && Date.now()-memoryCache.at<TTL) return memoryCache.assets;
  if (!force) {
    const stored=loadJson(CACHE_KEY);
    if (stored && Date.now()-stored.at<TTL && Array.isArray(stored.assets) && stored.assets.length>=1 && stored.assets.every(validAsset)) {
      memoryCache=stored;return stored.assets;
    }
  }
  if (promise) return promise;
  promise=(async()=>{
    let problem;
    for (const host of HOSTS) {
      const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),14000);
      try {
        const res=await fetch(`${host}/api/v3/exchangeInfo`,{mode:'cors',cache:'no-store',credentials:'omit',signal:controller.signal});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const assets=buildCatalog(await res.json());
        if (!assets.length) throw new Error('Catálogo sin pares spot activos');
        memoryCache={at:Date.now(),assets};
        try {localStorage.setItem(CACHE_KEY,JSON.stringify(memoryCache));} catch {/* cuota limitada */}
        return assets;
      } catch(e) {problem=e;} finally {clearTimeout(timeout);}
    }
    const stored=loadJson(CACHE_KEY);
    if (stored?.assets?.length && stored.assets.every(validAsset)) return stored.assets;
    throw new Error(`No se pudo obtener el catálogo Binance Spot: ${problem?.message||'sin conexión'}`);
  })();
  try {return await promise;} finally {promise=null;}
}
window.addEventListener('storage', e=>{
  if (e.key!==SELECTED_KEY || !e.newValue) return;
  const next=loadJson(SELECTED_KEY);
  if (validAsset(next) && next.symbol!==currentAsset.symbol) {
    currentAsset=normalizeAsset(next);
    document.dispatchEvent(new CustomEvent('atlas:assetchange',{detail:{asset:currentAsset}}));
  }
});
