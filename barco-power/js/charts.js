/* Graphiques SVG légers (sans dépendance). */
(function () {
  'use strict';
  const BPS = (window.BPS = window.BPS || {});
  const fmtH = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

  function niceMax(v) {
    if (v <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /**
   * Graphique temporel : séries empilées (aires) + lignes (prévision, prix…).
   * opts: { t:[ms], series:[{label,color,values,stack?:true,dash?:true,area?:bool}], unit, yMax, nowT, tMax, fmt }
   */
  function timeChart(el, opts) {
    const W = Math.max(120, el.clientWidth), H = Math.max(80, el.clientHeight);
    const pl = opts.padLeft || 46, pr = 10, pt = 10, pb = 22;
    const t = opts.t, n = t.length;
    if (n < 2) { el.innerHTML = ''; return; }
    const t0 = t[0], t1 = opts.tMax || t[n - 1];
    const stackSeries = opts.series.filter((s) => s.stack);
    const lineSeries = opts.series.filter((s) => !s.stack);
    const cum = new Array(n).fill(0);
    const stacks = stackSeries.map((s) => { const lo = cum.slice(); s.values.forEach((v, i) => { cum[i] += v || 0; }); return { s, lo, hi: cum.slice() }; });
    let max = opts.yMax || 0;
    if (!opts.yMax) {
      cum.forEach((v) => { if (v > max) max = v; });
      lineSeries.forEach((s) => s.values.forEach((v) => { if (v > max) max = v; }));
      max = niceMax(max * 1.08);
    }
    const x = (tt) => pl + ((tt - t0) / (t1 - t0)) * (W - pl - pr);
    const y = (v) => pt + (1 - v / max) * (H - pt - pb);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4, yy = y(v);
      g += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" class="grid"/>`;
      g += `<text x="${pl - 6}" y="${yy + 3.5}" class="ax" text-anchor="end">${(opts.fmt || nf0.format)(v)}</text>`;
    }
    const span = t1 - t0, stepH = span > 30 * 3600e3 ? 6 : span > 10 * 3600e3 ? 3 : 1;
    const first = Math.ceil(t0 / (stepH * 3600e3)) * stepH * 3600e3;
    for (let tt = first; tt <= t1; tt += stepH * 3600e3) {
      const xx = x(tt);
      if (xx < pl + 14 || xx > W - pr - 14) continue;
      g += `<text x="${xx}" y="${H - 6}" class="ax" text-anchor="middle">${fmtH.format(new Date(tt)).replace(':00', ' h')}</text>`;
    }
    let paths = '';
    stacks.forEach(({ s, lo, hi }) => {
      let d = `M${x(t[0])},${y(hi[0])}`;
      for (let i = 1; i < n; i++) d += `L${x(t[i]).toFixed(1)},${y(hi[i]).toFixed(1)}`;
      for (let i = n - 1; i >= 0; i--) d += `L${x(t[i]).toFixed(1)},${y(lo[i]).toFixed(1)}`;
      paths += `<path d="${d}Z" style="fill:${s.color};fill-opacity:.28"/>`;
      let l = `M${x(t[0])},${y(hi[0])}`;
      for (let i = 1; i < n; i++) l += `L${x(t[i]).toFixed(1)},${y(hi[i]).toFixed(1)}`;
      paths += `<path d="${l}" style="fill:none;stroke:${s.color};stroke-width:1.6"/>`;
    });
    lineSeries.forEach((s) => {
      const tt = s.t || t;
      let l = '';
      s.values.forEach((v, i) => { if (v == null) return; l += `${l ? 'L' : 'M'}${x(tt[i]).toFixed(1)},${y(v).toFixed(1)}`; });
      if (s.area) paths += `<path d="${l}L${x(tt[tt.length - 1])},${y(0)}L${x(tt[0])},${y(0)}Z" style="fill:${s.color};fill-opacity:.14"/>`;
      paths += `<path d="${l}" style="fill:none;stroke:${s.color};stroke-width:${s.width || 1.5}${s.dash ? ';stroke-dasharray:4 4' : ''}"/>`;
    });
    if (opts.nowT && opts.nowT < t1) {
      const xx = x(opts.nowT);
      g += `<line x1="${xx}" x2="${xx}" y1="${pt}" y2="${H - pb}" class="now"/><text x="${xx + 4}" y="${pt + 9}" class="ax now-l">maintenant</text>`;
    }
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart">${g}${paths}<line class="hover-x" x1="0" x2="0" y1="${pt}" y2="${H - pb}" visibility="hidden"/></svg><div class="tip" hidden></div>`;
    if (opts.noHover) return;
    const svg = el.firstChild, tip = el.lastChild, hl = svg.querySelector('.hover-x');
    el.onmousemove = (e) => {
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left;
      if (mx < pl || mx > W - pr) { el.onmouseleave(); return; }
      const tt = t0 + ((mx - pl) / (W - pl - pr)) * (t1 - t0);
      let best = 0;
      for (let i = 0; i < n; i++) if (Math.abs(t[i] - tt) < Math.abs(t[best] - tt)) best = i;
      const rows = opts.series.map((s) => {
        const ts = s.t || t;
        let j = 0; for (let i = 0; i < ts.length; i++) if (Math.abs(ts[i] - tt) < Math.abs(ts[j] - tt)) j = i;
        const v = s.values[j];
        return v == null || Math.abs(ts[j] - tt) > 20 * 60e3 ? '' : `<div><i style="background:${s.color}"></i>${esc(s.label)}<b>${(opts.fmtTip || nf0.format)(v)} ${opts.unit || ''}</b></div>`;
      }).join('');
      hl.setAttribute('x1', mx); hl.setAttribute('x2', mx); hl.setAttribute('visibility', 'visible');
      tip.innerHTML = `<div class="tip-h">${fmtH.format(new Date(tt))}</div>${rows}`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = `${mx + 12 + tw > W ? mx - tw - 12 : mx + 12}px`;
      tip.style.top = '8px';
      void best;
    };
    el.onmouseleave = () => { hl.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  }

  /** Barres horizontales HTML. items: [{label, value, max?, color, right?}] */
  function hbars(el, items, opts = {}) {
    const max = opts.max || Math.max(1e-9, ...items.map((i) => i.max || i.value));
    el.innerHTML = items.map((i) => {
      const m = i.max || max;
      const pct = Math.max(0, Math.min(100, (i.value / m) * 100));
      return `<div class="hb"><div class="hb-l">${esc(i.label)}</div><div class="hb-track"><div class="hb-fill" style="width:${pct.toFixed(1)}%;background:${i.color}"></div>${i.mark != null ? `<div class="hb-mark" style="left:${Math.min(100, (i.mark / m) * 100)}%"></div>` : ''}</div><div class="hb-v">${i.right != null ? i.right : nf0.format(i.value)}</div></div>`;
    }).join('');
  }

  /** Colonnes empilées. labels: [], stacks: [{label,color,values}] */
  function columns(el, labels, stacks, opts = {}) {
    const W = Math.max(120, el.clientWidth), H = Math.max(80, el.clientHeight);
    const pl = 28, pr = 6, pt = 8, pb = 20;
    const tot = labels.map((_, i) => stacks.reduce((s, st) => s + (st.values[i] || 0), 0));
    const max = niceMax(Math.max(1, ...tot) * 1.1);
    const bw = (W - pl - pr) / labels.length;
    const y = (v) => pt + (1 - v / max) * (H - pt - pb);
    let g = '';
    for (let i = 0; i <= 3; i++) { const v = (max * i) / 3; g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 5}" y="${y(v) + 3.5}" class="ax" text-anchor="end">${nf0.format(v)}</text>`; }
    labels.forEach((lab, i) => {
      let acc = 0;
      const x0 = pl + i * bw + bw * 0.2, w = bw * 0.6;
      stacks.forEach((st) => {
        const v = st.values[i] || 0; if (!v) return;
        const ya = y(acc + v), yb = y(acc);
        g += `<rect x="${x0}" y="${ya}" width="${w}" height="${Math.max(0, yb - ya - 1)}" style="fill:${st.color}" rx="1.5"><title>${esc(st.label)} : ${v}</title></rect>`;
        acc += v;
      });
      g += `<text x="${x0 + w / 2}" y="${H - 6}" class="ax${opts.highlightLast && i === labels.length - 1 ? ' hl' : ''}" text-anchor="middle">${esc(lab)}</text>`;
    });
    el.innerHTML = `<svg width="${W}" height="${H}" class="chart">${g}</svg>`;
  }

  /** Anneau. items: [{label,value,color}] */
  function donut(el, items, center, sub) {
    const S = Math.min(el.clientWidth, el.clientHeight) || 140;
    const r = S / 2 - 6, w = Math.max(10, S * 0.11), c = S / 2;
    const tot = items.reduce((s, i) => s + i.value, 0) || 1;
    let a = -Math.PI / 2, g = `<circle cx="${c}" cy="${c}" r="${r - w / 2}" class="donut-bg" style="stroke-width:${w}"/>`;
    items.forEach((i) => {
      if (!i.value) return;
      const da = (i.value / tot) * Math.PI * 2;
      const gap = items.filter((x) => x.value).length > 1 ? 0.025 : 0;
      const a0 = a + gap, a1 = a + da - gap;
      const rr = r - w / 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      g += `<path d="M${c + rr * Math.cos(a0)},${c + rr * Math.sin(a0)} A${rr},${rr} 0 ${large} 1 ${c + rr * Math.cos(a1)},${c + rr * Math.sin(a1)}" style="fill:none;stroke:${i.color};stroke-width:${w}"><title>${esc(i.label)} : ${nf1.format(i.value)}</title></path>`;
      a += da;
    });
    g += `<text x="${c}" y="${c + 2}" text-anchor="middle" class="donut-c">${esc(center)}</text><text x="${c}" y="${c + 18}" text-anchor="middle" class="donut-s">${esc(sub || '')}</text>`;
    el.innerHTML = `<svg width="${S}" height="${S}" class="chart">${g}</svg>`;
  }

  function spark(values, color, w = 120, h = 28, max) {
    if (!values || values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
    const m = max || Math.max(1e-6, ...values);
    const x = (i) => (i / (values.length - 1)) * w, y = (v) => h - 2 - (v / m) * (h - 4);
    let d = '';
    values.forEach((v, i) => { d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
    return `<svg width="${w}" height="${h}" class="spark"><path d="${d}L${w},${h}L0,${h}Z" style="fill:${color};fill-opacity:.18"/><path d="${d}" style="fill:none;stroke:${color};stroke-width:1.4"/></svg>`;
  }

  BPS.charts = { timeChart, hbars, columns, donut, spark, niceMax, nf0, nf1, esc, fmtH };
})();
