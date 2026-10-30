/** Selector de monedas accesible, con destacados y catálogo completo bajo demanda. */
import {getAssetCatalog, getSelectedAsset, selectAsset, FEATURED, DEFAULT_ASSET} from './assets.js';
import {t} from './i18n.js?v=20261030-compact26';
const $ = id=>document.getElementById(id);
let assets = [DEFAULT_ASSET], openedAll=false, shown=80, query='', available=false;
const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
const normalize = value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function open() {
  $('asset-picker-panel').hidden=false;
  $('asset-picker-trigger').setAttribute('aria-expanded','true');
}
function close() {
  $('asset-picker-panel').hidden=true;
  $('asset-picker-trigger').setAttribute('aria-expanded','false');
  openedAll=false;query='';shown=80;
  $('asset-search').value='';$('asset-all-area').hidden=true;
  $('asset-featured-header').hidden=false;$('asset-featured-list').hidden=false;
  $('asset-see-all').querySelector('span').textContent=t('assets.all');
}
function makeOption(asset) {
  const active=asset.symbol===getSelectedAsset().symbol;
  const b=document.createElement('button');b.type='button';b.className='asset-option'+(active?' active':'');
  b.setAttribute('aria-label',`${asset.name}, ${asset.base}/${asset.quote}`);
  if (active) b.setAttribute('aria-current','true');
  const icon=document.createElement('span');icon.className='asset-option-icon'+(asset.base==='BTC'?' bitcoin':'');
  icon.textContent=asset.base==='BTC'?'₿':asset.base.slice(0,2);
  const copy=document.createElement('span');copy.className='asset-option-copy';
  const name=document.createElement('span');name.className='asset-option-name';name.textContent=asset.name;
  const pair=document.createElement('span');pair.className='asset-option-pair';pair.textContent=`${asset.base} / ${asset.quote}`;
  copy.append(name,pair);b.append(icon,copy);
  if (active) {const tick=document.createElement('span');tick.className='asset-option-check';tick.textContent='✓';b.append(tick);}
  b.addEventListener('click',()=>{selectAsset(asset);close();});
  return b;
}
function renderFeatured() {
  const list=$('asset-featured-list');list.replaceChildren();
  const group=FEATURED.map(base=>assets.find(a=>a.base===base)).filter(Boolean);
  for (const asset of group) list.append(makeOption(asset));
  $('asset-featured-header').textContent=t('assets.featured');
}
function matches(asset,needle) {
  return normalize(asset.name).includes(needle) || normalize(asset.base).includes(needle)
    || normalize(asset.quote).includes(needle) || normalize(asset.symbol).includes(needle);
}
function renderAll() {
  if (!openedAll) return;
  const list=$('asset-all-list');list.replaceChildren();
  const needle=normalize(query);
  const matched=needle?assets.filter(a=>matches(a,needle)):assets;
  const page=matched.slice(0,shown);
  for (const item of page) list.append(makeOption(item));
  if (!page.length) {const empty=document.createElement('p');empty.className='asset-picker-feedback';empty.textContent=t('assets.noResults');list.append(empty);}
  $('asset-results-summary').textContent=t('assets.count',{count:matched.length});
  $('asset-load-more').hidden=matched.length<=shown;
  $('asset-load-more').textContent=t('assets.more');
}
function refresh() {
  renderFeatured();renderAll();
  $('asset-picker-trigger').setAttribute('aria-label',t('assets.open'));
  $('asset-picker-feedback').textContent=!available?t('assets.offline'):'';
  $('asset-search').placeholder=t('assets.search');
}
async function loadCatalog() {
  $('asset-picker-feedback').textContent=t('assets.loading');
  try {
    const incoming=await getAssetCatalog();
    assets=[...incoming].sort((a,b)=>collator.compare(a.name,b.name));
    const wanted=new URLSearchParams(location.search).get('symbol');
    if(wanted && assets.some(a=>a.symbol===wanted)) selectAsset(assets.find(a=>a.symbol===wanted));
    available=true;
    // Un par guardado puede haber sido eliminado o suspendido: no emitir señales sobre él.
    const selected=getSelectedAsset();
    if (!assets.some(a=>a.symbol===selected.symbol)) {
      const replacement=assets.find(a=>a.base===selected.base) || assets.find(a=>a.symbol===DEFAULT_ASSET.symbol) || assets[0];
      if (replacement) selectAsset(replacement);
    }
  } catch(error) {available=false;console.warn('When buy asset catalog:',error.message);}
  refresh();
}
function init() {
  $('asset-picker-trigger').addEventListener('click',()=>{
    if($('asset-picker-panel').hidden){open();} else close();
  });
  $('asset-see-all').addEventListener('click',()=>{
    openedAll=!openedAll;
    $('asset-all-area').hidden=!openedAll;
    $('asset-featured-header').hidden=openedAll;
    $('asset-featured-list').hidden=openedAll;
    $('asset-see-all').querySelector('span').textContent=t(openedAll?'assets.featuredBack':'assets.all');
    shown=80;
    renderAll();
    if(openedAll) $('asset-search').focus();
  });
  $('asset-search').addEventListener('input',()=>{query=$('asset-search').value;shown=80;renderAll();});
  $('asset-load-more').addEventListener('click',()=>{shown+=80;renderAll();});
  document.addEventListener('click',event=>{if(!$('asset-picker-wrap').contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && !$('asset-picker-panel').hidden){close();$('asset-picker-trigger').focus();}});
  document.addEventListener('atlas:assetchange',refresh);
  document.addEventListener('atlas:languagechange',()=>{
    $('asset-see-all').querySelector('span').textContent=t(openedAll?'assets.featuredBack':'assets.all');
    refresh();
  });
  refresh();
  void loadCatalog();
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);else init();
