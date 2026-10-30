/**
 * Logos del catálogo cripto (JS puro).
 * Primero se cargan los íconos habituales; el índice ampliado se importa
 * sólo si un activo no figura en esa selección. Sin Node, API keys ni backend.
 */
const POPULAR_LOGOS={"1000SATS":"1000sats-ordinals","AAVE":"aave","ADA":"cardano","ALGO":"algorand","APT":"aptos","ARB":"arbitrum","ATOM":"cosmos","AVAX":"avalanche-2","AXS":"axie-infinity","BCH":"bitcoin-cash","BNB":"binancecoin","BOME":"book-of-meme","BONK":"bonk","BTC":"bitcoin","CAKE":"pancakeswap-token","COMP":"compound-governance-token","CRV":"curve-dao-token","DASH":"dash","DOGE":"dogecoin","DOT":"polkadot","ENA":"ethena","EOS":"eos","ETC":"ethereum-classic","ETH":"ethereum","FARTCOIN":"fartcoin","FDUSD":"first-digital-usd","FET":"fetch-ai","FIL":"filecoin","FLOKI":"floki","FLOW":"flow","GALA":"gala","GRT":"the-graph","HBAR":"hedera-hashgraph","HYPE":"hyperliquid","ICP":"internet-computer","IMX":"immutable-x","INJ":"injective-protocol","IOTA":"iota","JASMY":"jasmycoin","JUP":"jupiter-exchange-solana","KAS":"kaspa","LDO":"lido-dao","LINK":"chainlink","LTC":"litecoin","MANA":"decentraland","MATIC":"matic-network","MKR":"maker","NEAR":"near","ONDO":"ondo-finance","OP":"optimism","ORDI":"ordinals","PAXG":"pax-gold","PEPE":"pepe","POL":"polygon-ecosystem-token","PYTH":"pyth-network","RENDER":"render-token","RNDR":"render-token","RUNE":"thorchain","SAND":"the-sandbox","SEI":"sei-network","SHIB":"shiba-inu","SNX":"havven","SOL":"solana","SUI":"sui","SYRUP":"syrup","TAO":"bittensor","TIA":"celestia","TON":"the-open-network","TRX":"tron","UNI":"uniswap","USDC":"usd-coin","USDT":"tether","VET":"vechain","VIRTUAL":"virtual-protocol","WIF":"dogwifcoin","WLD":"worldcoin-wld","XAUT":"tether-gold","XLM":"stellar","XMR":"monero","XRP":"ripple","XTZ":"tezos","ZEC":"zcash","ZIL":"zilliqa","ZRO":"layerzero"};
const BACKUP_SYMBOLS=new Set(["0XBTC","1INCH","2GIVE","AAVE","ABT","ACT","ACTN","ADA","ADD","ADX","AE","AEON","AEUR","AGI","AGRS","AION","ALGO","AMB","AMP","AMPL","ANKR","ANT","APE","APPC","ARDR","ARG","ARK","ARN","ARNX","ARY","AST","ATLAS","ATM","ATOM","AUDR","AURY","AUTO","AVAX","AYWA","BAB","BAL","BAND","BAT","BAY","BCBC","BCC","BCD","BCH","BCIO","BCN","BCO","BCPT","BDL","BEAM","BELA","BIX","BLCN","BLK","BLOCK","BLZ","BNB","BNT","BNTY","BOOTY","BOS","BPT","BQ","BRD","BSD","BSV","BTC","BTCD","BTCH","BTCP","BTCZ","BTDX","BTG","BTM","BTS","BTT","BTX","BURST","BZE","CALL","CC","CDN","CDT","CHAIN","CHAT","CHIPS","CHSB","CHZ","CIX","CLAM","CLOAK","CMM","CMT","CND","CNX","CNY","COB","COLX","COMP","COQUI","CRED","CRPT","CRV","CRW","CS","CTR","CTXC","CVC","D","DAI","DASH","DAT","DATA","DBC","DCN","DCR","DEEZ","DENT","DEW","DGB","DGD","DLT","DNT","DOCK","DOGE","DOT","DRGN","DROP","DTA","DTH","DTR","EBST","ECA","EDG","EDO","EDOGE","ELA","ELEC","ELF","ELIX","ELLA","EMB","EMC","EMC2","ENG","ENJ","ENTRP","EON","EOP","EOS","EQLI","EQUA","ETC","ETH","ETHOS","ETN","ETP","EUR","EVX","EXMO","EXP","FAIR","FCT","FIDA","FIL","FJC","FLDC","FLO","FLUX","FSN","FTC","FUEL","FUN","GAME","GAS","GBP","GBX","GBYTE","GENERIC","GIN","GLXT","GMR","GMT","GNO","GNT","GOLD","GRC","GRIN","GRS","GRT","GSC","GTO","GUP","GUSD","GVT","GXS","GZR","HIGHT","HNS","HODL","HOT","HPB","HSR","HT","HTML","HUC","HUSD","HUSH","ICN","ICP","ICX","IGNIS","ILK","INK","INS","ION","IOP","IOST","IOTX","IQ","ITC","JNT","JPY","KCS","KIN","KLOWN","KMD","KNC","KRB","KSM","LBC","LEND","LEO","LINK","LKK","LOOM","LPT","LRC","LSK","LTC","LUN","MAID","MANA","MATIC","MAX","MCAP","MCO","MDA","MDS","MED","MEETONE","MFT","MIOTA","MITH","MKR","MLN","MNX","MNZ","MOAC","MOD","MONA","MSR","MTH","MTL","MUSIC","MZC","NANO","NAS","NAV","NCASH","NDZ","NEBL","NEO","NEOS","NEU","NEXO","NGC","NIO","NKN","NLC2","NLG","NMC","NMR","NPXS","NTBC","NULS","NXS","NXT","OAX","OK","OMG","OMNI","ONE","ONG","ONT","OOT","OST","OX","OXT","OXY","PART","PASC","PASL","PAX","PAXG","PAY","PAYX","PINK","PIRL","PIVX","PLR","POA","POE","POLIS","POLY","POT","POWR","PPC","PPP","PPT","PRE","PRL","PUNGO","PURA","QASH","QIWI","QLC","QNT","QRL","QSP","QTUM","R","RADS","RAP","RAY","RCN","RDD","RDN","REN","REP","REPV2","REQ","RHOC","RIC","RISE","RLC","RPX","RUB","RVN","RYO","SAFE","SAFEMOON","SAI","SALT","SAN","SAND","SBD","SBERBANK","SC","SER","SHIFT","SIB","SIN","SKL","SKY","SLR","SLS","SMART","SNGLS","SNM","SNT","SNX","SOC","SOL","SPACEHBIT","SPANK","SPHTX","SRN","STAK","START","STEEM","STORJ","STORM","STOX","STQ","STRAT","STX","SUB","SUMO","SUSHI","SYS","TAAS","TAU","TBX","TEL","TEN","TERN","TGCH","THETA","TIX","TKN","TKS","TNB","TNC","TNT","TOMO","TPAY","TRIG","TRTL","TRX","TUSD","TZC","UBQ","UMA","UNI","UNITY","USD","USDC","USDT","UTK","VERI","VET","VIA","VIB","VIBE","VIVO","VRC","VRSC","VTC","VTHO","WABI","WAN","WAVES","WAX","WBTC","WGR","WICC","WINGS","WPR","WTC","X","XAS","XBC","XBP","XBY","XCP","XDN","XEM","XIN","XLM","XMCC","XMG","XMO","XMR","XMY","XP","XPA","XPM","XPR","XRP","XSG","XTZ","XUC","XVC","XVG","XZC","YFI","YOYOW","ZCL","ZEC","ZEL","ZEN","ZEST","ZIL","ZILLA","ZRX"]);
const LOCAL_LOGOS=Object.freeze({
  BTC:'./assets/img/coins/btc.svg',
  ETH:'./assets/img/coins/eth.svg',
  BNB:'./assets/img/coins/bnb.svg',
  SOL:'./assets/img/coins/sol.svg',
  XRP:'./assets/img/coins/xrp.svg'
});
const CDN_PRIMARY='https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos@main/images/';
const RAW_PRIMARY='https://raw.githubusercontent.com/simplr-sh/coin-logos/main/images/';
const CDN_BACKUP='https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/';
const RAW_BACKUP='https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/';
const RETRY_MS=10*60*1000;
const failed=new Map();
let extendedLogos=null,extendedPromise=null,extendedRetryAt=0;

async function loadExtendedLogos() {
  if(extendedLogos)return extendedLogos;
  if(extendedPromise)return extendedPromise;
  if(Date.now()<extendedRetryAt)return null;
  extendedPromise=import('./coin-icons-data.js?v=20261030-coinlogos32')
    .then(module=>{
      const loaded=module.EXTENDED_LOGO_IDS;
      if(!loaded || typeof loaded!=='object')throw new Error('Invalid crypto logo catalog');
      extendedLogos=loaded;
      return extendedLogos;
    })
    .catch(()=>{
      extendedRetryAt=Date.now()+RETRY_MS;
      return null;
    })
    .finally(()=>{extendedPromise=null;});
  return extendedPromise;
}

export function getLogoSources(asset) {
  const symbol=String(asset?.base||asset||'').toUpperCase();
  if(!/^[A-Z0-9]{1,20}$/.test(symbol))return [];
  const sources=[];
  if(LOCAL_LOGOS[symbol])sources.push(LOCAL_LOGOS[symbol]);
  const slug=POPULAR_LOGOS[symbol]||extendedLogos?.[symbol];
  if(slug){
    sources.push(CDN_PRIMARY+slug+'/standard.png');
    sources.push(RAW_PRIMARY+slug+'/standard.png');
  }
  if(BACKUP_SYMBOLS.has(symbol)){
    sources.push(CDN_BACKUP+symbol.toLowerCase()+'.png');
    sources.push(RAW_BACKUP+symbol.toLowerCase()+'.svg');
  }
  return sources;
}

export function mountCryptoLogo(container,asset,{eager=false}={}) {
  if(!container)return;
  const symbol=String(asset?.base||'').toUpperCase();
  container.classList.remove('has-crypto-logo');
  container.dataset.cryptoSymbol=symbol;
  const placeholder=document.createElement('span');
  placeholder.className='crypto-logo-fallback';
  placeholder.textContent=symbol==='BTC'?'₿':symbol.slice(0,2)||'?';
  container.replaceChildren(placeholder);
  const sources=getLogoSources(asset);
  if(sources.length) {
    const img=document.createElement('img');
    img.className='crypto-logo-image';
    img.alt='';
    img.setAttribute('aria-hidden','true');
    img.decoding='async';
    img.loading=eager?'eager':'lazy';
    img.draggable=false;
    let index=0;
    const next=()=>{
      // The selector builds its buttons off-DOM. img.isConnected would be false
      // here, preventing the very first src assignment and all logo loading.
      if(img.parentElement!==container)return;
      while(index<sources.length){
        const src=sources[index++];
        if(Date.now()-(failed.get(src)||0)<RETRY_MS)continue;
        img.src=src;
        return;
      }
      img.remove();
    };
    img.addEventListener('load',()=>{
      if(img.parentElement!==container)return;
      if(!img.naturalWidth){next();return;}
      container.classList.add('has-crypto-logo');
      img.classList.add('is-ready');
      placeholder.hidden=true;
    });
    img.addEventListener('error',()=>{
      if(img.parentElement!==container)return;
      failed.set(img.src,Date.now());
      next();
    });
    container.append(img);
    next();
  }
  if(!POPULAR_LOGOS[symbol] && !extendedLogos && /^[A-Z0-9]{1,20}$/.test(symbol)){
    void loadExtendedLogos().then(catalog=>{
      if(!catalog?.[symbol] || container.dataset.cryptoSymbol!==symbol
         || container.classList.contains('has-crypto-logo'))return;
      // The earlier icon might still be a monogram or failed fallback image.
      mountCryptoLogo(container,asset,{eager});
    });
  }
}
