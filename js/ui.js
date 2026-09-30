// Fledermauskolonie – Anzeige, Eingaben, Speichern und Spielschleife.
(() => {
  const E = Engine, D = DATA;
  const KEY = 'fledermauskolonie', THEME_KEY = 'fledermauskolonie-theme';
  const RES = Object.fromEntries(D.resources.map(r => [r.id, r]));
  const $ = id => document.getElementById(id);

  // ---------- Zahlen und Texte ----------

  const nf = digits => new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits });
  const N0 = nf(0), N1 = nf(1), N2 = nf(2), NF = [N0, N1, N2];
  const up = x => Math.ceil(x - 1e-9), down = x => Math.floor(x + 1e-9);

  // Deutsche Kurzform. round: Math.round, up (Preise) oder down (Bestand), damit ein Bestand
  // nie genauso aussieht wie ein Preis, für den doch noch etwas fehlt.
  function fmt(n, round = Math.round) {
    const a = Math.abs(n);
    const [div, unit, digits] = a >= 1e9 ? [1e9, ' Mrd.', 2] : a >= 1e6 ? [1e6, ' Mio.', 2]
      : a >= 1e4 ? [1e3, ' Tsd.', 1] : a >= 100 ? [1, '', 0] : [1, '', 1];
    const f = 10 ** digits;
    return NF[digits].format(round(n / div * f) / f) + unit;
  }
  function fmtRate(r) {
    const a = Math.abs(r);
    return (r < 0 ? '−' : '+') + (a >= 100 ? fmt(a) : (a < 1 ? N2 : N1).format(a)) + '/s';
  }
  function fmtTime(sec) {
    if (sec < 60) return Math.ceil(sec) + ' s';
    if (sec < 3600) return Math.round(sec / 60) + ' Min.';
    if (sec < 86400) return N1.format(sec / 3600) + ' Std.';
    const d = N1.format(sec / 86400);
    return d + (d === '1' ? ' Tag' : ' Tage');
  }
  const amount = (id, v, round) => { const n = fmt(v, round); return `${n} ${n === '1' ? RES[id].one : RES[id].name}`; };

  function effectText(key, v) {
    const [id, kind] = key.split('.');
    if (id === 'bats') return `+${fmt(v)} Plätze`;
    if (kind === 'night') return `+${N2.format(v)} ${RES[id].name}/s nachts`;
    if (kind === 'cap') return `Lager ${RES[id].name} +${fmt(v)}`;
    return `${RES[id].name} +${Math.round(v * 100)} %`;
  }
  const costHtml = cost => Object.entries(cost)
    .map(([id, v]) => `<span${S.res[id] < v - 1e-9 ? ' class="miss"' : ''}>${amount(id, v, up)}</span>`)
    .join(' · ');

  // Nur schreiben, wenn sich etwas ändert: schont Fokus, Auswahl und Akku.
  function text(el, t) { if (el._t !== t) { el.textContent = t; el._t = t; } }
  function html(el, h) { if (el._h !== h) { el.innerHTML = h; el._h = h; } }

  // ---------- Karten und Reiter ----------

  function card(onBuy, infoFor) {
    const el = document.createElement('div');
    el.className = 'card';
    const buy = document.createElement('button');
    buy.className = 'buy';
    buy.innerHTML = '<span class="name"></span><span class="sub"></span>';
    buy.addEventListener('click', () => { if (onBuy()) render(); });
    el.append(buy);
    if (infoFor) {
      const b = document.createElement('button');
      b.className = 'info';
      b.textContent = 'i';
      b.setAttribute('aria-label', 'Info zu ' + infoFor.item.name);
      b.addEventListener('click', () => openInfo(infoFor.kind, infoFor.item));
      el.append(b);
    }
    return { el, buy, name: buy.firstChild, sub: buy.lastChild };
  }

  function colonyItems() {
    const items = D.clicks.map(c => ({
      key: 'click:' + c.id,
      make: () => {
        const k = card(() => E.click(S, c.id));
        k.el.classList.add('click');
        k.name.textContent = c.name;
        k.sub.textContent = '+1 ' + RES[c.id].one;
        return k;
      },
      update: k => { k.buy.disabled = S.res[c.id] >= E.cap(S, c.id); },
    }));
    for (const b of D.buildings) {
      if (!E.isUnlocked(S, b)) continue;
      items.push({
        key: 'bld:' + b.id,
        make: () => card(() => E.build(S, b.id), { kind: 'building', item: b }),
        update: k => {
          const cost = E.price(S, 'building', b.id);
          text(k.name, `${b.name} (${S.bld[b.id]})`);
          html(k.sub, costHtml(cost));
          k.buy.disabled = !E.canAfford(S, cost);
        },
      });
    }
    return items;
  }

  function batItems() {
    const items = [{
      key: 'summary',
      make: () => { const el = document.createElement('div'); el.className = 'summary'; return { el }; },
      update: k => html(k.el,
        `<p>Fledermäuse <b>${S.bats} / ${E.batCap(S)}</b> · frei <b>${E.free(S)}</b></p>` +
        `<p>Zufriedenheit <b>${Math.round(E.happiness(S) * 100)} %</b>` +
        `${S.isHungry ? ' · <span class="miss">hungrig</span>' : ''}</p>` +
        `<p class="muted hint">${E.arrivalBlock(S) === 'food' ? 'Für Neue fehlen Früchte.' : ''}</p>`),
    }];
    for (const j of D.jobs) {
      if (!E.isUnlocked(S, j)) continue;
      items.push({
        key: 'job:' + j.id,
        make: () => {
          const el = document.createElement('div');
          el.className = 'job';
          el.innerHTML = '<div class="job-text"><span class="name"></span><span class="sub"></span></div>' +
            `<button class="step" type="button" aria-label="${j.name} weniger">−</button>` +
            `<button class="step" type="button" aria-label="${j.name} mehr">+</button>`;
          const [minus, plus] = el.querySelectorAll('.step');
          minus.addEventListener('click', () => { if (E.assign(S, j.id, -1)) render(); });
          plus.addEventListener('click', () => { if (E.assign(S, j.id, 1)) render(); });
          el.querySelector('.sub').textContent =
            Object.entries(j.effects).map(([key, v]) => effectText(key, v)).join(', ') + ' je Fledermaus';
          return { el, minus, plus, name: el.querySelector('.name') };
        },
        update: k => {
          text(k.name, `${j.name}: ${S.jobs[j.id]}`);
          k.minus.disabled = S.jobs[j.id] < 1;
          k.plus.disabled = E.free(S) < 1;
        },
      });
    }
    return items;
  }

  function researchItems() {
    return D.techs.filter(t => E.isUnlocked(S, t)).map(t => ({
      key: 'tech:' + t.id,
      make: () => {
        const k = card(() => E.research(S, t.id), { kind: 'tech', item: t });
        k.name.textContent = t.name;
        return k;
      },
      update: k => {
        const done = !!S.tech[t.id];
        html(k.sub, done ? 'erforscht' : costHtml(t.cost));
        k.buy.disabled = done || !E.canAfford(S, t.cost);
      },
    }));
  }

  const TABS = [
    { id: 'colony', name: 'Kolonie', show: () => true, items: colonyItems },
    { id: 'bats', name: 'Fledermäuse', show: () => S.seen.bats, items: batItems, badge: () => E.free(S) > 0 },
    { id: 'research', name: 'Forschung', show: () => S.seen.dreams, items: researchItems,
      badge: () => D.techs.some(t => E.isUnlocked(S, t) && !S.tech[t.id] && E.canAfford(S, t.cost)) },
  ];

  // ---------- Zeichnen ----------

  let tab = 'colony', rendered = new Map(), logShown = -1, logOpen = false, info = null, saveWarned = false, awaySum = null;

  function render() {
    renderClock();
    renderRes();
    renderTabs();
    renderPanel();
    renderLog();
    renderInfo();
  }

  function renderClock() {
    const c = E.calendar(S), cal = S.tech.mooncalendar;
    text($('clock-1'), `${c.night ? 'Nacht' : 'Tagschlaf'} · noch ${Math.ceil(c.phaseLeft)} s` + (cal ? ` · ${c.moon}` : ''));
    html($('clock-2'), [cal ? `Jahr ${c.year} · ${c.season} · Tag ${c.dayOfSeason}` : '',
      S.isHungry ? '<span class="miss">hungrig</span>' : ''].filter(Boolean).join(' · '));
  }

  function renderRes() {
    const list = $('res-list'), r = E.rates(S);
    for (const res of D.resources) {
      if (!E.isUnlocked(S, res)) continue; // freigeschaltet = sichtbar, auch bei 0: nichts rutscht beim ersten Tippen
      let row = list.querySelector(`[data-res="${res.id}"]`);
      if (!row) {
        row = document.createElement('div');
        row.className = 'res-row';
        row.dataset.res = res.id;
        row.innerHTML = `<span>${res.name}</span><span class="rv"></span><span class="rr"></span>`;
        list.append(row);
      }
      const c = E.cap(S, res.id), rate = r[res.id];
      text(row.children[1], `${fmt(S.res[res.id], down)} / ${fmt(c)}`);
      text(row.children[2], Math.abs(rate) > 1e-9 ? fmtRate(rate) : '');
      row.classList.toggle('full', S.res[res.id] >= c - 1e-9);
      row.children[2].classList.toggle('miss', rate < -1e-9);
    }
  }

  function renderTabs() {
    const nav = $('tabs');
    for (const t of TABS) {
      if (!t.show()) continue;
      let b = nav.querySelector(`[data-tab="${t.id}"]`);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.dataset.tab = t.id;
        b.setAttribute('role', 'tab');
        b.innerHTML = t.name + (t.badge ? '<span class="dot" aria-hidden="true"></span>' : '');
        b.addEventListener('click', () => switchTab(t.id));
        nav.append(b);
      }
      b.setAttribute('aria-selected', String(t.id === tab));
      if (t.badge) text(b.lastChild, t.badge() ? '•' : '');
    }
  }

  function switchTab(id) {
    tab = id;
    rendered = new Map();
    $('panel').replaceChildren();
    render();
  }

  function renderPanel() {
    for (const item of TABS.find(t => t.id === tab).items()) {
      let k = rendered.get(item.key);
      if (!k) {
        k = item.make();
        rendered.set(item.key, k);
        $('panel').append(k.el); // Neues kommt immer ans Ende, damit nichts verrutscht
      }
      item.update(k);
    }
  }

  function renderLog() {
    if (S.logSeq === logShown) return;
    logShown = S.logSeq;
    const lines = S.log.slice(logOpen ? 0 : -4).reverse();
    $('log-list').replaceChildren(...lines.map(l => {
      const p = document.createElement('p');
      p.textContent = l.text;
      return p;
    }));
  }

  // ---------- Info ----------

  function openInfo(kind, item) {
    info = { kind, item };
    $('info-title').textContent = item.name;
    $('info-desc').textContent = item.desc;
    $('info').showModal();
    renderInfo();
  }

  function renderInfo() {
    if (!info || !$('info').open) return;
    const { kind, item } = info;
    if (kind === 'building') {
      text($('info-effects'), 'Wirkung: ' + Object.entries(item.effects).map(([k, v]) => effectText(k, v)).join(', '));
    } else {
      const opens = [...D.buildings, ...D.jobs, ...D.techs].filter(x => E.needs(x).includes(item.id)).map(x => x.name);
      text($('info-effects'), 'Schaltet frei: ' + [item.unlockText, ...opens].filter(Boolean).join(', '));
    }
    const done = kind === 'tech' && S.tech[item.id];
    html($('info-cost'), done ? '<p>Erforscht</p>'
      : costDetail(kind === 'tech' ? item.cost : E.price(S, 'building', item.id)));
  }

  function costDetail(cost) {
    const rows = Object.entries(cost).map(([id, v]) => {
      const miss = S.res[id] < v - 1e-9, small = v > E.cap(S, id);
      return `<p${miss ? ' class="miss"' : ''}>${RES[id].name}: ${fmt(Math.min(S.res[id], v), down)} / ${fmt(v, up)}` +
        `${small ? ' · Lager zu klein' : ''}</p>`;
    });
    const t = E.eta(S, cost);
    const when = E.canAfford(S, cost) ? 'Bezahlbar'
      : t === Infinity ? 'So noch nicht bezahlbar' : `Bezahlbar in ca. ${fmtTime(t)}`;
    return rows.join('') + `<p class="muted">${when}</p>`;
  }

  // ---------- Abwesenheit ----------

  function showAway(sum) {
    if (awaySum && $('away').open) { // Fenster ist schon offen: zusammenzählen statt ersetzen
      const res = { ...awaySum.res };
      for (const id in sum.res) res[id] = (res[id] || 0) + sum.res[id];
      sum = { seconds: awaySum.seconds + sum.seconds, bats: awaySum.bats + sum.bats, res };
    }
    awaySum = sum;
    const lines = [];
    if (sum.bats) {
      const n = Math.abs(sum.bats);
      lines.push(`${sum.bats > 0 ? '+' : '−'}${n} ${n === 1 ? 'Fledermaus' : 'Fledermäuse'}`);
    }
    for (const r of D.resources) {
      const v = sum.res[r.id];
      if (Math.abs(v) >= 0.5) lines.push(`${v > 0 ? '+' : '−'}${amount(r.id, Math.abs(v))}`);
    }
    $('away-time').textContent = fmtTime(sum.seconds);
    $('away-list').replaceChildren(...(lines.length ? lines : ['Alles blieb ruhig.']).map(t => {
      const li = document.createElement('li');
      li.textContent = t;
      return li;
    }));
    if (!$('away').open) $('away').showModal();
  }

  // ---------- Speichern ----------

  function saveNow() {
    S.savedAt = Date.now();
    try {
      localStorage.setItem(KEY, E.save(S));
    } catch {
      if (!saveWarned) {
        saveWarned = true;
        E.log(S, 'Speichern klappt hier nicht. Nutze im Menü „Exportieren“.');
      }
    }
  }

  const toB64 = str => {
    let bin = '';
    for (const byte of new TextEncoder().encode(str)) bin += String.fromCharCode(byte);
    return btoa(bin);
  };
  // Vor Import oder Neustart den alten Stand beiseitelegen.
  const backup = () => { try { localStorage.setItem(KEY + '-vorher', E.save(S)); } catch { /* Sicherung ist nur ein Extra */ } };
  const fromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.trim()), ch => ch.charCodeAt(0)));

  function boot() {
    const extra = Number(new URLSearchParams(location.search).get('vorspulen')) || 0; // Testhilfe: Sekunden vorspulen
    let raw = null, s = null;
    try { raw = localStorage.getItem(KEY); } catch { /* kein Speicher: frisches Spiel */ }
    if (raw) {
      try {
        s = E.load(raw);
      } catch {
        try { localStorage.setItem(KEY + '-kaputt', raw); } catch { /* Hinweis kommt trotzdem */ }
        s = E.create();
        E.log(s, 'Der alte Spielstand war kaputt und liegt jetzt beiseite.');
      }
    }
    s ||= E.create();
    const away = (s.savedAt ? (Date.now() - s.savedAt) / 1000 : 0) + extra;
    return { s, sum: away > 5 ? E.simulate(s, away) : null };
  }

  // ---------- Menü ----------

  function applyTheme(v) {
    if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v;
    else delete document.documentElement.dataset.theme;
  }
  const msg = t => { $('save-msg').textContent = t; };

  function rebuild() {
    for (const id of ['res-list', 'tabs', 'panel']) $(id).replaceChildren();
    tab = 'colony';
    rendered = new Map();
    logShown = -1;
    render();
  }

  function wire() {
    let theme = 'auto';
    try { theme = localStorage.getItem(THEME_KEY) || 'auto'; } catch { /* Standard bleibt */ }
    applyTheme(theme);
    $('theme').value = theme;
    $('theme').addEventListener('change', e => {
      applyTheme(e.target.value);
      try { localStorage.setItem(THEME_KEY, e.target.value); } catch { /* gilt dann nur jetzt */ }
    });

    $('menu-btn').addEventListener('click', () => { msg(''); $('menu').showModal(); });
    $('export').addEventListener('click', () => {
      const t = $('save-text');
      t.value = toB64(E.save(S));
      t.select();
      if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(() => msg('Kopiert.'), () => msg('Markiert, bitte kopieren.'));
      else msg('Markiert, bitte kopieren.');
    });
    $('import').addEventListener('click', () => {
      let s;
      try { s = E.load(fromB64($('save-text').value)); } catch { msg('Das ist kein gültiger Spielstand.'); return; }
      backup();
      S = s;
      saveNow();
      rebuild();
      $('menu').close();
    });
    $('reset').addEventListener('click', () => {
      if (!confirm('Wirklich alles löschen und neu beginnen?')) return;
      backup();
      S = E.create();
      saveNow();
      rebuild();
      $('menu').close();
    });

    $('res-toggle').addEventListener('click', () => {
      const open = $('res-toggle').getAttribute('aria-expanded') !== 'true';
      $('res-toggle').setAttribute('aria-expanded', String(open));
      $('res-list').hidden = !open;
    });
    $('log-more').addEventListener('click', () => {
      logOpen = !logOpen;
      $('log-more').textContent = logOpen ? 'Weniger' : 'Mehr';
      logShown = -1;
      renderLog();
    });
    for (const d of document.querySelectorAll('dialog')) {
      let fromBackdrop = false; // nur schließen, wenn Druck und Loslassen beide außerhalb liegen
      d.addEventListener('pointerdown', e => { fromBackdrop = e.target === d; });
      d.addEventListener('click', e => { if (fromBackdrop && e.target === d) d.close(); });
    }
    $('info').addEventListener('close', () => { info = null; });
    $('away').addEventListener('close', () => { awaySum = null; });
  }

  // ---------- Start ----------

  const booted = boot();
  let S = booted.s;
  wire();
  render();
  if (booted.sum && booted.sum.seconds >= 60) showAway(booted.sum);

  // Zeit nachholen; große Lücken (Standby, gedrosselter Hintergrund-Tab) laufen über simulate().
  const snapshot = () => ({ at: Date.now(), bats: S.bats, res: { ...S.res } });
  let last = Date.now(), hiddenAt = document.hidden ? snapshot() : null; // der Tab kann schon versteckt laden
  function advance() {
    const now = Date.now(), dt = Math.max(0, (now - last) / 1000);
    last = now;
    if (dt <= 5) { E.step(S, dt); return null; }
    return E.simulate(S, dt);
  }
  setInterval(() => {
    const sum = advance();
    if (sum && sum.seconds >= 60 && !hiddenAt) showAway(sum); // z. B. Laptop im Standby ohne Tab-Wechsel
    render();
  }, 200);
  setInterval(saveNow, 30000);
  // Versteckt: Stand merken. Wieder sichtbar: alles seitdem als eine Zusammenfassung.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saveNow();
      hiddenAt = snapshot();
      return;
    }
    advance();
    const away = hiddenAt;
    hiddenAt = null;
    const seconds = away ? Math.min((Date.now() - away.at) / 1000, D.rules.offlineMax) : 0;
    if (seconds >= 60) {
      const res = {};
      for (const id in S.res) res[id] = S.res[id] - away.res[id];
      showAway({ seconds, bats: S.bats - away.bats, res });
    }
    render();
  });
  addEventListener('pagehide', saveNow);
  // Homescreen und offline: nur über http(s), nicht als geöffnete Datei
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
