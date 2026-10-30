import { enrichAnalysis, isContextEnabled } from './market-context.js';
/**
 * Suscripciones LOCALES: la web estática no dispone de un servidor que emita Web Push.
 * El monitoreo funciona mientras la pestaña permanezca abierta (puede estar en segundo plano).
 * Se mantiene el mismo motor de alertas: avisar SOLO ante señal NUEVA tras vela NUEVA.
 */
import { getAnalysis } from './market.js';
import {getSelectedAsset,assetName} from './assets.js';
import { t } from './i18n.js';
(() => {
  'use strict';
  const TERMS = '2026-10-multi', TERMS_KEY = 'atlas.terms.version';
  const ALERTS_KEY = 'atlas.native.alerts.v1';
  const $ = id => document.getElementById(id);
  const INTERVALS = ['1h','4h','1d','1w'];
  let busy = false, subscribed = false, lastCheck = 0, workerRegistration = null;
  let preferences = null;

  const accepted = () => {try {return localStorage.getItem(TERMS_KEY) === TERMS;}catch(_){return false;}};
  function readPreferences() {
    try {
      const data=JSON.parse(localStorage.getItem(ALERTS_KEY) || 'null');
      if (data && INTERVALS.includes(data.interval) && typeof data.buy === 'boolean' && typeof data.sell === 'boolean') return {...data, symbol:data.symbol || 'BTCUSDT',base:data.base||'BTC',quote:data.quote||'USDT',name:data.name||assetName(data.base||'BTC')};
    } catch(_){/* almacenamiento bloqueado o dato corrupto */}
    return null;
  }
  function savePreferences(data) {
    localStorage.setItem(ALERTS_KEY,JSON.stringify(data));
    preferences=data;
  }
  function showTerms() {
    document.documentElement.classList.remove('terms-accepted');
    $('terms-modal').removeAttribute('hidden');
    document.body.style.overflow='hidden';
    document.querySelector('.app-frame').inert=true;
    $('terms-checkbox').checked=false;
    $('terms-accept').disabled=true;
    $('terms-decline-text').hidden=true;
    $('terms-checkbox').focus();
  }
  function acceptTerms() {
    if (!$('terms-checkbox').checked) return;
    try {localStorage.setItem(TERMS_KEY,TERMS);} catch(_) {
      $('terms-decline-text').hidden=false;
      $('terms-decline-text').textContent=t('terms.storageBlocked');
      return;
    }
    document.documentElement.classList.add('terms-accepted');
    document.body.style.overflow='';
    document.querySelector('.app-frame').inert=false;
    refreshSubscription();
  }
  function feedback(message,type='') {
    $('push-feedback').className='notify-feedback '+type;
    $('push-feedback').textContent=message;
  }
  function state(message,active=false,error=false) {
    $('push-state').className='notify-state '+(active?'active':error?'error':'');
    $('push-state-text').textContent=message;
  }
  function updateButtons() {
    const canUse = supportsNotifications() && Notification.permission !== 'denied';
    $('push-subscribe').disabled=busy || !canUse;
    $('push-subscribe').textContent=t(busy?'notify.working':subscribed?'notify.save':'notify.activate');
    $('push-unsubscribe').hidden=!subscribed || busy;
    for (const key of ['push-interval','push-buy','push-sell']) $(key).disabled=busy;
  }
  function supportsNotifications() {return window.isSecureContext && 'Notification' in window;}
  function showMonitoredAsset() {
    const target=$('push-asset-name');
    if(target) target.textContent=preferences?t('assets.alertMarket',{pair:preferences.symbol}):t('assets.alertNewMarket',{pair:getSelectedAsset().symbol});
  }
  function refreshSubscription() {
    if (!accepted()) return;
    preferences=readPreferences();
    subscribed=!!preferences;
    if (preferences) {
      $('push-interval').value=preferences.interval;
      $('push-buy').checked=preferences.buy;
      $('push-sell').checked=preferences.sell;
    }
    if (!supportsNotifications()) {
      state(t('notify.unavailable'),false,true);
      feedback(t('notify.httpsRequired'),'error');
    } else if (Notification.permission === 'denied') {
      state(t('notify.denied'),false,true);
      feedback(t('notify.deniedHint'),'error');
    } else {
      state(t(subscribed?'notify.active':'notify.off'),subscribed);
      feedback(t(subscribed?'notify.configured':'notify.explanation'), subscribed?'success':'');
    }
    updateButtons();showMonitoredAsset();
  }
  async function registration() {
    if (workerRegistration) return workerRegistration;
    if (!('serviceWorker' in navigator)) return null;
    try {workerRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});return workerRegistration;}
    catch(_){return null;}
  }
  async function subscribe() {
    if (!accepted()) return showTerms();
    if (!supportsNotifications() || busy) return;
    if (!$('push-buy').checked && !$('push-sell').checked) {
      feedback(t('notify.missingType'),'error');return;
    }
    busy=true;updateButtons();
    try {
      // Necesita un gesto explícito: nunca pedir permisos automáticamente.
      if (Notification.permission !== 'granted') {
        const permission=await Notification.requestPermission();
        if (permission !== 'granted') throw new Error(t('notify.permissionRejected'));
      }
      const interval=$('push-interval').value;
      const previous=readPreferences();
      const asset=getSelectedAsset();
      const changingInterval=previous?.interval!==interval || previous?.symbol!==asset.symbol;
      const next={interval,symbol:asset.symbol,base:asset.base,quote:asset.quote,name:asset.name,buy:$('push-buy').checked,sell:$('push-sell').checked,
        lastSignal:changingInterval?null:(previous?.lastSignal??null),
        lastCandleAt:changingInterval?null:(previous?.lastCandleAt??null)};
      // Baseline: al activarse NO avisar por una señal anterior a la suscripción.
      if (changingInterval || next.lastCandleAt===null) {
        const current=await enrichAnalysis(await getAnalysis(interval,{symbol:asset.symbol}),{asset});
        next.lastSignal=current.signal;
        next.lastCandleAt=Date.parse(current.candleTime);
      }
      savePreferences(next);
      subscribed=true;
      await registration();
      state(t('notify.active'),true);
      feedback(t('notify.saved'),'success');showMonitoredAsset();
    } catch(e) {
      state(t('notify.failed'),false,true);
      feedback(e instanceof Error?e.message:t('error.unknown'),'error');
    } finally {busy=false;updateButtons();}
  }
  function unsubscribe() {
    if (busy) return;
    try {localStorage.removeItem(ALERTS_KEY);} catch(e){feedback(t('notify.deleteFailed',{reason:e.message}),'error');return;}
    preferences=null;subscribed=false;
    state(t('notify.off'));
    feedback(t('notify.deleted'),'success');
    updateButtons();showMonitoredAsset();
  }
  async function notify(d) {
    if (Notification.permission!=='granted') return;
    const title=t('assets.alertTitle',{signal:t(d.signal==='BUY'?'signal.buy':'signal.sell'),symbol:preferences?.base||getSelectedAsset().base});
    const body=t('assets.alertBody',{interval:d.interval.toUpperCase(),price:d.candleClose.toLocaleString('en-US',{maximumFractionDigits:8}),quote:preferences?.quote||'USDT',confluence:d.confluence});
    try {
      const worker=await registration();
      if (worker && typeof worker.showNotification==='function') {
        await worker.showNotification(title,{body,icon:'./favicon.svg',badge:'./favicon.svg',
          tag:`atlas-${d.symbol}-${d.interval}-${Date.parse(d.candleTime)}-${d.signal}`,renotify:false,
          data:{interval:d.interval,symbol:d.symbol}});
      } else {
        const notice=new Notification(title,{body,icon:'./favicon.svg',tag:`atlas-${d.symbol}-${d.interval}-${Date.parse(d.candleTime)}-${d.signal}`});
        notice.onclick=()=>{window.focus();location.hash='senal';notice.close();};
      }
    } catch(e) {feedback(t('notify.displayFailed',{reason:e.message}),'error');}
  }
  async function processSnapshot(d) {
    if (!accepted() || !subscribed || !preferences || (d.interval!==preferences.interval || d.symbol!==preferences.symbol)) return;
    // Lock API serializa el control de vela entre pestañas del mismo origen, si existe.
    const scan = async () => {
      const current=readPreferences();
      if (!current || current.interval!==d.interval || current.symbol!==d.symbol) return;
      const candle=Date.parse(d.candleTime);
      if (!Number.isFinite(candle)) return;
      if (current.lastCandleAt===null || current.lastSignal===null) {
        savePreferences({...current,lastCandleAt:candle,lastSignal:d.signal});return;
      }
      if (candle<=current.lastCandleAt) return;
      const changed=current.lastSignal!==d.signal;
      const enabled=(d.signal==='BUY' && current.buy) || (d.signal==='SELL' && current.sell);
      // Registrar antes de mostrar, así una re-evaluación no dispara el mismo aviso.
      savePreferences({...current,lastCandleAt:candle,lastSignal:d.signal});
      if (changed && enabled) await notify(d);
    };
    if (navigator.locks?.request) return navigator.locks.request('atlas.native.alerts',scan);
    return scan();
  }
  async function poll() {
    if (!subscribed || !accepted() || busy) return;
    // Aunque la temporalidad del dashboard sea distinta, evaluar la temporalidad suscrita.
    try {const asset={base:preferences.base,quote:preferences.quote,symbol:preferences.symbol,name:preferences.name};const current=await enrichAnalysis(await getAnalysis(preferences.interval,{symbol:asset.symbol}),{asset});await processSnapshot(current);}
    catch(_) { /* No se emiten avisos si los datos fallan o están desactualizados. */ }
  }
  function initialize() {
    $('terms-checkbox').addEventListener('change',()=>{$('terms-accept').disabled=!$('terms-checkbox').checked;});
    $('terms-accept').addEventListener('click',acceptTerms);
    $('terms-decline').addEventListener('click',()=>{
      $('terms-decline-text').textContent=t('terms.declined');
      $('terms-decline-text').hidden=false;
    });
    $('reopen-terms').addEventListener('click',showTerms);
    $('push-subscribe').addEventListener('click',subscribe);
    $('push-unsubscribe').addEventListener('click',unsubscribe);
    document.addEventListener('atlas:analysis',event=>{void processSnapshot(event.detail);});
    document.addEventListener('atlas:assetchange',showMonitoredAsset);
    document.addEventListener('atlas:contextchange',()=>{
      // Cambiar el algoritmo no debe emitir una alerta retroactiva: reiniciar baseline.
      const current=readPreferences();
      if (current) {try{savePreferences({...current,lastSignal:null,lastCandleAt:null});}catch(_){/* almacenamiento bloqueado */}}
    });
    document.addEventListener('keydown',event=>{
      if (document.documentElement.classList.contains('terms-accepted') || event.key!=='Tab')return;
      const elements=[...$('terms-modal').querySelectorAll('input:not(:disabled), button:not(:disabled)')];
      if(elements.length<2)return;
      const first=elements[0],last=elements.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    });
    window.addEventListener('storage',event=>{if(event.key===ALERTS_KEY)refreshSubscription();});
    document.addEventListener('atlas:languagechange',()=>{
      if(accepted()) refreshSubscription();
      else if(!$('terms-decline-text').hidden) $('terms-decline-text').textContent=t('terms.declined');
      updateButtons();showMonitoredAsset();
    });
    if(!accepted())showTerms(); else refreshSubscription();
    // Alertas: también intentar en pestañas ocultas. El navegador puede suspenderlas.
    setInterval(()=>{void poll();},60_000);
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden && Date.now()-lastCheck>60_000){lastCheck=Date.now();void poll();}
    });
    if(subscribed)void poll();
  }
  if (document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
  else initialize();
})();
