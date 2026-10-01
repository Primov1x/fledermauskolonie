// Fledermauskolonie – Anzeige, Eingaben, Speichern und Spielschleife.
(() => {
  const E = Engine, D = DATA;
  const KEY = 'fledermauskolonie', THEME_KEY = 'fledermauskolonie-theme';
  const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
  const RES = byId(D.resources), BLD = byId(D.buildings), JOB = byId(D.jobs), PLACE = byId(D.places);
  const NB = byId(D.neighbors), BLESS = byId(D.blessings);
  const $ = id => document.getElementById(id);

  // ---------- Zahlen und Texte ----------

  const nf = digits => new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits });
  const N0 = nf(0), N1 = nf(1), N2 = nf(2), N3 = nf(3), NF = [N0, N1, N2];
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
    return (r < 0 ? '−' : '+') + (a >= 100 ? fmt(a) : (a < 0.1 ? N3 : a < 1 ? N2 : N1).format(a)) + '/s';
  }
  function fmtTime(sec) {
    if (sec < 60) return Math.ceil(sec) + ' s';
    if (sec < 3600) return Math.round(sec / 60) + ' Min.';
    if (sec < 86400) return N1.format(sec / 3600) + ' Std.';
    const d = N1.format(sec / 86400);
    return d + (d === '1' ? ' Tag' : ' Tage');
  }
  const amount = (id, v, round) => { const n = fmt(v, round); return `${n} ${n === '1' ? RES[id].one : RES[id].name}`; };

  // Wirkung als kurzer Text; ein unbekannter Schlüssel steht roh da, statt die Anzeige abstürzen zu lassen.
  function effectText(key, v) {
    const [id, kind] = key.split('.'), pct = `+${Math.round(v * 100)} %`;
    if (key === 'bats.cap') return `+${fmt(v)} Plätze`;
    if (key === 'babies.cap') return `+${fmt(v)} Babyplätze`;
    if (key === 'babies.bonus') return `Junge ${pct}`;
    if (key === 'happy.bonus') return `Zufriedenheit ${pct}`;
    if (key === 'craft.bonus') return `Ausbeute ${pct}`;
    if (key === 'cap.bonus') return `Alle Lager ${pct}`;
    if (key === 'work.bonus') return `Nachtarbeit ${pct}`;
    if (key === 'trade.bonus') return `Tausch ${pct}`;
    if (key === 'friend.bonus') return `Freundschaft ${pct}`;
    if (key === 'winter.hunger') return `Winterhunger −${Math.round(v * 100)} %`;
    if (key === 'research.discount') return `Forschung −${Math.round(v * 100)} %`;
    if (key === 'explore.discount') return `Erkundung −${Math.round(v * 100)} % Echo`;
    if (id === 'per' && RES[kind]) return `${RES[kind].name} wirken ${pct}`;
    if (key === 'bless.bonus') return `Segen ${pct}`;
    if (key === 'all.bonus') return `Alles ${pct}`;
    if (key === 'star.rate') return `Sternschnuppen ×${N1.format(1 + v)}`;
    if (key === 'star.auto') return `Auto-Fang ${pct}`;
    if (key === 'arrival.speed') return `Zuzug ×${N1.format(1 + v)}`;
    if (id === 'bld' && BLD[kind]) return `${BLD[kind].name} ${pct}`;
    if (id === 'job' && JOB[kind]) return `${JOB[kind].name} ${pct}`;
    if (!RES[id]) return key;
    if (kind === 'night') return `+${(v < 0.01 ? N3 : N2).format(v)} ${RES[id].name}/s nachts`;
    if (kind === 'cap') return `Lager ${RES[id].name} +${fmt(v)}`;
    return `${RES[id].name} ${pct}`;
  }
  const gainText = (gives, y) => Object.entries(gives).map(([id, v]) => amount(id, v * y, down)).join(' · ');
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
    return { el, buy, name: buy.firstChild, sub: buy.lastChild, infoBtn: el.querySelector('.info') };
  }

  // Auswahl mit Beschriftung; options() liefert [[Wert, Name], …], '' steht für null.
  function selectRow(label, options, value, change) {
    const el = document.createElement('label');
    el.className = 'row-select';
    el.innerHTML = `<span>${label}</span><select></select>`;
    const sel = el.querySelector('select');
    sel.addEventListener('change', () => { change(sel.value || null); render(); });
    return {
      el,
      update: () => {
        const opts = options(), sig = opts.map(o => o[0]).join();
        if (sel._sig !== sig) { sel.innerHTML = opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join(''); sel._sig = sig; }
        if (sel.value !== (value() || '')) sel.value = value() || '';
      },
    };
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
    if (S.tech.fertilizing) {
      items.push({
        key: 'fertilize',
        make: () => card(() => E.setFertilize(S, !S.fertilize)),
        update: k => {
          text(k.name, `Düngen: ${S.fertilize ? 'an' : 'aus'}`);
          text(k.sub, S.fertilize && S.res.guano <= 0 ? 'Kein Guano da, die Bäume warten'
            : `Obstbäume +50 % · braucht nachts ${N2.format(D.rules.fertilizeUse * S.bld.fruitTree)} Guano/s`);
          k.el.classList.toggle('on', S.fertilize);
        },
      });
    }
    return items;
  }

  const HINTS = { food: 'Für Neue fehlen Früchte.', winter: 'Im Winter zieht niemand ein.' };

  function batItems() {
    const items = [{
      key: 'summary',
      make: () => { const el = document.createElement('div'); el.className = 'summary'; return { el }; },
      update: k => html(k.el,
        `<p>Fledermäuse <b>${S.bats} / ${E.batCap(S)}</b> · frei <b>${E.free(S)}</b></p>` +
        `<p>Zufriedenheit <b>${Math.round(E.happiness(S) * 100)} %</b>` +
        `${S.isHungry ? ' · <span class="miss">hungrig</span>' : ''}</p>` +
        `<p class="muted hint">${HINTS[E.arrivalBlock(S)] || ''}</p>`),
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
          // „je Fledermaus“ nur bei einer Wirkung, sonst passt die Zeile am Handy nicht
          const fx = Object.entries(j.effects).map(([key, v]) => effectText(key, v).replace(' nachts', ''));
          el.querySelector('.sub').textContent = j.note || fx.join(', ') + (fx.length > 1 ? ' nachts' : ' nachts je Fledermaus');
          return { el, minus, plus, name: el.querySelector('.name') };
        },
        update: k => {
          text(k.name, `${j.name}: ${S.jobs[j.id]}`);
          k.minus.disabled = S.jobs[j.id] < 1;
          k.plus.disabled = E.free(S) < 1;
        },
      });
    }
    if (E.babyCap(S) > 0 || S.young > 0) {
      items.push({
        key: 'young',
        make: () => { const el = document.createElement('div'); el.className = 'summary young'; return { el }; },
        update: k => html(k.el, S.young > 0
          ? `<p>Junge <b>${S.young}</b> · im Herbst werden sie groß</p>`
          : `<p>Babyplätze <b>${E.babyCap(S)}</b> · Babyzeit im Frühling, Tag ${D.rules.babyDay}</p>`),
      });
    }
    if (S.tech.order) {
      items.push({
        key: 'autoJob',
        make: () => selectRow('Neue Fledermäuse werden',
          () => [['', 'frei'], ...D.jobs.filter(j => E.isUnlocked(S, j)).map(j => [j.id, j.name])],
          () => S.autoJob, v => E.setAutoJob(S, v)),
        update: k => k.update(),
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
        const done = !!S.tech[t.id], cost = E.price(S, 'tech', t.id);
        html(k.sub, done ? 'erforscht' : costHtml(cost));
        k.buy.disabled = done || !E.canAfford(S, cost);
      },
    }));
  }

  // Alle Orte stehen von Anfang an da (unbekannte als „???“), so springt beim Entdecken nichts.
  // Das Ziel antippen hält die Erkundung an; dann füllt das Echo das Lager.
  function exploreItems() {
    const items = [{
      key: 'summary',
      make: () => { const el = document.createElement('div'); el.className = 'summary'; return { el }; },
      update: k => {
        const all = D.places.every(p => S.places[p.id]);
        html(k.el, `<p>${S.explore ? `Ziel: <b>${PLACE[S.explore].name}</b>`
          : all ? 'Alle Orte sind entdeckt.' : 'Kein Ziel: Das Echo füllt das Lager.'}</p>` +
          `<p class="muted hint">${S.jobs.scout ? '' : 'Echo sammeln die Kundschafterinnen.'}</p>`);
      },
    }];
    for (const p of D.places) {
      items.push({
        key: 'place:' + p.id,
        make: () => {
          const k = card(() => E.explore(S, S.explore === p.id ? null : p.id), { kind: 'place', item: p });
          k.el.insertAdjacentHTML('beforeend', '<span class="bar" aria-hidden="true"><i></i></span>');
          k.bar = k.el.querySelector('.bar i');
          return k;
        },
        update: k => {
          const st = E.placeState(S, p.id), need = E.echoNeed(S, p.id), have = S.echoIn[p.id] || 0;
          text(k.name, st === 'hidden' ? '???' : p.name);
          text(k.sub, st === 'done' ? 'entdeckt' : st === 'hidden' ? 'noch unbekannt'
            : `${fmt(have, down)} / ${fmt(need, up)} Echo${st === 'current' ? ' · Ziel' : ''}`);
          k.buy.disabled = st === 'done' || st === 'hidden';
          k.infoBtn.disabled = st === 'hidden';
          k.el.classList.toggle('on', st === 'current');
          k.bar.style.width = st === 'open' || st === 'current' ? `${Math.min(100, have / need * 100)}%` : '0';
        },
      });
    }
    return items;
  }

  function workshopItems() {
    const items = [{
      key: 'summary',
      make: () => { const el = document.createElement('div'); el.className = 'summary'; return { el }; },
      update: k => html(k.el, `<p>Ausbeute je Herstellung <b>+${Math.round((E.craftYield(S) - 1) * 100)} %</b></p>` +
        `<p class="muted hint">${S.bld.workshop ? 'Waren haben kein Lager.' : 'Baue zuerst eine Werkstatt in der Kolonie.'}</p>`),
    }];
    if (S.tech.tinkering) {
      items.push({
        key: 'tinker',
        make: () => selectRow('Tüftlerinnen stellen her',
          () => [['', 'nichts'], ...D.recipes.filter(r => E.recipeOpen(S, r.id)).map(r => [r.id, RES[r.id].name])],
          () => S.tinkerRecipe, v => E.setTinkerRecipe(S, v)),
        update: k => k.update(),
      });
    }
    for (const r of D.recipes) {
      if (E.isUnlocked(S, RES[r.id])) items.push({ key: 'recipe:' + r.id, make: () => craftRow(r), update: k => updateCraft(k, r) });
    }
    for (const u of D.upgrades) {
      if (!E.upgradeVisible(S, u.id)) continue;
      items.push({
        key: 'upg:' + u.id,
        make: () => { const k = card(() => E.buyUpgrade(S, u.id), { kind: 'upgrade', item: u }); k.name.textContent = u.name; return k; },
        update: k => {
          const done = !!S.upgrades[u.id];
          html(k.sub, done ? 'erworben' : costHtml(u.cost));
          k.buy.disabled = done || !E.canAfford(S, u.cost);
        },
      });
    }
    return items;
  }

  // Zeile wie ein Job: links Ware mit Bestand und Zutaten (Waren mit Wirkung je Stück: eine Zeile mehr),
  // rechts +1, +10, max.
  function craftRow(r) {
    const el = document.createElement('div');
    el.className = 'job craft';
    const per = Object.entries(RES[r.id].perUnit || {}).map(([k, v]) => effectText(k, v)).join(', ');
    el.innerHTML = '<div class="job-text"><span class="name"></span><span class="sub"></span>' +
      (per ? `<span class="sub">je Stück: ${per}</span>` : '') + '</div>' +
      ['1', '10', 'max'].map(n => `<button class="step c-btn" type="button" data-n="${n}" ` +
        `aria-label="${RES[r.id].name} ${n === 'max' ? 'so viel wie geht' : '+' + n}">${n === 'max' ? 'max' : '+' + n}</button>`).join('');
    const btns = [...el.querySelectorAll('.c-btn')];
    for (const b of btns) {
      b.addEventListener('click', () => { if (E.craft(S, r.id, b.dataset.n === 'max' ? 'max' : Number(b.dataset.n))) render(); });
    }
    return { el, btns, name: el.querySelector('.name'), sub: el.querySelector('.sub') };
  }

  function updateCraft(k, r) {
    text(k.name, `${RES[r.id].name}: ${fmt(S.res[r.id], down)}`);
    html(k.sub, costHtml(r.cost));
    const none = !E.recipeOpen(S, r.id) || E.craftCount(S, r.id) < 1;
    for (const b of k.btns) b.disabled = none;
  }

  // Alle Nachbarn stehen von Anfang an da (unentdeckte als „???“). Antippen tauscht; „Auto“ ist der Dauerauftrag.
  function neighborItems() {
    const items = [{
      key: 'summary',
      make: () => { const el = document.createElement('div'); el.className = 'summary'; return { el }; },
      update: k => html(k.el, '<p>Tauschen macht Freunde, und Freunde helfen.</p>' +
        `<p class="muted hint">Ab Stufe ${D.rules.orderLevel} tauscht „Auto“ von selbst.</p>`),
    }];
    for (const n of D.neighbors) {
      items.push({
        key: 'nb:' + n.id,
        make: () => {
          const k = card(() => E.trade(S, n.id), { kind: 'neighbor', item: n });
          const auto = document.createElement('button');
          auto.className = 'auto';
          auto.type = 'button';
          auto.textContent = 'Auto';
          auto.setAttribute('aria-label', 'Dauerauftrag ' + n.name);
          auto.addEventListener('click', () => { if (E.setStandingOrder(S, n.id, !(n.id in S.orders))) render(); });
          k.el.insertBefore(auto, k.infoBtn);
          k.el.classList.add('wide'); // Tauschzeile braucht die ganze Breite, auch am PC
          k.auto = auto;
          return k;
        },
        update: k => {
          const known = !!S.places[n.place], level = E.friendLevel(S, n.id), on = n.id in S.orders;
          text(k.name, known ? `${n.name} · Stufe ${level}` : '???');
          html(k.sub, known ? `${costHtml(n.wants)} → ${gainText(n.gives, E.tradeYield(S, n.id))}` : 'noch nicht entdeckt');
          k.buy.disabled = !known || !E.canAfford(S, n.wants);
          k.auto.disabled = !known || level < D.rules.orderLevel;
          k.auto.setAttribute('aria-pressed', String(on));
          k.infoBtn.disabled = !known;
          k.el.classList.toggle('on', on);
        },
      });
    }
    return items;
  }

  // Mondkult: oben Vollmond und Segen, dann alle fünf Segen (zwei grau bis zum Festlied), dann die Lieder.
  function moonItems() {
    const items = [{
      key: 'summary',
      make: () => { const el = document.createElement('div'); el.className = 'summary'; return { el }; },
      update: k => {
        const d = E.festIn(S), b = BLESS[S.blessing], cost = E.blessCost(S).moonlight;
        const when = d === 0 ? 'Vollmond: Zeit fürs Mondfest!' : `Nächster Vollmond in ${d} ${d === 1 ? 'Tag' : 'Tagen'}.`;
        const hint = !b ? `Ein Segen kostet ${fmt(cost, up)} Mondlicht.`
          : E.blessActive(S) ? `Segen: ${b.name}, bis zum nächsten Vollmond.`
          : d === 0 ? `${b.name} kommt wieder, sobald ${fmt(cost, up)} Mondlicht da sind.`
          : `${b.name} kommt beim Vollmond wieder.`;
        html(k.el, `<p>${when}</p><p class="muted hint">${hint}</p>`);
      },
    }];
    for (const b of D.blessings) {
      items.push({
        key: 'bless:' + b.id,
        make: () => { const k = card(() => E.chooseBlessing(S, b.id)); k.name.textContent = b.name; return k; },
        update: k => {
          const open = E.isUnlocked(S, b), on = S.blessing === b.id && E.blessActive(S), cost = E.blessCost(S);
          // so stark, wie er wirkt oder jetzt wirken würde: Festlied, Lampion (ein Lampion im Lager wird verbraucht)
          const lantern = on ? S.blessLantern : S.res.lantern >= 1 - 1e-9;
          const m = 1 + (E.effects(S)['bless.bonus'] || 0) + (lantern ? D.rules.lanternBless : 0);
          const fx = Object.entries(b.effects).map(([key, v]) => effectText(key, v * m)).join(', ');
          html(k.sub, !open ? 'mit dem Festlied' : on ? `${fx} · wirkt` : `${fx} · ${costHtml(cost)}`);
          k.buy.disabled = !open || on || E.festIn(S) > 0 || !E.canAfford(S, cost);
          k.el.classList.toggle('on', on);
        },
      });
    }
    for (const g of D.songs) {
      items.push({
        key: 'song:' + g.id,
        make: () => { const k = card(() => E.singSong(S, g.id), { kind: 'song', item: g }); k.name.textContent = g.name; return k; },
        update: k => {
          const done = !!S.songs[g.id];
          html(k.sub, done ? 'gesungen' : costHtml(g.cost));
          k.buy.disabled = done || !E.canAfford(S, g.cost);
        },
      });
    }
    return items;
  }

  // Sterne: Stand und Weiterziehen, dann alle Himmelsgaben, am Ende die Sternbilder.
  function starItems() {
    const M = () => S.meta;
    const items = [{
      key: 'summary',
      make: () => { const el = document.createElement('div'); el.className = 'summary'; return { el }; },
      update: k => html(k.el, `<p>Sterne <b>${M().stars}</b> · frei <b>${M().starsFree}</b> · alles <b>+${M().stars} %</b></p>` +
        `<p class="muted hint">${S.tech.departure ? `Weiterziehen bringt ${starsNow()} ${starsNow() === 1 ? 'Stern' : 'Sterne'}.`
          : 'Mit dem Aufbruch geht es weiter.'}</p>`),
    }];
    if (S.tech.departure) {
      items.push({
        key: 'ascend',
        make: () => { const k = card(() => { openAscend(); return false; }); k.name.textContent = 'Weiterziehen'; return k; },
        update: k => text(k.sub, `Die Kolonie wird ein Sternbild: ${starsNow()} ${starsNow() === 1 ? 'Stern' : 'Sterne'}`),
      });
    }
    for (const p of D.perks) {
      items.push({
        key: 'perk:' + p.id,
        make: () => { const k = card(() => E.buyPerk(S, p.id), { kind: 'perk', item: p }); k.name.textContent = p.name; return k; },
        update: k => {
          const done = !!M().perks[p.id];
          html(k.sub, done ? 'erhalten' : `<span${M().starsFree < p.cost ? ' class="miss"' : ''}>${p.cost} Sterne</span>`);
          k.buy.disabled = done || M().starsFree < p.cost;
        },
      });
    }
    if (M().constellations.length) {
      items.push({
        key: 'constellations',
        make: () => { const el = document.createElement('div'); el.className = 'summary list'; return { el }; },
        update: k => html(k.el, '<p><b>Sternbilder</b></p>' + M().constellations.map(c => `<p>${esc(c.name)} · ${c.stars} ` +
          `${c.stars === 1 ? 'Stern' : 'Sterne'}${c.sign ? ` · ${JOB[c.sign].name} +${Math.round(D.rules.signBonus * 100)} %` : ''}</p>`).join('')),
      });
    }
    return items;
  }
  const starsNow = () => Math.max(0, S.bats - D.rules.starsFrom);
  const esc = t => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  // Chronik: je Kolonie ein Abschnitt, darin die Meilensteine mit Datum. Neu gebaut nur, wenn etwas dazukommt.
  function chronicleItems() {
    return [{
      key: 'chronicle',
      make: () => { const el = document.createElement('div'); el.className = 'summary list'; return { el }; },
      update: k => {
        const all = S.meta.chronicle;
        if (k.n === all.length && k.runs === S.meta.runs) return;
        k.n = all.length; k.runs = S.meta.runs;
        const names = Object.fromEntries(S.meta.constellations.map(c => [c.run, c.name]));
        const runs = [...new Set(all.map(c => c.run))];
        html(k.el, runs.map(r => `<p class="chron-head"><b>Kolonie ${r + 1}</b>${names[r] ? ` · Sternbild ${esc(names[r])}` : ''}</p>` +
          all.filter(c => c.run === r).map(c => `<p><span class="muted">${c.date}:</span> ${esc(c.text)}</p>`).join(''))
          .join('') || '<p class="muted">Noch ist nichts geschehen.</p>');
      },
    }];
  }

  const TABS = [
    { id: 'colony', name: 'Kolonie', show: () => true, items: colonyItems },
    { id: 'bats', name: 'Fledermäuse', show: () => S.seen.bats, items: batItems, badge: () => E.free(S) > 0 },
    { id: 'research', name: 'Forschung', show: () => S.seen.dreams, items: researchItems,
      badge: () => D.techs.some(t => E.isUnlocked(S, t) && !S.tech[t.id] && E.canAfford(S, E.price(S, 'tech', t.id))) },
    { id: 'explore', name: 'Erkundung', show: () => S.tech.echolocation, items: exploreItems },
    { id: 'workshop', name: 'Werkstatt', show: () => S.tech.crafting, items: workshopItems,
      badge: () => D.upgrades.some(u => E.upgradeVisible(S, u.id) && !S.upgrades[u.id] && E.canAfford(S, u.cost)) },
    { id: 'neighbors', name: 'Nachbarn', show: () => S.tech.trading, items: neighborItems },
    { id: 'moon', name: 'Mondkult', show: () => S.tech.moonlore, items: moonItems,
      badge: () => E.festIn(S) === 0 && !E.blessActive(S) && E.canAfford(S, E.blessCost(S)) },
    { id: 'stars', name: 'Sterne', show: () => S.tech.departure || S.meta.stars > 0 || S.meta.constellations.length > 0,
      items: starItems, badge: () => D.perks.some(p => !S.meta.perks[p.id] && S.meta.starsFree >= p.cost) },
    { id: 'chronicle', name: 'Chronik', show: () => S.tech.mooncalendar || S.meta.runs > 0, items: chronicleItems },
  ];

  // ---------- Zeichnen ----------

  let tab = 'colony', rendered = new Map(), logShown = -1, logOpen = false, info = null, saveWarned = false, awaySum = null;

  function render() {
    renderClock();
    renderStar();
    renderRes();
    renderTabs();
    renderPanel();
    renderLog();
    renderInfo();
  }

  function renderClock() {
    const c = E.calendar(S), cal = S.tech.mooncalendar, winter = D.rules.seasons[c.seasonIndex].dreamsAtNight;
    // Zwei kurze Zeilen, damit am Handy nichts abgeschnitten wird: Tageszeit oben, Kalender und Mond unten.
    html($('clock-1'), `${winter ? 'Winterschlaf · ' : ''}${c.night ? 'Nacht' : 'Tagschlaf'} · noch ${Math.ceil(c.phaseLeft)} s` +
      (S.isHungry ? ' · <span class="miss">hungrig</span>' : ''));
    text($('clock-2'), cal ? `Jahr ${c.year} · ${c.season} · Tag ${c.dayOfSeason} · ${c.moon}` : '');
  }

  // Fester Platz ab Mondkalender; die Sternschnuppe selbst steht nur, solange sie fällt.
  function renderStar() {
    $('star-slot').hidden = !S.tech.mooncalendar;
    $('star').hidden = !(S.star > 0);
    if (S.star > 0) text($('star'), `Sternschnuppe fangen · ${Math.ceil(S.star)} s`);
  }

  function renderRes() {
    const list = $('res-list'), r = E.rates(S);
    for (const res of D.resources) {
      // freigeschaltet = sichtbar, auch bei 0: nichts rutscht beim ersten Tippen. Waren stehen nur in der Werkstatt.
      if (res.crafted || !E.isUnlocked(S, res)) continue;
      let row = list.querySelector(`[data-res="${res.id}"]`);
      if (!row) {
        row = document.createElement('div');
        row.className = 'res-row';
        row.dataset.res = res.id;
        row.innerHTML = `<span>${res.name}</span><span class="rv"></span><span class="rr"></span>`;
        list.append(row);
      }
      const c = E.cap(S, res.id), rate = r[res.id];
      text(row.children[1], c === Infinity ? fmt(S.res[res.id], down) : `${fmt(S.res[res.id], down)} / ${fmt(c)}`);
      text(row.children[2], Math.abs(rate) > 1e-9 ? fmtRate(rate) : '');
      row.classList.toggle('full', S.res[res.id] >= c - 1e-9);
      row.children[2].classList.toggle('miss', rate < -1e-9);
    }
  }

  function renderTabs() {
    const nav = $('tabs');
    let added = false;
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
        added = true;
      }
      b.setAttribute('aria-selected', String(t.id === tab));
      if (t.badge) text(b.lastChild, t.badge() ? '•' : '');
    }
    // Reihenfolge bleibt fest, auch wenn ein Reiter früher kommt als einer davor
    if (added) for (const t of TABS) { const b = nav.querySelector(`[data-tab="${t.id}"]`); if (b) nav.append(b); }
  }

  function switchTab(id) {
    tab = id;
    rendered = new Map();
    $('panel').replaceChildren();
    render();
    // am Handy ist die Reiterleiste schmaler als ihr Inhalt: den gewählten Reiter ganz zeigen
    $('tabs').querySelector(`[data-tab="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderPanel() {
    const keys = new Set();
    for (const item of TABS.find(t => t.id === tab).items()) {
      keys.add(item.key);
      let k = rendered.get(item.key);
      if (!k) {
        k = item.make();
        rendered.set(item.key, k);
        $('panel').append(k.el); // Neues kommt immer ans Ende, damit nichts verrutscht
      }
      item.update(k);
    }
    for (const [key, k] of rendered) if (!keys.has(key)) { k.el.remove(); rendered.delete(key); }
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
    if (kind === 'neighbor') {
      const level = E.friendLevel(S, item.id), next = D.rules.friendLevels[level], orderRes = Object.keys(item.wants)
        .map(id => RES[id].name).join(' und ');
      text($('info-effects'), 'Hilfe je Stufe: ' + Object.entries(item.help).map(([k, v]) => effectText(k, v)).join(', '));
      html($('info-cost'), `<p>Stufe ${level} · ${fmt(S.friends[item.id] || 0, down)} Mal getauscht</p>` +
        (next ? `<p>Nächste Stufe bei ${next}</p>` : '') +
        `<p class="muted">Auto ab Stufe ${D.rules.orderLevel}: tauscht von selbst, wenn das Lager für ${orderRes} fast voll ist.</p>`);
      return;
    }
    if (kind === 'place') {
      const opens = [...D.buildings, ...D.jobs, ...D.techs]
        .filter(x => [].concat(x.requires?.place || []).includes(item.id)).map(x => x.name);
      const folk = D.neighbors.filter(n => n.place === item.id).map(n => n.name);
      text($('info-effects'), [...Object.entries(item.effects || {}).map(([k, v]) => effectText(k, v)),
        folk.length ? 'Hier wohnen ' + folk.join(', ') : '',
        opens.length ? 'Schaltet frei: ' + opens.join(', ') : ''].filter(Boolean).join(' · '));
      html($('info-cost'), S.places[item.id] ? '<p>Entdeckt</p>'
        : `<p>Echo: ${fmt(S.echoIn[item.id] || 0, down)} / ${fmt(E.echoNeed(S, item.id), up)}</p>`);
      return;
    }
    if (kind === 'perk') {
      text($('info-effects'), item.effects ? 'Wirkung: ' + Object.entries(item.effects).map(([k, v]) => effectText(k, v)).join(', ')
        : item.start ? 'Wirkt ab der nächsten Kolonie.' : '');
      html($('info-cost'), S.meta.perks[item.id] ? '<p>Erhalten</p>'
        : `<p${S.meta.starsFree < item.cost ? ' class="miss"' : ''}>Freie Sterne: ${S.meta.starsFree} / ${item.cost}</p>`);
      return;
    }
    if (kind === 'song') {
      text($('info-effects'), 'Wirkung: ' + Object.entries(item.effects).map(([k, v]) => effectText(k, v)).join(', ') +
        (item.unlockText ? ' · Schaltet frei: ' + item.unlockText : ''));
      html($('info-cost'), S.songs[item.id] ? '<p>Gesungen</p>' : costDetail(item.cost));
      return;
    }
    if (kind === 'upgrade') {
      text($('info-effects'), 'Wirkung: ' + Object.entries(item.effects).map(([k, v]) => effectText(k, v)).join(', '));
      html($('info-cost'), S.upgrades[item.id] ? '<p>Erworben</p>' : costDetail(item.cost));
      return;
    }
    if (kind === 'building') {
      text($('info-effects'), 'Wirkung: ' + Object.entries(item.effects).map(([k, v]) => effectText(k, v)).join(', '));
    } else {
      const opens = [...D.buildings, ...D.jobs, ...D.techs].filter(x => E.needs(x).includes(item.id)).map(x => x.name);
      text($('info-effects'), 'Schaltet frei: ' + [item.unlockText, ...opens].filter(Boolean).join(', '));
    }
    const done = kind === 'tech' && S.tech[item.id];
    html($('info-cost'), done ? '<p>Erforscht</p>' : costDetail(E.price(S, kind === 'tech' ? 'tech' : 'building', item.id)));
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

  // ---------- Weiterziehen ----------

  function openAscend() {
    const used = new Set(S.meta.constellations.map(c => c.name));
    $('ascend-name').value = D.constellationNames.find(n => !used.has(n)) || '';
    text($('ascend-stars'), `Die Kolonie wird ein Sternbild und bringt ${starsNow()} ${starsNow() === 1 ? 'Stern' : 'Sterne'}. ` +
      'Alles andere beginnt neu; Sterne, Himmelsgaben und Chronik bleiben.');
    $('ascend').showModal();
  }

  function ascendNow() {
    const next = E.ascend(S, $('ascend-name').value);
    if (!next) return;
    backup();
    S = next;
    saveNow();
    rebuild();
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

    $('star').addEventListener('click', () => { if (E.catchStar(S)) render(); });
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
    // submit statt close: kommt sofort und sicher, auch wo ein Browser das close-Ereignis verschluckt
    $('ascend-form').addEventListener('submit', e => { if (e.submitter?.value === 'go') ascendNow(); });
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
    const seconds = away ? Math.min((Date.now() - away.at) / 1000, E.offlineMax(S)) : 0;
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
