/* When buy: worker para interacción con notificaciones locales mientras la web está abierta.
 * No implementa Push API: sin emisor externo no hay Web Push tras cerrar el sitio. */
'use strict';
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const interval=['1h','4h','1d','1w'].includes(event.notification.data?.interval)
    ?event.notification.data.interval:'4h';
  const asset=event.notification.data?.symbol;
  const symbol=typeof asset==='string' && /^[A-Z0-9]{2,30}$/.test(asset)?asset:null;
  const query=new URLSearchParams({interval,...(symbol?{symbol}:{})});
  const target=new URL('./?'+query.toString()+'#senal',self.registration.scope).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
    for(const client of windows) {
      if(client.url.startsWith(self.registration.scope) && 'focus' in client) {
        await client.focus();return client.navigate(target);
      }
    }
    if(clients.openWindow)return clients.openWindow(target);
  }));
});
