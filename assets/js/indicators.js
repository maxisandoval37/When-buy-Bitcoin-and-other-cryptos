/**
 * Port 1:1 de IndicatorCalculator + SignalEngine (Spring Boot v1.1).
 * Únicamente velas cerradas; nunca se calcula una señal sobre la vela en formación.
 * Funciones puras: no DOM, red, dependencias, ni Node.
 */
export function ema(values, period) {
  if (!Number.isInteger(period) || period < 1 || values.length < period) throw new Error('Período EMA inválido');
  const result = Array(values.length).fill(NaN);
  let previous = mean(values, 0, period);
  result[period - 1] = previous;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    previous += alpha * (values[i] - previous);
    result[i] = previous;
  }
  return result;
}
function mean(values, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i];
  return sum / (to - from);
}
function emaNonNaN(values, period) {
  const first = values.findIndex(Number.isFinite);
  if (first < 0 || values.length - first < period) throw new Error('Datos insuficientes para MACD');
  return Array(first).fill(NaN).concat(ema(values.slice(first), period));
}
export function rsi(closes, period = 14) {
  if (closes.length <= period) throw new Error('Datos insuficientes para RSI');
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    gains += Math.max(0, diff);
    losses += Math.max(0, -diff);
  }
  gains /= period; losses /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains = (gains * (period - 1) + Math.max(0, diff)) / period;
    losses = (losses * (period - 1) + Math.max(0, -diff)) / period;
  }
  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}
export function atr(high, low, close, period = 14) {
  function tr(i) {
    return Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  let total = 0;
  for (let i = 1; i <= period; i++) total += tr(i);
  let value = total / period;
  for (let i = period + 1; i < close.length; i++) value = (value * (period - 1) + tr(i)) / period;
  return value;
}
export function calculateIndicators(candles) {
  if (!Array.isArray(candles) || candles.length < 220) throw new Error('Se necesitan al menos 220 velas cerradas para EMA 200');
  const n = candles.length;
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);
  if (candles.some(c => ![c.open,c.close,c.high,c.low,c.volume].every(Number.isFinite) ||
      c.open <= 0 || c.close <= 0 || c.high < c.low || c.low <= 0 || c.volume < 0)) {
    throw new Error('Velas inválidas: precio/volumen fuera de rango');
  }
  const e12 = ema(close, 12), e26 = ema(close, 26);
  const macd = Array(n).fill(NaN);
  for (let i = 25; i < n; i++) macd[i] = e12[i] - e26[i];
  const signal = emaNonNaN(macd, 9);
  const volAverage = mean(volume, n - 21, n - 1);
  const mid = mean(close, n - 20, n);
  let variance = 0;
  for (let i = n - 20; i < n; i++) variance += (close[i] - mid) ** 2;
  const band = 2 * Math.sqrt(variance / 20);
  const result = {
    ema20: ema(close, 20)[n - 1], ema50: ema(close, 50)[n - 1], ema200: ema(close, 200)[n - 1],
    rsi14: rsi(close, 14), macd: macd[n - 1], macdSignal: signal[n - 1],
    macdHistogram: macd[n - 1] - signal[n - 1],
    bollingerUpper: mid + band, bollingerMid: mid, bollingerLower: mid - band,
    atr14: atr(high,low,close,14), volumeRatio: volAverage === 0 ? 0 : volume[n - 1] / volAverage,
    lastVolume: volume[n - 1], avgVolume: volAverage,
    support: Math.min(...low.slice(-30)), resistance: Math.max(...high.slice(-30)),
  };
  if (!Object.values(result).every(Number.isFinite)) throw new Error('No se pudieron calcular indicadores confiables');
  return result;
}
export function evaluateSignal(candles, v) {
  const price = candles.at(-1).close, previous = candles.at(-2).close;
  const trendUp = price > v.ema200, trendDown = price < v.ema200;
  const fastUp = v.ema20 > v.ema50, fastDown = v.ema20 < v.ema50;
  const macdUp = v.macdHistogram > 0, macdDown = v.macdHistogram < 0;
  const rsiUp = v.rsi14 >= 50 && v.rsi14 <= 72;
  const rsiDown = v.rsi14 >= 28 && v.rsi14 < 50;
  const volUp = v.volumeRatio >= 1.2 && price > previous;
  const volDown = v.volumeRatio >= 1.2 && price < previous;
  const bullish = (trendUp ? 2 : 0) + Number(fastUp) + Number(macdUp) + Number(rsiUp) + Number(price > v.ema20) + Number(volUp);
  const bearish = (trendDown ? 2 : 0) + Number(fastDown) + Number(macdDown) + Number(rsiDown) + Number(price < v.ema20) + Number(volDown);
  const buy = trendUp && fastUp && macdUp && rsiUp && bullish >= 5;
  const sell = trendDown && fastDown && macdDown && rsiDown && bearish >= 5;
  const signal = buy ? 'BUY' : sell ? 'SELL' : 'WAIT';
  const regime = trendUp && fastUp ? 'Tendencia alcista' : trendDown && fastDown ? 'Tendencia bajista' : 'Tendencia mixta';
  const reasons = [
    trendUp ? 'Precio por encima de EMA 200: estructura alcista' : trendDown ? 'Precio por debajo de EMA 200: estructura bajista' : 'Precio sobre EMA 200: tendencia indefinida',
    fastUp ? 'EMA 20 supera EMA 50: impulso favorable' : fastDown ? 'EMA 20 por debajo de EMA 50: presión bajista' : 'EMA 20 y 50 prácticamente iguales',
    macdUp ? 'MACD positivo respecto a su señal' : macdDown ? 'MACD negativo respecto a su señal' : 'MACD sin dirección clara',
    `RSI 14 en ${v.rsi14.toFixed(1)}: ${v.rsi14 > 70 ? 'zona de sobrecompra' : v.rsi14 < 30 ? 'zona de sobreventa' : 'zona intermedia'}`,
    v.volumeRatio >= 1.2 ? 'Volumen elevado frente a las 20 velas anteriores' : 'Volumen sin expansión significativa',
  ];
  const warnings = [];
  if (v.rsi14 > 72) warnings.push('RSI elevado: posible agotamiento del impulso alcista.');
  if (v.rsi14 < 28) warnings.push('RSI muy bajo: una caída puede estar sobreextendida.');
  if (v.volumeRatio < 0.6) warnings.push('El volumen es bajo; la señal tiene menor respaldo.');
  if (signal === 'WAIT') warnings.push('Tendencia y momentum no confirman una entrada o salida.');
  warnings.push('La confluencia mide coincidencia de reglas, no probabilidad de éxito.');
  return {
    signal, signalLabel: buy ? 'Considerar compra' : sell ? 'Considerar venta' : 'Esperar confirmación',
    confluence: Math.round(100 * Math.max(bullish,bearish) / 7), bullishVotes: bullish, bearishVotes: bearish,
    regime, reasons, warnings,
  };
}
export function analyzeCandles(candles, {interval, livePrice, fetchedAt = new Date().toISOString()} = {}) {
  const v = calculateIndicators(candles);
  const decision = evaluateSignal(candles,v);
  const last = candles.at(-1), previous = candles.at(-2);
  return {
    symbol: 'BTCUSDT', interval, candleTime: new Date(last.closeTime).toISOString(), fetchedAt,
    livePrice, candleClose: last.close, candleChangePercent: 100 * (last.close / previous.close - 1),
    ...decision, indicators:v,
    series:candles.slice(-110).map(c => ({time:Math.floor(c.openTime/1000),open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume})),
  };
}
