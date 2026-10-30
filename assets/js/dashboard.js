import { getAnalysis } from './market.js';
import {getSelectedAsset} from './assets.js';
import { t, formatDate, getLocaleTag } from './i18n.js?v=20261030-hnonly28';
import { enrichAnalysis, isContextEnabled, setContextEnabled } from './market-context.js?v=20261030-hnonly28';

(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  let selectedAsset=getSelectedAsset();
  function digits(n) {return n>=1 ? 2 : n>=.01 ? 5 : n>=.0001 ? 7 : 8;}
  function numberPrice(n) {if(!Number.isFinite(n))return '—'; if(n!==0 && Math.abs(n)<0.00000001)return n.toExponential(3);return new Intl.NumberFormat('en-US',{minimumFractionDigits:Math.min(2,digits(Math.abs(n))),maximumFractionDigits:digits(Math.abs(n))}).format(n);}
  function quotePrefix() {return ({USDT:'$',USDC:'$',FDUSD:'$',USD1:'$',TUSD:'$',DAI:'$',EUR:'€',TRY:'₺',BRL:'R$',ARS:'AR$',BTC:'₿',ETH:'Ξ'})[selectedAsset.quote]||'';}
  function formatAxis(n){if(n===0)return '0'; if(Math.abs(n)<0.01)return n.toPrecision(3);return compact.format(n);}
  const compact = new Intl.NumberFormat('en-US', {maximumFractionDigits:2, notation:'compact'});
  const timestamp = (date) => formatDate(date, {timeZone:'UTC', hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short'});
  const money = (n) => quotePrefix() + numberPrice(n) + (quotePrefix()?'':' '+selectedAsset.quote);
  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
  const cls = (positive, negative) => positive ? 'positive' : negative ? 'negative' : 'neutral';
  const intervalParam = new URLSearchParams(location.search).get('interval');
  let interval = ['1h','4h','1d','1w'].includes(intervalParam) ? intervalParam : '4h';
  let chartType = 'line';
  let snapshot = null;
  let rawSnapshot = null;
  let requestToken = 0;
  let isLoading = false;
  let hoverIndex = null;
  let lastError = null;

  function setText(id, text) { const el = $(id); if (el) el.textContent = String(text); }
  function statusTag(target, text, type) {
    const el = $(target);
    if (!el) return;
    el.replaceChildren();
    const badge = document.createElement('span');
    badge.className = 'table-tag ' + type;
    badge.textContent = text;
    el.append(badge);
  }
  function metricStatus(target, text, type) {
    const el = $(target);
    el.className = 'mini-status ' + type;
    el.textContent = text;
  }
  function localizeError(message) {
    const expressions = [
      ['No se pudo consultar Binance desde este navegador (red, CORS o restricción regional).','market.unavailable'],
      ['El proveedor entregó menos de 220 velas cerradas','market.notEnough'],
      ['Histórico desactualizado: no se emiten señales','market.stale'],
      ['Formato OHLCV inesperado del proveedor','market.invalidFormat'],
      ['Valores no válidos del proveedor','market.invalidValues'],
      ['El proveedor no entregó velas válidas','market.invalidCandles'],
      ['Velas duplicadas o desordenadas','market.unsorted'],
      ['Cotización spot inválida','market.invalidSpot'],
      ['No se pudieron calcular indicadores confiables','engine.calcFailed'],
    ];
    let result=String(message || t('error.unknown'));
    for (const [phrase,key] of expressions) result=result.replace(phrase,t(key));
    return result;
  }
  function showError(message) {
    $('error-banner').classList.add('visible');
    lastError=message;
    setText('error-message', t('error.prefix',{reason:localizeError(message)}) + (snapshot ? t('error.stale') : ''));
    $('connection-status').classList.add('offline');
    $('connection-status').lastChild.textContent = ' ' + t('top.offline');
  }
  function clearError() {
    $('error-banner').classList.remove('visible');
    lastError=null;
    $('connection-status').classList.remove('offline');
    $('connection-status').lastChild.textContent = ' ' + t('top.connected');
  }
  function showToast(label) {
    setText('toast-title', t('signal.changedTitle'));
    setText('toast-body', t('signal.changedBody',{signal:label}));
    $('signal-toast').hidden = false;
  }
  function summary(d) {
    const why=d.marketContext?.impact?.reason;
    if (why==='event-risk') return t('context.blockEvent');
    if (why==='conflict-bearish') return t('context.blockBear');
    if (why==='conflict-bullish') return t('context.blockBull');
    return t(d.signal==='BUY' ? 'signal.buySummary' : d.signal==='SELL' ? 'signal.sellSummary' : 'signal.waitSummary');
  }
  function updateDashboard(d,{announce=true}={}) {
    const previousSignal = snapshot?.symbol===d.symbol?snapshot.signal:null;
    snapshot = d;
    setText('spot-price', numberPrice(d.livePrice));
    setText('candle-close', numberPrice(d.candleClose));
    setText('candle-time', 'UTC · ' + timestamp(new Date(d.candleTime)));
    const change = $('price-change');
    change.className = 'change-badge ' + (d.candleChangePercent > 0 ? 'up' : d.candleChangePercent < 0 ? 'down' : '');
    change.textContent = signed(d.candleChangePercent) + '%';
    setText('chart-count', d.series.length);
    const panel = document.querySelector('.signal-panel');
    panel.classList.remove('is-buy','is-sell','is-wait');
    panel.classList.add('is-' + d.signal.toLowerCase());
    setText('signal-short', t(d.signal === 'BUY' ? 'status.bullish' : d.signal === 'SELL' ? 'status.bearish' : 'status.neutral'));
    const signalLabel=t(d.signal === 'BUY' ? 'signal.buy' : d.signal === 'SELL' ? 'signal.sell' : 'signal.wait');
    setText('signal-verdict', signalLabel);
    setText('signal-summary', summary(d));
    setText('confluence', d.confluence);
    $('confluence-fill').style.width = Math.min(100, Math.max(0, d.confluence)) + '%';
    const v = d.indicators;
    const trendUp=d.candleClose>v.ema200 && v.ema20>v.ema50;
    const trendDown=d.candleClose<v.ema200 && v.ema20<v.ema50;
    setText('regime-text',t(trendUp?'signal.regimeUp':trendDown?'signal.regimeDown':'signal.regimeMixed'));
    setText('momentum-text', t(v.macdHistogram > 0 ? 'signal.macdUp' : 'signal.macdDown'));
    setText('updated-at', timestamp(new Date(d.fetchedAt)) + ' UTC');
    setText('ema200', money(v.ema200));
    metricStatus('ema-status', t(d.candleClose > v.ema200 ? 'price.above' : 'price.below'),
      d.candleClose > v.ema200 ? 'positive' : 'negative');
    setText('rsi', v.rsi14.toFixed(1));
    $('rsi-needle').style.left = Math.max(0, Math.min(100, v.rsi14)) + '%';
    metricStatus('rsi-status', t(v.rsi14 > 70 ? 'rsi.overbought' : v.rsi14 < 30 ? 'rsi.oversold' : 'rsi.neutralZone'),
      v.rsi14 > 70 ? 'negative' : v.rsi14 < 30 ? 'negative' : 'neutral');
    setText('macd', signed(v.macdHistogram));
    metricStatus('macd-status', t(v.macdHistogram > 0 ? 'metric.positive' : 'metric.negative'), cls(v.macdHistogram > 0, v.macdHistogram < 0));
    setText('volume', v.volumeRatio.toFixed(2) + '×');
    metricStatus('volume-status', t(v.volumeRatio >= 1.2 ? 'metric.highVolume' : 'metric.normalVolume'),
      v.volumeRatio >= 1.2 ? 'positive' : 'neutral');

    setText('row-ema', money(v.ema20) + ' / ' + money(v.ema50));
    statusTag('state-ema', t(v.ema20 > v.ema50 ? 'metric.bullish' : 'metric.bearish'), v.ema20 > v.ema50 ? 'up' : 'down');
    setText('row-rsi', v.rsi14.toFixed(1) + ' / 100');
    statusTag('state-rsi', t(v.rsi14 > 70 ? 'rsi.overbought' : v.rsi14 < 30 ? 'rsi.oversold' : 'metric.neutral'),
      v.rsi14 > 70 || v.rsi14 < 30 ? 'down' : 'flat');
    setText('row-macd', signed(v.macdHistogram));
    statusTag('state-macd', t(v.macdHistogram > 0 ? 'metric.positive' : 'metric.negative'), v.macdHistogram > 0 ? 'up' : 'down');
    setText('row-bb', money(v.bollingerLower) + ' — ' + money(v.bollingerUpper));
    statusTag('state-bb', t(d.candleClose > v.bollingerUpper ? 'metric.upperBand' :
      d.candleClose < v.bollingerLower ? 'metric.lowerBand' : 'metric.withinRange'), 'flat');
    setText('row-vol', t('metric.timesAverage',{value:v.volumeRatio.toFixed(2)}));
    statusTag('state-vol', t(v.volumeRatio >= 1.2 ? 'metric.high' : 'metric.usual'), v.volumeRatio >= 1.2 ? 'up' : 'flat');
    setText('row-atr', money(v.atr14));
    statusTag('state-atr', t('metric.informational'), 'flat');
    setText('resistance', money(v.resistance));
    setText('support', money(v.support));
    setText('current-level', t('price.closing',{price:money(d.candleClose)}));
    const warningKey=v.rsi14 > 72 ? 'warn.highRsi' : v.rsi14 < 28 ? 'warn.lowRsi' : v.volumeRatio < .6 ? 'warn.lowVolume' : d.signal === 'WAIT' ? 'warn.wait' : 'note.warning';
    setText('dynamic-warning', d.marketContext?.impact?.reason==='event-risk' ? t('context.blockEvent') : d.marketContext?.impact?.reason?.startsWith('conflict') ? summary(d) : t(warningKey));
    renderContext(d);
    if (announce && previousSignal && previousSignal !== d.signal) showToast(signalLabel);
    drawChart();
  }
  async function load(force = false) {
    if (isLoading && !force) return;
    const token = ++requestToken;
    isLoading = true;
    $('refresh-btn').classList.add('loading');
    try {
      const asset=selectedAsset;
      const base = await getAnalysis(interval, {force,symbol:asset.symbol});
      if (token !== requestToken) return;
      rawSnapshot=base;
      const data=await enrichAnalysis(base, {force,asset});
      if (token !== requestToken) return;
      updateDashboard(data);
      document.dispatchEvent(new CustomEvent('atlas:analysis', {detail:data}));
      clearError();
    } catch (e) {
      if (token !== requestToken) return;
      showError(e instanceof Error ? e.message : t('error.unknown'));
    } finally {
      if (token === requestToken) {
        isLoading = false;
        $('refresh-btn').classList.remove('loading');
      }
    }
  }

  function makeElement(tag,className,text) {
    const el=document.createElement(tag);
    if (className) el.className=className;
    if (text!==undefined) el.textContent=text;
    return el;
  }
  function dateLabel(ms, options={}) {
    return formatDate(new Date(ms),{timeZone:'UTC',day:'2-digit',month:'short',...options});
  }
  function sourceAnchor(url,label) {
    const a=makeElement('a','',label);
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    return a;
  }
  function renderContext(d) {
    const panel=$('market-context-panel');
    const enabled=isContextEnabled();
    $('context-toggle').checked=enabled;
    $('context-toggle').setAttribute('aria-checked',String(enabled));
    panel.hidden=!enabled;
    if (!enabled) {
      $('chart-marker-layer').hidden=true;
      $('chart-marker-layer').replaceChildren();
      $('chart-future-badge').hidden=true;
      document.getElementById('context-signal-driver')?.remove();
      return;
    }
    const ctx=d.marketContext;
    const status=$('context-status').parentElement;
    const newsStatus=ctx?.status;
    const live=newsStatus==='live';
    const available=live || newsStatus==='empty';
    const stale=newsStatus==='stale';
    status.classList.toggle('offline',newsStatus==='unavailable'||stale);
    status.classList.toggle('fallback',stale);
    const statusKey=!ctx?'context.loading':stale?'context.feedStale':live?'context.feedLive':newsStatus==='empty'?'context.feedEmpty':'context.feedOffline';
    setText('context-status',t(statusKey));
    setText('context-news-source',t('context.newsSource'));
    const newsList=$('context-news-list'); newsList.replaceChildren();
    if (!ctx?.news?.length) {
      const errorKey=ctx?.errorCode==='timeout'?'context.errorTimeout':ctx?.errorCode==='rate-limit'||ctx?.errorCode==='throttled'?'context.errorRate':ctx?.errorCode==='invalid-response'?'context.errorResponse':ctx?.errorCode==='forbidden'?'context.errorAccess':'context.notAvailableTitle';
      newsList.append(makeElement('p','context-empty',t(available?'context.noNews':errorKey)));
    }
    else for (const item of ctx.news.slice(0,7)) {
      const article=makeElement('article','context-news-item');
      article.append(makeElement('span',`context-news-dot ${item.kind}`));
      const body=makeElement('div','context-news-main');
      const link=sourceAnchor(item.url,item.title);link.className='context-news-link';
      const meta=makeElement('div','context-news-meta');
      meta.append(makeElement('span','',item.source), makeElement('span','',dateLabel(item.publishedAt,{hour:'2-digit',minute:'2-digit'})));
      const tone=item.kind==='positive'?'context.newsStatusPositive':item.kind==='negative'?'context.newsStatusNegative':item.kind==='uncertain'?'context.newsStatusUncertain':'context.newsStatusNeutral';
      meta.append(makeElement('span',`context-tone ${item.kind}`,t(tone)));
      body.append(link,meta);article.append(body);newsList.append(article);
    }
    const eventList=$('context-events-list');eventList.replaceChildren();
    if (!ctx?.events?.length) eventList.append(makeElement('p','context-empty',t('context.noEvents')));
    else for (const item of ctx.events.slice(0,4)) {
      const article=makeElement('article','context-event-item');
      const date=makeElement('div','context-event-date');date.append(makeElement('strong','',item.date.slice(8,10)),makeElement('span','',dateLabel(item.time,{month:'short'}).replace(/[0-9\s]/g,'')));
      const info=makeElement('div','context-event-info');
      const titleKey=item.type==='fed'?'context.eventFed':item.type==='cpi'?'context.eventCpi':'context.eventJobs';
      const detailKey=item.type==='fed'?(item.projections?'context.eventFedProjections':'context.eventFedGeneral'):'context.eventDataUncertain';
      info.append(makeElement('strong','',t(titleKey)),
        makeElement('p','',t(detailKey)+' · '+dateLabel(item.time,{year:'numeric'})));
      const anchor=sourceAnchor(item.url,t('context.eventDetails'));info.append(anchor);
      article.append(date,info);eventList.append(article);
    }
    const impact=ctx?.impact;
    const measurable=live && ctx?.canInfluenceSignals!==false && impact?.independentSources>=2 && impact?.eligibleArticles>=2;
    const score=measurable?impact.score:null;
    setText('context-impact-value',score===null?t('context.notApplicable'):`${score>0?'+':''}${score} / 100`);
    $('context-meter').hidden=!measurable;
    $('context-scale').hidden=!measurable;
    $('context-meter-fill').style.left=`${50+(score??0)/2}%`;
    let detail='context.noImpact';
    if (impact?.reason==='event-risk') detail='context.blockEvent';
    else if(stale)detail='context.staleImpact';
    else if(live)detail='context.hnInformational';
    else if(newsStatus==='empty')detail='context.emptyImpact';
    else if(!available)detail='context.unavailable';
    else if (!measurable) detail='context.insufficient';
    else if (impact.reason==='conflict-bearish') detail='context.blockBear';
    else if (impact.reason==='conflict-bullish') detail='context.blockBull';
    else if (impact.level==='positive') detail='context.positiveImpact';
    else if (impact.level==='negative') detail='context.negativeImpact';
    setText('context-impact-reason',t(detail));
    const driverList=$('signal-drivers');
    let driver=$('context-signal-driver');
    if(!driver) {
      driver=makeElement('div','signal-driver');driver.id='context-signal-driver';
      driver.append(makeElement('span','driver-mark','◌'),makeElement('span','context-driver-text'));
      driverList.append(driver);
    }
    driver.querySelector('.context-driver-text').textContent=t(impact?.reason==='event-risk'?'context.blockEvent':impact?.reason==='conflict-bearish'?'context.blockBear':impact?.reason==='conflict-bullish'?'context.blockBull':stale?'context.staleImpact':newsStatus==='empty'?'context.emptyImpact':live?'context.hnInformational':'context.unavailable');
  }
  function drawContextMarkers(items,pad,plotWidth) {
    const layer=$('chart-marker-layer'),future=$('chart-future-badge');
    layer.replaceChildren();future.hidden=true;
    const data=snapshot?.marketContext;
    if (!isContextEnabled() || !data || !items.length) {layer.hidden=true;return;}
    layer.hidden=false;
    const start=items[0].time*1000, end=items.at(-1).time*1000;
    const markers=(data.status==='stale'?[]:data.news||[]).filter(item=>item.publishedAt>=start && item.publishedAt<=Date.now())
      .sort((a,b)=>b.publishedAt-a.publishedAt);
    const occupied=[];
    for (const item of markers) {
      const px=pad.left+(Math.min(item.publishedAt,end)-start)/(end-start)*plotWidth;
      if (occupied.some(prev=>Math.abs(px-prev)<29))continue;
      occupied.push(px);
      const a=sourceAnchor(item.url,'N');
      a.className='chart-news-marker '+item.kind;
      a.style.left=`${px}px`;
      a.title=`${t('context.chartNews')} · ${dateLabel(item.publishedAt,{hour:'2-digit',minute:'2-digit'})} UTC${item.publishedAt>end?' · '+t('context.afterLastCandle'):''} · ${item.title}`;
      a.setAttribute('aria-label',a.title);layer.append(a);
      if (occupied.length>=7)break;
    }
    // Un evento futuro nunca se dibuja como precio proyectado.
    const upcoming=(data.events||[]).find(item=>item.time>Date.now());
    if (upcoming) {
      future.hidden=false;
      future.textContent=`${t('context.upcomingLabel')} · ${upcoming.type==='fed'?'FOMC':upcoming.type==='cpi'?'CPI':'NFP'} ${dateLabel(upcoming.time)}`;
      future.title=t('context.calendarNote');
    }
  }

  function drawChart() {
    const canvas = $('price-chart');
    const container = $('chart-frame');
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 100 || height < 100) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!snapshot?.series?.length) { ctx.fillStyle = '#a4b2c3'; ctx.font = '12px DM Sans'; ctx.fillText(t('chart.loading'), 20, height / 2); return; }
    const items = snapshot.series;
    const pad = {top:14, right:74, bottom:27, left:6};
    const volumeHeight = 40;
    const plotHeight = height - pad.top - pad.bottom - volumeHeight;
    const plotWidth = width - pad.left - pad.right;
    const min = Math.min(...items.map(x => x.low));
    const max = Math.max(...items.map(x => x.high));
    const margin = (max - min || max * .03) * .10;
    const bottom = min - margin;
    const top = max + margin;
    const y = (price) => pad.top + (top - price) / (top - bottom) * plotHeight;
    const x = (i) => pad.left + i / Math.max(1, items.length - 1) * plotWidth;
    // Horizontales de referencia y eje de precios.
    ctx.font = '10px DM Sans, sans-serif'; ctx.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++) {
      const value = bottom + (top - bottom) * (4 - k) / 4;
      const yy = y(value);
      ctx.strokeStyle = '#edf1f5'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right + 4, yy); ctx.stroke();
      ctx.fillStyle = '#9ba9b8'; ctx.fillText(formatAxis(value), width - pad.right + 11, yy);
    }
    if (chartType === 'line') {
      const gradient = ctx.createLinearGradient(0, pad.top, 0, plotHeight + pad.top);
      gradient.addColorStop(0, '#517bd52c'); gradient.addColorStop(1, '#517bd500');
      ctx.beginPath(); items.forEach((item,i) => i === 0 ? ctx.moveTo(x(i), y(item.close)) : ctx.lineTo(x(i), y(item.close)));
      ctx.lineTo(x(items.length - 1), pad.top + plotHeight);ctx.lineTo(x(0),pad.top+plotHeight);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
      ctx.beginPath();items.forEach((item,i)=>i === 0 ? ctx.moveTo(x(i), y(item.close)) : ctx.lineTo(x(i), y(item.close)));
      ctx.strokeStyle = '#5076d6';ctx.lineWidth=2.35;ctx.lineJoin='round';ctx.stroke();
      const last=items.at(-1);ctx.beginPath();ctx.arc(x(items.length-1),y(last.close),3.5,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#5076d6';ctx.stroke();
    } else {
      const barWidth = Math.max(1, Math.min(8, plotWidth / items.length * .65));
      items.forEach((item,i) => {
        const px = x(i);const green = item.close >= item.open;
        ctx.strokeStyle = green ? '#25a88e' : '#d88174';ctx.fillStyle=ctx.strokeStyle;
        ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,y(item.high));ctx.lineTo(px,y(item.low));ctx.stroke();
        const topY=Math.min(y(item.open),y(item.close));
        ctx.fillRect(px-barWidth/2,topY,barWidth,Math.max(1,Math.abs(y(item.close)-y(item.open))));
      });
    }
    // Volumen: eje separado y discreto.
    const maxVol = Math.max(1, ...items.map(item=>item.volume));
    const barWidth = Math.max(1, plotWidth / items.length * .66);
    items.forEach((item,i)=>{
      const vol = Math.min(volumeHeight-5, item.volume/maxVol*(volumeHeight-5));
      ctx.fillStyle = item.close >= item.open ? '#b5d7c9' : '#edc8c0';
      ctx.fillRect(x(i)-barWidth/2,pad.top+plotHeight+volumeHeight-vol,barWidth,vol);
    });
    // Tres etiquetas temporales.
    const idx = [0,Math.floor((items.length-1)/2),items.length-1];
    ctx.fillStyle = '#9ba9b8';ctx.textBaseline='bottom';
    idx.forEach((i,j)=>{
      const date = new Date(items[i].time * 1000);
      const label = date.toLocaleDateString(getLocaleTag(),{month:'short',day:'numeric',timeZone:'UTC'});
      const approx = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(width-pad.right-approx, Math.max(6,x(i)-approx/2)),height-2);
    });
    drawContextMarkers(items,pad,plotWidth);
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < items.length) {
      const point = items[hoverIndex];
      ctx.strokeStyle='#9fb1c6';ctx.setLineDash([4,4]);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x(hoverIndex),pad.top);ctx.lineTo(x(hoverIndex),height-pad.bottom);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(x(hoverIndex),y(point.close),4,0,2*Math.PI);ctx.fillStyle='#5076d6';ctx.fill();
    }
  }

  function updateHover(event) {
    if (!snapshot?.series?.length) return;
    const rect = $('price-chart').getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = $('chart-frame').clientWidth;
    const point = Math.round((x - 6) / Math.max(1, width - 80) * (snapshot.series.length-1));
    hoverIndex = Math.min(snapshot.series.length-1,Math.max(0,point));
    const item = snapshot.series[hoverIndex];
    const tip = $('chart-tooltip');
    const time = new Date(item.time*1000).toLocaleString(getLocaleTag(), {timeZone:'UTC',dateStyle:'short',timeStyle:'short'});
    tip.textContent = t('chart.tooltip',{time,price:money(item.close),volume:compact.format(item.volume)});
    tip.hidden = false;
    const tipWidth=tip.offsetWidth;
    tip.style.left = Math.max(3,Math.min(width-tipWidth-4,x-tipWidth/2))+'px';
    tip.style.top='7px';
    drawChart();
  }
  function applyAssetLabels() {
    setText('top-asset-name',selectedAsset.name);
    setText('hero-asset-name',selectedAsset.name+',');
    setText('asset-name',selectedAsset.name);
    setText('asset-symbol',`${selectedAsset.base} / ${selectedAsset.quote}`);
    setText('asset-coin-icon',selectedAsset.base==='BTC'?'₿':selectedAsset.base.slice(0,2));
    setText('asset-spot-caption',selectedAsset.quote==='USDT'?t('assets.usdtDescription'):t('assets.quoteDescription',{quote:selectedAsset.quote}));
    setText('asset-price-title',t('assets.priceTitle',{asset:selectedAsset.name}));
    setText('asset-currency-prefix',quotePrefix());
    setText('asset-currency-suffix',selectedAsset.quote);
    setText('asset-chart-watermark',`${selectedAsset.base} / ${selectedAsset.quote}`);
    $('price-chart').setAttribute('aria-label',t('assets.chartAria',{asset:selectedAsset.name,quote:selectedAsset.quote}));
    $('asset-coin-icon').classList.toggle('is-alt-coin',selectedAsset.base!=='BTC');
    $('context-description').textContent=t('assets.contextDescription',{asset:selectedAsset.name});
    document.title=`When buy Bitcoin and other cryptos · ${selectedAsset.name}`;
  }
  function resetDisplay() {
    snapshot=null;rawSnapshot=null;hoverIndex=null;
    for(const id of ['spot-price','candle-close','price-change','ema200','rsi','macd','volume','row-ema','row-rsi','row-macd','row-bb','row-vol','row-atr','resistance','support','confluence','chart-count','signal-verdict','signal-summary'])setText(id,'—');
    $('chart-tooltip').hidden=true;
    $('signal-toast').hidden=true;
    $('signal-panel')?.classList.remove('is-buy','is-sell');
    drawChart();
  }
  function initialize() {
    applyAssetLabels();
    document.addEventListener('atlas:assetchange',event=>{
      ++requestToken;isLoading=false;$('refresh-btn').classList.remove('loading');
      selectedAsset=event.detail.asset;
      applyAssetLabels();resetDisplay();clearError();
      void load(true);
    });
    $('local-clock').textContent = 'UTC · ' + formatDate(new Date(),{timeZone:'UTC',hour:'2-digit',minute:'2-digit'});
    document.querySelectorAll('[data-interval]').forEach(button => {
      const active = button.dataset.interval === interval;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-interval]').forEach(button=>button.addEventListener('click',()=>{
      if (interval === button.dataset.interval) return;
      interval=button.dataset.interval;
      document.querySelectorAll('[data-interval]').forEach(el=>{
        const active = el === button;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));
      });
      snapshot=null;rawSnapshot=null;hoverIndex=null;load(true);drawChart();
    }));
    document.querySelectorAll('[data-chart]').forEach(button=>button.addEventListener('click',()=>{
      chartType=button.dataset.chart;
      document.querySelectorAll('[data-chart]').forEach(el=>el.classList.toggle('active',el===button));drawChart();
    }));
    $('refresh-btn').addEventListener('click',()=>load(true));
    $('context-toggle').checked=isContextEnabled();
    $('context-toggle').setAttribute('aria-checked',String(isContextEnabled()));
    $('context-toggle').addEventListener('change',event=>setContextEnabled(event.target.checked));
    document.addEventListener('atlas:contextchange',()=>{
      if (rawSnapshot) {
        // Invalida peticiones pendientes para impedir decisiones de modo anterior.
        ++requestToken;isLoading=false;$('refresh-btn').classList.remove('loading');
        if (!isContextEnabled()) {updateDashboard({...rawSnapshot,baseSignal:rawSnapshot.signal,marketContext:null},{announce:false});return;}
        updateDashboard({...rawSnapshot,baseSignal:rawSnapshot.signal,marketContext:null},{announce:false});
      }
      void load(false);
    });
    $('retry-btn').addEventListener('click',()=>load(true));
    $('toast-dismiss').addEventListener('click',()=>{$('signal-toast').hidden=true;});
    $('price-chart').addEventListener('pointermove',updateHover);
    $('price-chart').addEventListener('pointerleave',()=>{hoverIndex=null;$('chart-tooltip').hidden=true;drawChart();});
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(drawChart).observe($('chart-frame'));
    else window.addEventListener('resize',drawChart);
    load();
    setInterval(()=>{if (!document.hidden) load();},60_000);
    setInterval(()=>{$('local-clock').textContent='UTC · '+formatDate(new Date(),{timeZone:'UTC',hour:'2-digit',minute:'2-digit'});},60_000);
    document.addEventListener('atlas:languagechange',()=>{
      applyAssetLabels();
      if (snapshot) updateDashboard(snapshot,{announce:false});
      else drawChart();
      if (lastError!==null) showError(lastError);else clearError();
      $('local-clock').textContent='UTC · '+formatDate(new Date(),{timeZone:'UTC',hour:'2-digit',minute:'2-digit'});
      if (!$('signal-toast').hidden && snapshot) showToast(t(snapshot.signal==='BUY'?'signal.buy':snapshot.signal==='SELL'?'signal.sell':'signal.wait'));
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize);
  else initialize();
})();
