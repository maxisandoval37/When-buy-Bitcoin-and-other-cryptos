/** Binance spot desde el navegador, sin API key, proxy, backend ni paquetes. */
import { analyzeCandles } from './indicators.js';
export const INTERVALS = Object.freeze({ '1h':3_600_000, '4h':14_400_000, '1d':86_400_000, '1w':604_800_000 });
const API_HOSTS = Object.freeze(['https://data-api.binance.vision','https://api.binance.com']);
const CACHE_MS = 60_000;
const validSymbol = s => typeof s==='string' && /^[A-Z0-9]{2,30}$/.test(s);
const cached = new Map();
const inFlight = new Map();

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {mode:'cors',cache:'no-store',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}
function parseCandle(raw) {
  if (!Array.isArray(raw) || raw.length < 7) throw new Error('Formato OHLCV inesperado del proveedor');
  const values = [raw[1],raw[2],raw[3],raw[4],raw[5]].map(Number);
  const [open,high,low,close,volume] = values;
  const openTime = Number(raw[0]), closeTime = Number(raw[6]);
  if (![...values,openTime,closeTime].every(Number.isFinite) || high < low || low <= 0 || close <= 0 || volume < 0 || closeTime <= openTime) {
    throw new Error('Valores no válidos del proveedor');
  }
  return {openTime,closeTime,open,high,low,close,volume};
}
function normalizeKlines(raw) {
  if (!Array.isArray(raw)) throw new Error('El proveedor no entregó velas válidas');
  const candles = raw.map(parseCandle);
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].openTime <= candles[i - 1].openTime) throw new Error('Velas duplicadas o desordenadas');
  }
  return candles;
}
async function getPair(host, interval, symbol) {
  const base = host + '/api/v3/';
  const params = new URLSearchParams({symbol,interval,limit:'350'});
  const [klines,spot] = await Promise.all([
    fetchJson(base+'klines?'+params), fetchJson(base+'ticker/price?'+new URLSearchParams({symbol})),
  ]);
  if (spot?.symbol !== symbol || !Number.isFinite(Number(spot.price)) || Number(spot.price) <= 0) {
    throw new Error('Cotización spot inválida');
  }
  return {candles:normalizeKlines(klines),livePrice:Number(spot.price)};
}
export async function getAnalysis(interval = '4h', {force = false, symbol = 'BTCUSDT'} = {}) {
  if (!validSymbol(symbol)) throw new Error('Símbolo de mercado inválido');
  const key=symbol+':'+interval;
  if (!(interval in INTERVALS)) throw new Error('Temporalidad no soportada');
  const recent = cached.get(key);
  if (!force && recent && Date.now() - recent.at < CACHE_MS) return recent.result;
  if (inFlight.has(key)) return inFlight.get(key);
  const run = (async()=> {
    let lastError = null;
    for (const host of API_HOSTS) {
      try {
        const {candles, livePrice} = await getPair(host,interval,symbol);
        const now = Date.now();
        // Binance closeTime corresponde al último milisegundo del intervalo.
        const closed = candles.filter(c => c.closeTime < now);
        if (closed.length < 220) throw new Error('El proveedor entregó menos de 220 velas cerradas');
        if (closed.at(-1).closeTime < now - INTERVALS[interval] * 2) throw new Error('Histórico desactualizado: no se emiten señales');
        const snapshot = analyzeCandles(closed,{interval,livePrice,fetchedAt:new Date(now).toISOString()});
        Object.defineProperty(snapshot,'sourceHost',{value:host, enumerable:false});
        snapshot.symbol=symbol;
        cached.set(key,{result:snapshot,at:now});
        return snapshot;
      } catch (e) { lastError=e; }
    }
    throw new Error(`No se pudo consultar Binance desde este navegador (red, CORS o restricción regional). ${lastError?.message ?? ''}`.trim());
  })();
  inFlight.set(key,run);
  try { return await run; } finally { inFlight.delete(key); }
}
/** Consulta histórica sin cálculo de señales, con paginación hasta 5000 velas. */
export async function getHistory({symbol='BTCUSDT',interval='1d',start,end,max=5000} = {}) {
  if (!validSymbol(symbol)) throw new Error('Símbolo de mercado inválido');
  const supported = ['1m','5m','15m','30m','1h','4h','1d','1w'];
  if (!supported.includes(interval)) throw new Error('Intervalo no válido');
  const from = typeof start === 'string' ? Date.parse(start) : Number(start);
  const to = typeof end === 'string' ? Date.parse(end) : Number(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('Rango histórico inválido');
  const limit = Math.min(5000,Math.max(1,Math.floor(max)));
  let current = from;
  const all=[];
  while (current < to && all.length < limit) {
    const params = new URLSearchParams({symbol,interval,startTime:String(current),endTime:String(to),limit:String(Math.min(1000,limit-all.length))});
    let batch = null, error = null;
    for (const host of API_HOSTS) {
      try {batch=normalizeKlines(await fetchJson(host+'/api/v3/klines?'+params));break;}
      catch(e) {error=e;}
    }
    if (!batch) throw new Error('Histórico no disponible: '+error?.message);
    if (!batch.length) break;
    all.push(...batch);
    const next = batch.at(-1).openTime + 1;
    if (next <= current) throw new Error('Paginación histórica inválida');
    current=next;
    if (batch.length < Math.min(1000,limit-all.length + batch.length)) break;
  }
  return {symbol,interval,count:all.length,candles:all};
}
export async function getSpotPrice(symbol='BTCUSDT') {
  if (!validSymbol(symbol)) throw new Error('Símbolo de mercado inválido');
  for (const host of API_HOSTS) {
    try {
      const data=await fetchJson(host+'/api/v3/ticker/price?'+new URLSearchParams({symbol}));
      const price=Number(data.price);
      if (data.symbol === symbol && Number.isFinite(price) && price > 0) {
        return {symbol,price,fetchedAt:new Date().toISOString()};
      }
    } catch (_) { /* siguiente host */ }
  }
  throw new Error('No se pudo obtener el precio spot desde Binance');
}
