/* Canal de communication entre la page principale et la page régie (même navigateur). */
(function () {
  'use strict';
  const BPS = (window.BPS = window.BPS || {});
  const NAME = 'barco-power-solutions';
  const KEY = 'bps-bus';
  const handlers = [];
  const me = Math.random().toString(36).slice(2);
  let bc = null;
  try { bc = new BroadcastChannel(NAME); bc.onmessage = (e) => dispatch(e.data); } catch (e) { bc = null; }
  if (!bc) {
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY || !e.newValue) return;
      try { dispatch(JSON.parse(e.newValue)); } catch (err) { /* message illisible */ }
    });
  }
  function dispatch(msg) {
    if (!msg || msg.from === me) return;
    handlers.forEach((h) => { try { h(msg); } catch (err) { console.error(err); } });
  }
  BPS.bus = {
    send(type, payload) {
      const msg = { type, payload, from: me, at: Date.now() };
      if (bc) bc.postMessage(msg);
      else { try { localStorage.setItem(KEY, JSON.stringify(msg)); } catch (e) { /* stockage indisponible */ } }
    },
    on(fn) { handlers.push(fn); },
  };
})();
