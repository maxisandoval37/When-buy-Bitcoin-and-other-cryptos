/**
 * Contexto informativo no predictivo. Solo titulares públicos recientes y eventos
 * programados con enlaces a fuente primaria. Nunca convierte WAIT en BUY/SELL.
 * Cero API keys, proxies y backends; la API puede fallar/CORS/rate limiting.
 */
const NEWS_URL = 'https://hn.algolia.com/api/v1/search_by_date';
const FED_CALENDAR = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const CPI_CALENDAR = 'https://www.bls.gov/schedule/news_release/cpi.htm';
const JOBS_CALENDAR = 'https://www.bls.gov/schedule/news_release/empsit.htm';
const KEY = 'atlas.context.enabled.v1';
const MAX_AGE_MS = 15 * 60_000;
const FAIL_CACHE_MS = 2 * 60_000;
const STALE_LIMIT_MS = 24 * 3_600_000;
const RATE_LIMIT_BACKOFF_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const COOLDOWN_KEY = 'whenbuy.hackernews.cooldown.v1';
const CACHE_PREFIX = 'whenbuy.hn.cache.v3.';
const NEWS_WINDOW_MS = 7 * 86_400_000;
const PRICE_EVENT_MS = 36 * 3_600_000;
const cacheByAsset=new Map();
const lastGoodByAsset=new Map();
const inflightByAsset=new Map();
const BITCOIN={base:'BTC',name:'Bitcoin',symbol:'BTCUSDT'};

// Agenda oficial FOMC, verificada a 28/10/2026. No se suponen horarios intradía.
// Cada fecha representa el último día de una reunión de dos jornadas; no se
// muestra ni inventa el horario del anuncio.
export const FED_DATES = Object.freeze([
  ['2026-12-09',true],
  ['2027-01-27',false],['2027-03-17',true],['2027-04-28',false],
  ['2027-06-09',true],['2027-07-28',false],['2027-09-15',true],
  ['2027-10-27',false],['2027-12-08',true]
]);

// Publicaciones BLS, fechas verificadas en la agenda oficial a 30/10/2026.
// En este calendario se conserva la fecha y no se especula con resultados.
export const CPI_DATES = Object.freeze([
  '2026-11-10','2026-12-10','2027-01-13','2027-02-11','2027-03-10',
  '2027-04-13','2027-05-12','2027-06-10','2027-07-14',
  '2027-08-11','2027-09-14','2027-10-14','2027-11-10','2027-12-10'
]);
export const JOBS_DATES = Object.freeze([
  '2026-11-06','2026-12-04','2027-01-08','2027-02-05','2027-03-05',
  '2027-04-02','2027-05-07','2027-06-04','2027-07-02',
  '2027-08-06','2027-09-03','2027-10-08','2027-11-05','2027-12-03'
]);

export function isContextEnabled() {
  try {return localStorage.getItem(KEY) === 'true';} catch {return false;}
}
export function setContextEnabled(enabled) {
  try {localStorage.setItem(KEY, String(Boolean(enabled)));} catch {/* estado solamente de sesión */}
  document.dispatchEvent(new CustomEvent('atlas:contextchange',{detail:{enabled:Boolean(enabled)}}));
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
// Señales heurísticas de título: no se inspecciona el cuerpo ni se afirma
// conocer la reacción real del precio. Reglas intencionalmente pequeñas.
const POSITIVE = [
  /\b(etf inflows?|inflows? into (?:bitcoin|btc)|entradas? (?:en|a) (?:los? )?etf|fluxos? de entrada)\b/,
  /\b(etf approv(?:ed|al)|approved bitcoin etf|aprobaci[oó]n de (?:un )?etf|etf aprovado)\b/,
  /\b(institutional adoption|adopci[oó]n institucional|ado[cç][aã]o institucional)\b/,
  /\b(rate cuts?|cuts? (?:interest )?rates?|recorte de tasas?|corte de juros|redu[cç][aã]o (?:da |de )?taxa)\b/,
  /\b(bitcoin treasury|bitcoin reserve|reserva (?:estrat[eé]gica )?de bitcoin|reserva de bitcoin)\b/,
  /\b(btc (?:surges?|rall(?:y|ies))|bitcoin (?:surges?|rall(?:y|ies))|bitcoin se dispara|bitcoin dispara)\b/
];
const NEGATIVE = [
  /\b(hack(?:ed|ing)?|breach|exploit|hackeo|hackeado|ataque hacker|roubo|invas[aã]o)\b/,
  /\b(etf outflows?|outflows? from (?:bitcoin|btc)|salidas? (?:de|del) (?:los? )?etf|sa[ií]das? de etf)\b/,
  /\b(ban(?:ned)? bitcoin|bitcoin ban|crypto ban|prohibici[oó]n (?:de|del) bitcoin|banimento de bitcoin)\b/,
  /\b(rate hikes?|hikes? (?:interest )?rates?|subida de tasas?|aumento (?:de|dos) juros)\b/,
  /\b(sec lawsuit|lawsuit against|demanda (?:contra|de)|processo contra)\b/,
  /\b(liquidations?|liquidaci[oó]n masiva|liquida[cç][oõ]es)\b/,
  /\b(bitcoin crash(?:es|ed)?|btc crash(?:es|ed)?|bitcoin plunge(?:s|d)?|bitcoin se desploma|bitcoin despenca)\b/,
  /\b(etf reject(?:ed|ion)|etf rechazado|etf rejeitado)\b/
];
const UNCERTAINTY = /\b(rumou?r|unconfirmed|potential|could|may|might|possibly|alleged|rumor|rumores|podria|posible|supuesto|rumor|pode|possivel)\b/;
const NEGATION = /\b(no|not|without|denies|falso|niega|sem|n[aã]o|nega)\b/;
const BTC_RE = /\b(bitcoin|btc|cryptocurrency|crypto|criptomonedas?|criptomoedas?|etf|federal reserve|fed|interest rates?|tasas? de interes|taxas? de juros)\b/;

export function classifyHeadline(title,asset=BITCOIN) {
  const s = normalize(title);
  // Los titulares de otras monedas NO heredan la clasificación específica de BTC.
  if(asset.base!=='BTC') {
    const name=normalize(asset.name||asset.base);
    const ticker=String(asset.base).toLowerCase();
    const escapeRE=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const identifiableName=name.length>=4 && new RegExp(`\\b${escapeRE(name)}\\b`).test(s);
    const identifiableTicker=ticker.length>=3 && new RegExp(`\\b${escapeRE(ticker)}\\b`).test(s)
      && (ticker.length>4 || /\\b(crypto|token|coin|blockchain|etf|exchange|criptomoneda|criptomoeda)\\b/.test(s));
    if(!identifiableName && !identifiableTicker) return {score:0,kind:'neutral',relevant:false};
    const uncertain=UNCERTAINTY.test(s)||NEGATION.test(s);
    const pos=/\b(adoption|partnership|integration|approved|approval|etf inflow|listing|upgrade|rally|surge|adopcion|alianza|acuerdo|aprobado|sube|ado[cç]ao|parceria|alta)\b/.test(s);
    const neg=/\b(hack|hacked|exploit|outflow|lawsuit|delisting|delisted|crash|plunge|ban|prohibition|ataque|robo|demanda|rechazo|caida|roubo|queda)\b/.test(s);
    if(uncertain || pos===neg) return {score:0,kind:uncertain?'uncertain':'neutral',relevant:true};
    return {score:pos?1:-1,kind:pos?'positive':'negative',relevant:true};
  }
  if (!BTC_RE.test(s)) return {score:0,kind:'neutral',relevant:false};
  const pos=POSITIVE.filter(regex=>regex.test(s)).length;
  const neg=NEGATIVE.filter(regex=>regex.test(s)).length;
  if (pos === 0 && neg === 0) return {score:0,kind:'neutral',relevant:true};
  // Evitamos interpretar afirmaciones negadas o rumores como datos confirmados.
  if (UNCERTAINTY.test(s) || NEGATION.test(s)) return {score:0,kind:'uncertain',relevant:true};
  // Ante emociones contradictorias, tratar como ambiguo en vez de inventar causalidad.
  if (pos && neg) return {score:0,kind:'uncertain',relevant:true};
  return {score:Math.sign(pos-neg)*Math.min(2, Math.max(pos,neg)),kind:pos?'positive':'negative',relevant:true};
}

function safeHttp(url) {
  try {const parsed=new URL(url);return parsed.protocol==='https:'||parsed.protocol==='http:'?parsed.href:null;}
  catch {return null;}
}
function upcomingEvents(now=Date.now()) {
  // Hora de mediodía UTC, SOLO como marcador de día; no se afirma que sea
  // la hora oficial del anuncio (que varía por fuente y zona horaria).
  const event=(type,day,url,extras={})=>({id:`${type}-${day}`,type,date:day,
    time:Date.parse(`${day}T12:00:00Z`),source:type==='fed'?'Federal Reserve':'U.S. Bureau of Labor Statistics',url,...extras});
  return [
    ...FED_DATES.map(([day,projections])=>event('fed',day,FED_CALENDAR,{projections})),
    ...CPI_DATES.map(day=>event('cpi',day,CPI_CALENDAR)),
    ...JOBS_DATES.map(day=>event('jobs',day,JOBS_CALENDAR))
  ].filter(item=>item.time >= now - 24*3_600_000 && item.time<now+400*86_400_000)
  .sort((a,b)=>a.time-b.time).slice(0,10);
}
export function getScheduledEvents(now=Date.now()) {return upcomingEvents(now);}

// El navegador consulta únicamente Hacker News a través del índice público de Algolia.
// Respuestas inválidas, restricciones y caídas se distinguen de una lista vacía.
export class NewsProviderError extends Error {
  constructor(code,provider,status=0) {
    super(code);this.name='NewsProviderError';this.code=code;
    this.provider=provider;this.httpStatus=status;
  }
}
function providerError(error,provider) {
  if(error instanceof NewsProviderError)return error;
  if(error?.name==='AbortError')return new NewsProviderError('timeout',provider);
  if(error?.message==='bad-news-format')return new NewsProviderError('invalid-response',provider);
  return new NewsProviderError('network',provider);
}
async function requestJson(url,{signal,timeout,provider}={}) {
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  signal?.addEventListener('abort',onAbort,{once:true});
  const timer=setTimeout(()=>controller.abort(),timeout||REQUEST_TIMEOUT_MS);
  try {
    const response=await fetch(url,{signal:controller.signal,mode:'cors',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
    if(response.status===429)throw new NewsProviderError('rate-limit',provider,429);
    if(!response.ok)throw new NewsProviderError(response.status===403?'forbidden':'http',provider,response.status);
    const body=await response.text();
    const prefix=body.trim().slice(0,230);
    if(/(?:limit requests|rate.limit|too many requests|throttl|quota exceeded)/i.test(prefix))
      throw new NewsProviderError('rate-limit',provider,response.status);
    if(!/^[\[{]/.test(prefix))throw new NewsProviderError('invalid-response',provider,response.status);
    try {return JSON.parse(body);}
    catch {throw new NewsProviderError('invalid-response',provider,response.status);}
  } catch(e) {throw providerError(e,provider);}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
function getTimestamp(key) {
  try{return Number(localStorage.getItem(key))||0;}catch{return 0;}
}
function setTimestamp(key,value) {
  try{localStorage.setItem(key,String(value));}catch{/* Private mode */}
}
// La caché reduce consultas; ante límites de la API se respeta una pausa por navegador.
// Hacker News es la fuente única de noticias. Los enlaces son informativos:
// no se usan como evidencia validada de sentimiento para generar operaciones.
export function parseHackerNews(payload,{asset=BITCOIN,now=Date.now()}={}) {
  if(!payload || !Array.isArray(payload.hits))throw new NewsProviderError('invalid-response','hackernews');
  const seen=new Set();
  const results=[];
  for(const hit of payload.hits.slice(0,90)) {
    const title=String(hit.title||'').trim().slice(0,260);
    const id=String(hit.objectID??'');
    let url=safeHttp(hit.url);
    if(!url?.startsWith('https://')) {
      if(!/^\d{1,20}$/.test(id))continue;
      url='https://news.ycombinator.com/item?id='+id;
    }
    const publishedAt=Date.parse(String(hit.created_at||''));
    if(title.length<12 || !Number.isFinite(publishedAt) ||
       publishedAt>now+3_600_000 || now-publishedAt>NEWS_WINDOW_MS)continue;
    const label=classifyHeadline(title,asset);
    if(!label.relevant)continue;
    const identity=normalize(title).replace(/[^a-z0-9]+/g,' ').slice(0,100);
    if(seen.has(identity))continue;
    seen.add(identity);
    const hostname=new URL(url).hostname.toLowerCase();
    const source=hostname==='news.ycombinator.com'?'Hacker News':hostname.slice(0,72);
    results.push({id:url,title,url,source,publishedAt,kind:'neutral',score:0});
  }
  return results.sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,18);
}
async function fetchHackerNews(asset,now) {
  if(now<getTimestamp(COOLDOWN_KEY))throw new NewsProviderError('rate-limit','hackernews');
  const url=new URL(NEWS_URL);
  url.search=new URLSearchParams({
    query:asset.base==='BTC'?'bitcoin':String(asset.name||asset.base).slice(0,65),
    tags:'story',hitsPerPage:'90',
    numericFilters:`created_at_i>${Math.floor((now-NEWS_WINDOW_MS)/1000)}`
  }).toString();
  try {
    const json=await requestJson(url,{provider:'hackernews',timeout:REQUEST_TIMEOUT_MS});
    return parseHackerNews(json,{asset,now});
  } catch(error) {
    const issue=providerError(error,'hackernews');
    if(issue.code==='rate-limit'||issue.httpStatus===503)
      setTimestamp(COOLDOWN_KEY,now+RATE_LIMIT_BACKOFF_MS);
    throw issue;
  }
}
function storageKey(asset){return CACHE_PREFIX+String(asset.symbol||asset.base).replace(/[^A-Z0-9]/gi,'').slice(0,32);}
function loadStored(asset,now) {
  try {
    const record=JSON.parse(sessionStorage.getItem(storageKey(asset))||'null');
    if(!record||!['live','empty'].includes(record.status)||now-record.fetchedAt>STALE_LIMIT_MS||record.fetchedAt>now)return null;
    if(!Array.isArray(record.news)||record.news.length>24)return null;
    return record;
  } catch{return null;}
}
function store(asset,record) {
  if(!['live','empty'].includes(record.status))return;
  try {
    sessionStorage.setItem(storageKey(asset),JSON.stringify({...record,news:record.news.slice(0,18)}));
  }catch{/* Storage may be disabled/full; in-memory cache remains. */}
}
function recordView(record,now,{stale=false}={}) {
  return {...record,status:stale?'stale':record.status,
    canInfluenceSignals:false,events:upcomingEvents(now)};
}
export async function getMarketContext({force=false,now=Date.now(),asset=BITCOIN}={}) {
  const key=String(asset.symbol||asset.base);
  const cached=cacheByAsset.get(key)||loadStored(asset,now);
  if(cached&&!cacheByAsset.has(key))cacheByAsset.set(key,cached);
  const lastGood=lastGoodByAsset.get(key)||loadStored(asset,now)||(['live','empty'].includes(cached?.status)?cached:null);
  const ttl=cached?.status==='unavailable'?FAIL_CACHE_MS:MAX_AGE_MS;
  if(cached && now-cached.fetchedAt<ttl && (!force || now-cached.fetchedAt<60_000))
    return cached.status==='unavailable' && lastGood?.news?.length && now-lastGood.fetchedAt<=STALE_LIMIT_MS
      ? {...cached,status:'stale',news:lastGood.news,source:'hackernews',canInfluenceSignals:false,events:upcomingEvents(now)}
      : recordView(cached,now);
  if(inflightByAsset.has(key))return inflightByAsset.get(key);
  const task=(async()=>{
    let record;
    try {
      const articles=await fetchHackerNews(asset,now);
      record={status:articles.length?'live':'empty',news:articles,source:'hackernews',fetchedAt:Date.now(),errorCode:null};
    } catch(error) {
      record={status:'unavailable',news:[],source:'hackernews',fetchedAt:Date.now(),
        errorCode:providerError(error,'hackernews').code};
    }
    cacheByAsset.set(key,record);
    store(asset,record);
    if(record.status==='live'||record.status==='empty')lastGoodByAsset.set(key,record);
    if(record.status==='unavailable'&&lastGood?.news?.length&&now-lastGood.fetchedAt<=STALE_LIMIT_MS)
      return {...record,status:'stale',news:lastGood.news,source:'hackernews',canInfluenceSignals:false,events:upcomingEvents(now)};
    return recordView(record,now);
  })().finally(()=>inflightByAsset.delete(key));
  inflightByAsset.set(key,task);
  return task;
}
export function evaluateMarketContext(technical,context,{now=Date.now()}={}) {
  // El contenido de Hacker News es curado por su comunidad; no prueba un efecto
  // de precio. Se muestra, pero no modifica señales técnicas ni puntuaciones.
  const nearbyEvent=(context.events??[]).find(event=>{
    const delta=event.time-now;
    return delta>=-12*3_600_000 && delta<=PRICE_EVENT_MS;
  })??null;
  const baseline=technical.signal;
  const blocked=nearbyEvent && (baseline==='BUY'||baseline==='SELL');
  return {signal:blocked?'WAIT':baseline,technicalSignal:baseline,
    reason:blocked?'event-risk':'none',score:null,level:'informational',
    eligibleArticles:0,independentSources:0,upcomingRisk:nearbyEvent,
    confluence:technical.confluence};
}
export async function enrichAnalysis(technical,{force=false,asset=BITCOIN}={}) {
  if (!isContextEnabled()) return {...technical,baseSignal:technical.signal,marketContext:null};
  const context=await getMarketContext({force,asset});
  const impact=evaluateMarketContext(technical,context);
  return {...technical,signal:impact.signal,baseSignal:technical.signal,marketContext:{...context,impact}};
}