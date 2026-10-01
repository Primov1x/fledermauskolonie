// Fledermauskolonie – Spiellogik ohne DOM. Im Browser global `Engine`, in Node per require().
const Engine = (() => {
  const D = typeof DATA !== 'undefined' ? DATA : require('./data.js');
  const R = D.rules;
  const byId = list => Object.assign(Object.create(null), Object.fromEntries(list.map(x => [x.id, x])));
  const RES = byId(D.resources), BLD = byId(D.buildings), JOB = byId(D.jobs), TECH = byId(D.techs), PLACE = byId(D.places);
  const RECIPE = byId(D.recipes), UPG = byId(D.upgrades), NB = byId(D.neighbors), SONG = byId(D.songs);
  const BLESS = byId(D.blessings), PERK = byId(D.perks);
  const PER_UNIT = D.resources.filter(r => r.perUnit);
  const CLICKS = new Set(D.clicks.map(c => c.id));
  const LUXURY = D.resources.filter(r => r.luxury);
  const MOON_DAYS = R.moonPhases.reduce((n, p) => n + p.days, 0);
  // Fest-Zyklus: zählt ab jedem Vollmondbeginn weiter. Ein Segen wirkt, solange er im aktuellen Zyklus bezahlt ist.
  const FEST_START = R.moonPhases.slice(0, R.moonPhases.findIndex(p => p.fest)).reduce((n, p) => n + p.days, 0);
  const festCycle = day => Math.floor((day - FEST_START) / MOON_DAYS);
  const list = v => [].concat(v || []);

  // ---------- Spielstand ----------

  // meta: was über Neustarts bleibt (Chronik, Sterne, Himmelsgaben, Sternbilder); wird kopiert, nie geteilt.
  function create(meta) {
    const m = meta ? JSON.parse(JSON.stringify(meta)) : {};
    const s = {
      v: R.saveVersion, time: 0, savedAt: 0,
      res: {}, bld: {}, jobs: {}, tech: {}, seen: {}, places: {}, upgrades: {}, friends: {}, orders: {},
      bats: 0, young: 0, arrival: 0, hungry: 0, isHungry: false, born: 0,
      star: 0, starIn: R.starEvery,
      explore: null, echoIn: {}, fertilize: false, autoJob: null, tinkerRecipe: null, craftAcc: 0,
      songs: {}, blessing: null, blessCycle: null, blessLantern: false,
      log: [], logSeq: 0,
      meta: { runs: m.runs || 0, chronicle: m.chronicle || [], stars: m.stars || 0, starsFree: m.starsFree || 0,
        perks: m.perks || {}, constellations: m.constellations || [] },
    };
    for (const r of D.resources) s.res[r.id] = 0;
    for (const b of D.buildings) s.bld[b.id] = 0;
    for (const j of D.jobs) s.jobs[j.id] = 0;
    log(s, R.startText);
    for (const p of D.perks) if (s.meta.perks[p.id] && p.start) startGift(s, p.start);
    if (s.tech.echolocation) s.explore = nextPlace(s);
    return s;
  }

  // Himmelsgaben mit Startwirkung: Bestand, Gebäude, Forschung, Orte, Freundschaft.
  function startGift(s, st) {
    for (const r in st.res || {}) s.res[r] += st.res[r];
    for (const b in st.bld || {}) s.bld[b] += st.bld[b];
    for (const t of st.tech || []) s.tech[t] = true;
    for (const p of st.places || []) s.places[p] = true;
    if (st.friends) for (const n of D.neighbors) s.friends[n.id] = st.friends;
  }

  function log(s, text) {
    s.log.push({ id: ++s.logSeq, text });
    if (s.log.length > R.logMax) s.log.splice(0, s.log.length - R.logMax);
  }

  // Meilenstein für die Chronik (Reiter ab Etappe 7); bleibt über Neustarts.
  function chron(s, text) {
    const c = calendar(s);
    s.meta.chronicle.push({ date: `Jahr ${c.year}, ${c.season}`, run: s.meta.runs, text });
    if (s.meta.chronicle.length > R.chronicleMax) s.meta.chronicle.splice(0, s.meta.chronicle.length - R.chronicleMax);
  }

  // ---------- Zeit ----------

  // Jeder Tag beginnt mit der Nacht; wie lang sie ist, hängt an der Jahreszeit.
  // Gerechnet wird in Sekunden, damit Phasengrenzen exakt bleiben.
  function calendar(s) {
    const day = Math.floor(s.time / R.dayLength);
    const t = s.time % R.dayLength;
    const seasonIndex = Math.floor(day / R.seasonDays) % R.seasons.length, season = R.seasons[seasonIndex];
    const nightEnd = season.night * R.dayLength;
    const night = t < nightEnd;
    const moonDay = day % MOON_DAYS;
    let acc = 0, moonPhase = R.moonPhases[0];
    for (const p of R.moonPhases) {
      acc += p.days;
      if (moonDay < acc) { moonPhase = p; break; }
    }
    return {
      day, night, seasonIndex, moonPhase, moon: moonPhase.name, nightShare: season.night,
      phaseLeft: night ? nightEnd - t : R.dayLength - t,
      season: season.name,
      dayOfSeason: (day % R.seasonDays) + 1,
      year: Math.floor(day / (R.seasonDays * R.seasons.length)) + 1,
    };
  }

  // ---------- Werte ----------

  // Summe aller Effekte; zwischengespeichert, bis eine Aktion Gebäude, Jobs, Forschung, Orte, Upgrades,
  // Freundschaftsstufen oder Waren mit Wirkung je Stück ändert.
  // 'bld.<id>' und 'per.<id>' verstärken ein Gebäude oder eine Ware, daher zwei Durchgänge: erst die Verstärker.
  function effects(s) {
    if (s._eff) return s._eff;
    const src = [];
    for (const b of D.buildings) if (s.bld[b.id]) src.push([b.effects, s.bld[b.id], 'bld.' + b.id]);
    for (const j of D.jobs) if (s.jobs[j.id]) src.push([j.effects, s.jobs[j.id]]);
    for (const t of D.techs) if (s.tech[t.id] && t.effects) src.push([t.effects, 1]);
    for (const p of D.places) if (s.places[p.id] && p.effects) src.push([p.effects, 1]);
    for (const u of D.upgrades) if (s.upgrades[u.id]) src.push([u.effects, 1]);
    for (const n of D.neighbors) { const l = friendLevel(s, n.id); if (l) src.push([n.help, l]); }
    for (const r of PER_UNIT) { const k = Math.floor(s.res[r.id] + 1e-9); if (k > 0) src.push([r.perUnit, k, 'per.' + r.id]); }
    for (const g of D.songs) if (s.songs[g.id]) src.push([g.effects, 1]);
    const m = s.meta;
    if (m.stars) src.push([{ 'all.bonus': R.starBonus, 'cap.bonus': R.starBonus }, m.stars]);
    for (const c of m.constellations) if (c.sign) src.push([{ ['job.' + c.sign]: R.signBonus }, 1]);
    for (const p of D.perks) if (m.perks[p.id] && p.effects) src.push([p.effects, 1]);
    if (blessActive(s)) src.push([BLESS[s.blessing].effects, 1, 'bless.bonus', s.blessLantern ? R.lanternBless : 0]);
    const e = {}, boost = k => k.startsWith('bld.') || k.startsWith('per.') || k === 'bless.bonus';
    for (const [fx, n] of src) for (const k in fx) if (boost(k)) e[k] = (e[k] || 0) + fx[k] * n;
    for (const [fx, n, by, extra = 0] of src) {
      const m = 1 + (by && e[by] || 0) + extra;
      for (const k in fx) if (!boost(k)) e[k] = (e[k] || 0) + fx[k] * n * m;
    }
    return (s._eff = e);
  }
  const dirty = s => { s._eff = null; };
  const fx = (s, key) => effects(s)[key] || 0;

  const cap = (s, id) => (RES[id].cap + fx(s, id + '.cap')) * (1 + fx(s, 'cap.bonus'));
  const batCap = s => fx(s, 'bats.cap');
  const babyCap = s => fx(s, 'babies.cap');
  const free = s => s.bats - D.jobs.reduce((n, j) => n + s.jobs[j.id], 0);

  // Wer bei Hunger wegzieht (oder beim Laden gestrichen wird): erst ohne Job, dann andere Jobs,
  // Sammlerinnen zuletzt. Liefert die Job-Id oder null, wenn eine Fledermaus ohne Job gehen kann.
  function leaver(s) {
    if (free(s) >= 1) return null;
    const busy = D.jobs.filter(j => s.jobs[j.id] > 0);
    const others = busy.filter(j => !j.effects['fruit.night']);
    return (others.length ? others : busy).reduce((a, j) => (s.jobs[j.id] > s.jobs[a.id] ? j : a)).id;
  }

  // Zufriedenheit: jede Luxus-Sorte mit Bestand hebt, Gedränge (nur Erwachsene) senkt.
  // Der Hunger-Abzug bremst nur die Träume, nicht das Sammeln (sonst Teufelskreis).
  function happiness(s, withHunger = true) {
    const luxury = LUXURY.filter(r => s.res[r.id] >= 1 - 1e-9).length * R.luxuryHappy;
    const z = 1 + luxury + fx(s, 'happy.bonus') - R.crowdPenalty * Math.max(0, s.bats - R.crowdFree)
      - (withHunger && s.isHungry ? R.hungerPenalty : 0);
    return Math.max(R.happinessMin, z);
  }

  const fertilizing = s => s.fertilize && !!s.tech.fertilizing && s.res.guano > 0;
  // Nachtarbeit: Zufriedenheit ohne Hunger-Abzug, dazu Boni wie die Glühwürmchen.
  const workFactor = s => happiness(s, false) * (1 + fx(s, 'work.bonus'));
  // Hunger je Jahreszeit; der Winter-Rabatt (Igel, Winterquartiere, Nussvorrat) zählt höchstens bis winterHungerMax.
  const hungerMult = (s, season) => (season.hunger === undefined ? 1
    : season.hunger * (1 - Math.min(R.winterHungerMax, fx(s, 'winter.hunger'))));

  // Raten je Sekunde für Nacht oder Tag der jetzigen Jahreszeit, Verbrauch schon abgezogen.
  // Nachts arbeiten und essen die Fledermäuse, tagsüber träumen sie und machen Guano; im Winterschlaf
  // träumen sie auch nachts. Jede Quelle zählt mit ihrem eigenen Bonus (bld.<id>, job.<id>), danach
  // Ressourcen-Bonus, Mond, Zufriedenheit und Jahreszeit.
  // seasonIndex gesetzt: für diese Jahreszeit und ohne Mondbonus (Zuzugs-Prüfung).
  function rates(s, night = calendar(s).night, seasonIndex = null) {
    const c = calendar(s), season = R.seasons[seasonIndex ?? c.seasonIndex];
    const moonBonus = seasonIndex === null ? c.moonPhase.bonus : {};
    const out = {}, prod = {}, all = 1 + fx(s, 'all.bonus'); // Großer Mondchor: alles, was entsteht
    for (const r of D.resources) out[r.id] = prod[r.id] = 0;
    if (night) {
      const add = (effectsOf, n) => {
        for (const k in effectsOf) if (k.endsWith('.night')) prod[k.slice(0, -6)] += effectsOf[k] * n;
      };
      const fert = fertilizing(s);
      for (const b of D.buildings) {
        if (!s.bld[b.id]) continue;
        add(b.effects, s.bld[b.id] * (1 + fx(s, 'bld.' + b.id) + (fert && b.id === 'fruitTree' ? R.fertilizeBonus : 0)));
      }
      for (const j of D.jobs) if (s.jobs[j.id]) add(j.effects, s.jobs[j.id] * (1 + fx(s, 'job.' + j.id)));
      const work = workFactor(s) * all;
      for (const id in prod) {
        out[id] = prod[id] * (1 + fx(s, id + '.bonus') + (moonBonus[id] || 0)) * work * (season.mult[id] ?? season.work ?? 1);
      }
      out.fruit -= (s.bats * R.batHunger + s.young * R.youngHunger) * hungerMult(s, season);
      if (fert) out.guano -= R.fertilizeUse * s.bld.fruitTree;
      for (const r of LUXURY) if (r.use && s.res[r.id] > 0) out[r.id] -= r.use * s.bats;
    } else {
      out.guano += (s.bats * R.batGuano + s.young * R.youngGuano) * (season.guano ?? 1) * all;
    }
    if (!night || season.dreamsAtNight) {
      out.dreams += (s.bats * R.batDream + s.young * R.youngDream) * (1 + fx(s, 'dreams.bonus')) * happiness(s) * all;
    }
    return out;
  }

  // Früchte-Überschuss je Nacht in der kargsten Jahreszeit, umgerechnet auf vollen Hunger:
  // So viel mehr könnte die Kolonie auch im Frühling und Winter noch satt machen.
  const leanFruit = s => Math.min(...R.seasons.map((x, i) => rates(s, true, i).fruit / hungerMult(s, x)));

  // ---------- Ablauf ----------

  // Rückt die Zeit vor: Schritte von höchstens 1 s, geteilt an den Grenzen von Nacht und Tag.
  function step(s, dt) {
    while (dt > 1e-9) {
      const part = Math.min(dt, 1, Math.max(calendar(s).phaseLeft, 1e-6));
      tick(s, part);
      dt -= part;
    }
  }

  function tick(s, dt) {
    const c = calendar(s), night = c.night;
    const r = rates(s, night);
    for (const id in r) {
      const v = s.res[id] + r[id] * dt;
      s.res[id] = Math.min(cap(s, id), Math.max(0, v));
      if (s.res[id] > 0) s.seen[id] = true;
      if (id === 'fruit' && night) hunger(s, v < 0 && s.bats > 0, dt);
    }
    if (night) arrivals(s, dt);
    starTick(s, dt, night);
    exploreTick(s);
    if (night) craftTick(s, dt, c);
    orderTick(s, dt);
    festTick(s, c);
    s.time += dt;
    const now = calendar(s);
    if (now.day !== c.day) newDay(s, c, now);
  }

  // Ein neuer Tag: nach dem Winter die Chronik, im Frühling die Babyzeit, im Herbst werden die Jungen groß.
  // Mit jedem Vollmond beginnt ein neuer Fest-Zyklus; ging er ohne Mondfest vorbei, verklingt der Segen.
  function newDay(s, before, c) {
    if (festCycle(c.day) !== festCycle(before.day)) dirty(s);
    if (before.moonPhase.fest && !c.moonPhase.fest && s.blessing && s.blessCycle !== festCycle(before.day)) {
      log(s, 'Zu wenig Mondlicht: Der Segen ist verklungen.');
    }
    if (before.seasonIndex === R.seasons.length - 1 && c.seasonIndex === 0 && s.bats > 0 && !s.seen.winter) {
      s.seen.winter = true;
      chron(s, 'Der erste Winter ist überstanden.');
    }
    if (c.seasonIndex === 0 && c.dayOfSeason === R.babyDay && s.born !== c.year) births(s, c);
    if (c.seasonIndex === 2 && c.dayOfSeason === 1 && s.young > 0) growUp(s);
  }

  function births(s, c) {
    s.born = c.year;
    const n = Math.min(babyCap(s) - s.young, Math.floor(s.bats * R.babyShare * (1 + fx(s, 'babies.bonus'))));
    if (n < 1) return;
    s.young += n;
    log(s, n === 1 ? 'Ein Junges kommt in der Wochenstube zur Welt.' : `${n} Junge kommen in der Wochenstube zur Welt.`);
    if (!s.seen.young) { s.seen.young = true; chron(s, 'Das erste Junge kommt zur Welt.'); }
  }

  // Groß werden geht nur mit freiem Platz; wer keinen hat, sucht sich ein eigenes Zuhause.
  function growUp(s) {
    const stay = Math.min(s.young, Math.max(0, batCap(s) - s.bats)), leave = s.young - stay;
    s.bats += stay;
    assignNew(s, stay);
    batsGrew(s);
    s.young = 0;
    dirty(s);
    if (!leave) log(s, stay === 1 ? 'Das Junge ist groß und bleibt in der Kolonie.' : 'Die Jungen sind groß und bleiben in der Kolonie.');
    else if (!stay) log(s, leave === 1 ? 'Das Junge ist groß und sucht sich ein eigenes Zuhause.' : 'Die Jungen sind groß und suchen sich ein eigenes Zuhause.');
    else log(s, `Die Jungen sind groß: ${stay} ${stay === 1 ? 'bleibt' : 'bleiben'}, ${leave} ${leave === 1 ? 'sucht sich' : 'suchen sich'} ein eigenes Zuhause.`);
  }

  function hunger(s, hungry, dt) {
    if (!hungry) { s.isHungry = false; s.hungry = 0; return; }
    s.isHungry = true;
    s.hungry += dt;
    if (s.hungry < R.hungerLeaveAfter) return;
    s.hungry -= R.hungerLeaveAfter;
    const job = leaver(s);
    if (job) s.jobs[job]--;
    s.bats--;
    dirty(s);
    log(s, 'Eine Fledermaus zieht weg. Es gab zu wenig Früchte.');
  }

  // Warum gerade niemand einzieht: 'full', 'hungry', 'winter', 'food' oder null (es kann jemand kommen).
  // Die allererste Fledermaus kommt immer; danach nur, wenn die Früchte auch in der kargsten Jahreszeit
  // für eine mehr reichen (sonst zöge sie im nächsten Frühling hungrig wieder weg).
  function arrivalBlock(s) {
    if (s.bats >= batCap(s)) return 'full';
    if (s.isHungry) return 'hungry';
    if (R.seasons[calendar(s).seasonIndex].noArrival) return 'winter';
    if ((s.bats > 0 || s.seen.bats) && leanFruit(s) < R.batHunger - 1e-9) return 'food';
    return null;
  }

  function arrivals(s, dt) {
    if (arrivalBlock(s)) { s.arrival = 0; return; }
    s.arrival += dt * (1 + fx(s, 'arrival.speed'));
    if (s.arrival < R.arrivalEvery) return;
    s.arrival -= R.arrivalEvery;
    s.bats++;
    assignNew(s, 1);
    batsGrew(s);
    dirty(s);
    if (s.seen.bats) { log(s, 'Eine Fledermaus zieht ein.'); return; }
    log(s, 'Die erste Fledermaus zieht ein. Sie isst nachts Früchte.');
    chron(s, 'Die erste Fledermaus zieht ein.');
    s.seen.bats = true;
  }

  // Chronik: 25, 50, 100 Fledermäuse (je Kolonie einmal).
  function batsGrew(s) {
    for (const n of R.batMilestones) {
      if (s.bats < n || s.seen['bats' + n]) continue;
      s.seen['bats' + n] = true;
      chron(s, `${n} Fledermäuse leben in der Kolonie.`);
    }
  }

  // Ordnung: Neue bekommen gleich den gewählten Job.
  function assignNew(s, n) {
    const j = JOB[s.autoJob];
    if (s.tech.order && j && isUnlocked(s, j)) s.jobs[j.id] += n;
  }

  // Sternschnuppen fallen nur nachts (ab Mondkalender) und stehen starShow Sekunden zum Antippen im Kopf.
  function starTick(s, dt, night) {
    if (s.star > 0 && (s.star -= dt) <= 1e-9) s.star = 0;
    if (!night || !s.tech.mooncalendar || (s.starIn -= dt) > 1e-9) return;
    if (api.rng() < Math.min(1, fx(s, 'star.auto'))) gainStar(s);
    else {
      s.star = R.starShow;
      if (!s.seen.star) { s.seen.star = true; log(s, 'Eine Sternschnuppe! Tippe sie oben an, dann gibt es eine Sternkarte.'); }
    }
    s.starIn = R.starEvery / (1 + fx(s, 'star.rate')) * (0.5 + api.rng());
  }
  function gainStar(s) {
    s.res.starmaps = Math.min(cap(s, 'starmaps'), s.res.starmaps + 1);
    s.seen.starmaps = true;
  }
  function catchStar(s) {
    if (!(s.star > 0)) return false;
    s.star = 0;
    gainStar(s);
    return true;
  }

  // ---------- Erkundung ----------

  const echoNeed = (s, id) => PLACE[id].echo * (1 - Math.min(0.9, fx(s, 'explore.discount')));
  const nextPlace = s => D.places.find(p => !s.places[p.id] && isUnlocked(s, p))?.id ?? null;

  // 'done' entdeckt, 'current' das Ziel, 'open' wählbar, 'hidden' steht als „???“ da.
  // Sichtbar sind die entdeckten Orte und die nächsten placesAhead.
  function placeState(s, id) {
    if (s.places[id]) return 'done';
    let n = 0;
    for (const p of D.places) {
      if (s.places[p.id] || !isUnlocked(s, p)) continue;
      if (p.id === id) return n >= R.placesAhead ? 'hidden' : s.explore === id ? 'current' : 'open';
      n++;
    }
    return 'hidden';
  }

  // Echo fließt jede Sekunde aus dem Lager ins Ziel: erst der Vorrat, danach alles Neue.
  function exploreTick(s) {
    const id = s.explore;
    if (!id) return;
    const need = echoNeed(s, id), have = s.echoIn[id] || 0;
    const take = Math.min(s.res.echo, Math.max(0, need - have));
    s.echoIn[id] = have + take;
    s.res.echo -= take;
    if (s.echoIn[id] < need - 1e-9) return;
    const cost = PLACE[id].cost;
    if (cost) { // Ferne Wälder: erst mit den Echokarten
      if (!canAfford(s, cost)) return;
      pay(s, cost);
    }
    s.places[id] = true;
    delete s.echoIn[id];
    dirty(s);
    log(s, `Entdeckt: ${PLACE[id].name}.`);
    chron(s, `Entdeckt: ${PLACE[id].name}.`);
    s.explore = nextPlace(s);
  }

  // Ziel wählen; null heißt ohne Ziel, dann füllt das Echo das Lager.
  function explore(s, id) {
    if (!s.tech.echolocation) return false;
    if (id === null) { s.explore = null; return true; }
    if (!PLACE[id] || !['open', 'current'].includes(placeState(s, id))) return false;
    s.explore = id;
    return true;
  }

  // ---------- Werkstatt ----------

  const craftYield = s => 1 + fx(s, 'craft.bonus');
  const recipeOpen = (s, id) => !!(RECIPE[id] && s.bld.workshop > 0 && isUnlocked(s, RES[id]));
  // Wie oft das Rezept gerade bezahlbar ist.
  const craftCount = (s, id) => Math.min(...Object.entries(RECIPE[id].cost).map(([r, v]) => Math.floor(s.res[r] / v + 1e-9)));
  // Sichtbar, sobald eine Werkstatt steht und alle Ressourcen in den Kosten freigeschaltet sind.
  const upgradeVisible = (s, id) => !!(UPG[id] && s.bld.workshop > 0 && isUnlocked(s, UPG[id])
    && Object.keys(UPG[id].cost).every(r => isUnlocked(s, RES[r])));

  // Tüftlerinnen stellen nachts das gewählte Rezept her, aber nur aus Überschuss: Zutaten mit Lager erst ab
  // tinkerFill, Waren ohne Lager immer. Fehlt etwas, staut sich höchstens eine Herstellung an.
  function craftTick(s, dt, c) {
    if (!s.tinkerRecipe || !s.jobs.tinkerer || !recipeOpen(s, s.tinkerRecipe)) return;
    const cost = RECIPE[s.tinkerRecipe].cost;
    s.craftAcc += s.jobs.tinkerer * R.tinkerRate * (1 + fx(s, 'job.tinkerer')) * workFactor(s)
      * (R.seasons[c.seasonIndex].work ?? 1) * dt;
    while (s.craftAcc >= 1 - 1e-9 && craftCount(s, s.tinkerRecipe) >= 1
      && Object.keys(cost).every(r => cap(s, r) === Infinity || s.res[r] >= R.tinkerFill * cap(s, r) - 1e-9)) {
      craft(s, s.tinkerRecipe, 1);
      s.craftAcc -= 1;
    }
    s.craftAcc = Math.min(Math.max(0, s.craftAcc), 1);
  }

  // ---------- Nachbarn ----------

  const friendLevel = (s, id) => R.friendLevels.filter(v => (s.friends[id] || 0) >= v - 1e-9).length;
  const tradeYield = (s, id) => 1 + fx(s, 'trade.bonus') + R.friendTrade * friendLevel(s, id);
  const canTrade = (s, id) => !!(NB[id] && s.tech.trading && s.places[NB[id].place]);

  // Daueraufträge tauschen von selbst, sobald alles Gewollte über orderFill seines Lagers liegt,
  // höchstens alle orderEvery Sekunden (s.orders[id] = Sekunden bis zum nächsten).
  function orderTick(s, dt) {
    for (const id in s.orders) {
      s.orders[id] = Math.max(0, s.orders[id] - dt);
      if (s.orders[id] > 1e-9) continue;
      const { wants, gives } = NB[id];
      if (!Object.keys(wants).every(r => s.res[r] >= R.orderFill * cap(s, r) - 1e-9)) continue;
      if (Object.keys(gives).every(r => s.res[r] >= cap(s, r) - 1e-9)) continue; // kein Platz: nichts verschenken
      if (trade(s, id)) s.orders[id] = R.orderEvery;
    }
  }

  // ---------- Mondkult ----------

  const blessActive = s => s.blessing !== null && s.blessCycle === festCycle(calendar(s).day);
  const blessCost = s => ({ moonlight: R.blessCost + R.blessPerBat * s.bats });
  // Tage bis zum nächsten Vollmond; 0, solange Vollmond ist.
  const festIn = s => {
    const c = calendar(s);
    return c.moonPhase.fest ? 0 : (((FEST_START - c.day) % MOON_DAYS) + MOON_DAYS) % MOON_DAYS;
  };

  // Bei Vollmond erneuert sich der zuletzt gewählte Segen von selbst, sobald genug Mondlicht da ist.
  function festTick(s, c) {
    if (!s.blessing || !c.moonPhase.fest || s.blessCycle === festCycle(c.day)) return;
    if (!s.tech.moonlore || !isUnlocked(s, BLESS[s.blessing]) || !canAfford(s, blessCost(s))) return;
    bless(s, s.blessing, c);
    log(s, `Mondfest: ${BLESS[s.blessing].name} erneuert.`);
  }

  // Bezahlen und wirken lassen; ein Lampion im Lager wird dabei verbraucht und macht den Segen stärker.
  function bless(s, id, c) {
    pay(s, blessCost(s));
    s.blessing = id;
    s.blessCycle = festCycle(c.day);
    s.blessLantern = s.res.lantern >= 1 - 1e-9;
    if (s.blessLantern) s.res.lantern = Math.max(0, s.res.lantern - 1);
    dirty(s);
  }

  const offlineMax = s => (s.meta.perks.longAbsence ? R.offlineLong : R.offlineMax);

  // Holt verpasste Zeit nach (höchstens offlineMax) und fasst zusammen, was sich geändert hat.
  function simulate(s, seconds) {
    const secs = Math.min(Math.max(0, seconds) || 0, offlineMax(s));
    const bats = s.bats, res = { ...s.res };
    step(s, secs);
    const diff = {};
    for (const id in s.res) diff[id] = s.res[id] - res[id];
    return { seconds: secs, bats: s.bats - bats, res: diff };
  }

  // ---------- Aktionen ----------

  const needs = item => list(item.requires?.tech);
  const isUnlocked = (s, item) => needs(item).every(t => s.tech[t])
    && list(item.requires?.seen).every(f => s.seen[f])
    && list(item.requires?.place).every(p => s.places[p])
    && list(item.requires?.song).every(g => s.songs[g]);

  function price(s, kind, id) {
    if (kind === 'tech') {
      const d = 1 - Math.min(R.researchDiscountMax, fx(s, 'research.discount'));
      return Object.fromEntries(Object.entries(TECH[id].cost).map(([r, v]) => [r, v * d]));
    }
    const b = BLD[id], out = {};
    for (const r in b.cost) out[r] = b.cost[r] * b.ratio ** s.bld[id];
    return out;
  }
  const canAfford = (s, cost) => Object.keys(cost).every(r => s.res[r] >= cost[r] - 1e-9);
  function pay(s, cost) { for (const r in cost) s.res[r] = Math.max(0, s.res[r] - cost[r]); }

  // Sekunden bis bezahlbar, gemittelt über Nacht und Tag. Infinity: so nie (kein Ertrag oder Lager zu klein).
  function eta(s, cost) {
    const night = rates(s, true), day = rates(s, false), share = calendar(s).nightShare;
    let worst = 0;
    for (const r in cost) {
      const missing = cost[r] - s.res[r];
      if (missing <= 0) continue;
      if (cost[r] > cap(s, r)) return Infinity;
      const avg = night[r] * share + day[r] * (1 - share);
      if (avg <= 0) return Infinity;
      worst = Math.max(worst, missing / avg);
    }
    return worst;
  }

  function click(s, id) {
    if (!CLICKS.has(id) || s.res[id] >= cap(s, id)) return false;
    s.res[id] = Math.min(cap(s, id), s.res[id] + 1);
    s.seen[id] = true;
    return true;
  }

  function build(s, id) {
    const b = BLD[id];
    if (!b || !isUnlocked(s, b)) return false;
    const cost = price(s, 'building', id);
    if (!canAfford(s, cost)) return false;
    pay(s, cost);
    s.bld[id]++;
    dirty(s);
    return true;
  }

  function research(s, id) {
    const t = TECH[id];
    if (!t || s.tech[id] || !isUnlocked(s, t)) return false;
    const cost = price(s, 'tech', id);
    if (!canAfford(s, cost)) return false;
    pay(s, cost);
    if (!Object.keys(s.tech).length) chron(s, `Erste Forschung: ${t.name}.`);
    s.tech[id] = true;
    dirty(s);
    log(s, `Erforscht: ${t.name}.`);
    if (id === 'echolocation' && !s.explore) s.explore = nextPlace(s); // das erste Ziel startet von selbst
    return true;
  }

  function assign(s, id, delta) {
    const j = JOB[id];
    if (!j || !isUnlocked(s, j) || (delta !== 1 && delta !== -1)) return false;
    if (delta > 0 ? free(s) < 1 : s.jobs[id] < 1) return false;
    s.jobs[id] += delta;
    dirty(s);
    return true;
  }

  function setFertilize(s, on) {
    if (!s.tech.fertilizing) return false;
    s.fertilize = !!on;
    return true;
  }

  // n: Anzahl oder 'max'. Die Ausbeute wächst mit den Werkstätten.
  function craft(s, id, n) {
    if (!recipeOpen(s, id) || (n !== 'max' && !(Number.isInteger(n) && n > 0))) return false;
    const count = Math.min(craftCount(s, id), n === 'max' ? Infinity : n);
    if (count < 1) return false;
    for (const r in RECIPE[id].cost) s.res[r] = Math.max(0, s.res[r] - RECIPE[id].cost[r] * count);
    s.res[id] += count * craftYield(s);
    s.seen[id] = true;
    dirty(s); // Waren mit Wirkung je Stück
    return true;
  }

  // Festes Paket: wants bezahlen, gives mit Ausbeute bekommen (höchstens bis zum Lager). Jeder Tausch macht Freunde.
  function trade(s, id) {
    if (!canTrade(s, id)) return false;
    const n = NB[id];
    if (!canAfford(s, n.wants)) return false;
    pay(s, n.wants);
    const y = tradeYield(s, id);
    for (const r in n.gives) {
      s.res[r] = Math.min(cap(s, r), s.res[r] + n.gives[r] * y);
      s.seen[r] = true;
    }
    const before = friendLevel(s, id);
    s.friends[id] = (s.friends[id] || 0) + 1 + fx(s, 'friend.bonus');
    const level = friendLevel(s, id);
    if (level > before) {
      dirty(s);
      log(s, `Freundschaft mit ${n.dat}: Stufe ${level}.` + (level === R.orderLevel ? ' Ab jetzt geht auch Auto-Tausch.' : ''));
      if (level === R.friendLevels.length) chron(s, `Beste Freundschaft mit ${n.dat}.`);
    }
    return true;
  }

  function singSong(s, id) {
    const g = SONG[id];
    if (!g || !s.tech.moonlore || s.songs[id] || !canAfford(s, g.cost)) return false;
    pay(s, g.cost);
    s.songs[id] = true;
    dirty(s);
    log(s, `Gesungen: ${g.name}.`);
    return true;
  }

  // Mondfest: nur bei Vollmond. Wechseln zahlt neu; denselben Segen noch einmal wählen geht nicht.
  function chooseBlessing(s, id) {
    const c = calendar(s), b = BLESS[id];
    if (!b || !s.tech.moonlore || !c.moonPhase.fest || !isUnlocked(s, b)) return false;
    if (s.blessing === id && blessActive(s)) return false;
    if (!canAfford(s, blessCost(s))) return false;
    bless(s, id, c);
    log(s, `Mondfest: ${b.name} bis zum nächsten Vollmond.`);
    if (!s.seen.fest) { s.seen.fest = true; chron(s, `Das erste Mondfest: ${b.name}.`); }
    return true;
  }

  // ---------- Sternbilder ----------

  // Weiterziehen: Die Kolonie wird ein Sternbild. Gibt den neuen Spielstand zurück, oder null.
  function ascend(s, name) {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!s.tech.departure || !n || n.length > R.nameMax) return null;
    const stars = Math.max(0, s.bats - R.starsFrom);
    const busy = D.jobs.filter(j => s.jobs[j.id] > 0);
    const sign = busy.length ? busy.reduce((a, j) => (s.jobs[j.id] > s.jobs[a.id] ? j : a)).id : null;
    chron(s, `Sternbild ${n}: ${stars} ${stars === 1 ? 'Stern' : 'Sterne'}.`);
    const meta = JSON.parse(JSON.stringify(s.meta));
    meta.stars += stars;
    meta.starsFree += stars;
    meta.constellations.push({ name: n, run: meta.runs, sign, stars });
    meta.runs++;
    const next = create(meta);
    log(next, `Am Himmel leuchtet jetzt das Sternbild ${n}.`);
    return next;
  }

  function buyPerk(s, id) {
    const p = PERK[id];
    if (!p || s.meta.perks[id] || s.meta.starsFree < p.cost) return false;
    s.meta.starsFree -= p.cost;
    s.meta.perks[id] = true;
    dirty(s);
    log(s, `Himmelsgabe: ${p.name}.`);
    return true;
  }

  // Dauerauftrag an oder aus; geht ab Freundschaftsstufe orderLevel.
  function setStandingOrder(s, id, on) {
    if (!canTrade(s, id) || friendLevel(s, id) < R.orderLevel) return false;
    if (on) s.orders[id] ??= 0;
    else delete s.orders[id];
    return true;
  }

  function buyUpgrade(s, id) {
    const u = UPG[id];
    if (!upgradeVisible(s, id) || s.upgrades[id] || !canAfford(s, u.cost)) return false;
    pay(s, u.cost);
    s.upgrades[id] = true;
    dirty(s);
    log(s, `Verbessert: ${u.name}.`);
    return true;
  }

  // null: Tüftlerinnen ruhen.
  function setTinkerRecipe(s, id) {
    if (id !== null && !recipeOpen(s, id)) return false;
    s.tinkerRecipe = id;
    return true;
  }

  // null: Neue bleiben frei.
  function setAutoJob(s, id) {
    if (!s.tech.order || (id !== null && !(JOB[id] && isUnlocked(s, JOB[id])))) return false;
    s.autoJob = id;
    return true;
  }

  // ---------- Speichern ----------

  const save = s => JSON.stringify(s, (k, v) => (k[0] === '_' ? undefined : v));

  // Lädt einen Spielstand, auch aus Import-Text: nur bekannte, gültige Werte; was fehlt, bleibt 0.
  // ponytail: noch kein migrate() – das Mischen in einen frischen Stand deckt neue Inhalte ab;
  // migrate() kommt mit dem ersten echten Formatwechsel.
  function load(json) {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.v)) throw new Error('Kein Spielstand');
    const s = create();
    s.log = [];
    const ok = v => Number.isFinite(v) && v >= 0;
    const count = v => Math.min(Math.floor(v), 1e6); // Import-Schutz: absurde Anzahlen deckeln
    for (const k of ['time', 'savedAt', 'arrival', 'hungry', 'logSeq', 'born']) if (ok(raw[k])) s[k] = raw[k];
    s.time = Math.min(s.time, 1e10); // gut 300 Jahre Spielzeit; darüber bliebe die Uhr stehen
    s.arrival = Math.min(s.arrival, R.arrivalEvery);
    s.hungry = Math.min(s.hungry, R.hungerLeaveAfter);
    s.born = count(s.born);
    if (ok(raw.bats)) s.bats = count(raw.bats);
    s.isHungry = raw.isHungry === true;
    for (const id in s.res) if (ok(raw.res?.[id])) s.res[id] = raw.res[id];
    for (const id in s.bld) if (ok(raw.bld?.[id])) s.bld[id] = count(raw.bld[id]);
    for (const id in s.jobs) if (ok(raw.jobs?.[id])) s.jobs[id] = count(raw.jobs[id]);
    for (const id in TECH) if (raw.tech?.[id] === true) s.tech[id] = true;
    for (const k in raw.seen || {}) if (raw.seen[k] === true) s.seen[k] = true;
    for (const id in raw.places || {}) if (PLACE[id] && raw.places[id] === true) s.places[id] = true;
    for (const id in UPG) if (raw.upgrades?.[id] === true) s.upgrades[id] = true;
    if (JOB[raw.autoJob]) s.autoJob = raw.autoJob;
    if (RECIPE[raw.tinkerRecipe]) s.tinkerRecipe = raw.tinkerRecipe;
    if (ok(raw.craftAcc)) s.craftAcc = Math.min(raw.craftAcc, 1);
    for (const id in raw.friends || {}) if (NB[id] && ok(raw.friends[id])) s.friends[id] = Math.min(raw.friends[id], 1e6);
    for (const id in raw.orders || {}) if (NB[id] && ok(raw.orders[id])) s.orders[id] = Math.min(raw.orders[id], R.orderEvery);
    for (const id in SONG) if (raw.songs?.[id] === true) s.songs[id] = true;
    if (BLESS[raw.blessing]) s.blessing = raw.blessing;
    if (Number.isInteger(raw.blessCycle)) s.blessCycle = raw.blessCycle;
    s.blessLantern = raw.blessLantern === true;
    if (Array.isArray(raw.log)) {
      s.log = raw.log.filter(l => l && typeof l.text === 'string' && Number.isFinite(l.id))
        .slice(-R.logMax).map(l => ({ id: l.id, text: l.text }));
    }
    if (ok(raw.star)) s.star = Math.min(raw.star, R.starShow);
    if (ok(raw.starIn)) s.starIn = Math.min(raw.starIn, R.starEvery * 1.5);
    if (PLACE[raw.explore] && !s.places[raw.explore]) s.explore = raw.explore;
    for (const id in raw.echoIn || {}) {
      if (PLACE[id] && !s.places[id] && ok(raw.echoIn[id])) s.echoIn[id] = Math.min(raw.echoIn[id], PLACE[id].echo);
    }
    s.fertilize = raw.fertilize === true;
    const mt = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
    if (ok(mt.runs)) s.meta.runs = count(mt.runs);
    if (ok(mt.stars)) s.meta.stars = count(mt.stars);
    if (ok(mt.starsFree)) s.meta.starsFree = Math.min(count(mt.starsFree), s.meta.stars);
    for (const id in PERK) if (mt.perks?.[id] === true) s.meta.perks[id] = true;
    if (Array.isArray(mt.constellations)) {
      s.meta.constellations = mt.constellations.filter(c => c && typeof c.name === 'string').map(c => ({
        name: c.name.slice(0, R.nameMax), run: ok(c.run) ? count(c.run) : 0,
        sign: JOB[c.sign] ? c.sign : null, stars: ok(c.stars) ? count(c.stars) : 0,
      }));
    }
    if (Array.isArray(mt.chronicle)) {
      s.meta.chronicle = mt.chronicle.filter(c => c && typeof c.date === 'string' && typeof c.text === 'string')
        .slice(-R.chronicleMax).map(c => ({ date: c.date, run: ok(c.run) ? count(c.run) : 0, text: c.text }));
    }
    while (free(s) < 0) s.jobs[leaver(s)]--;
    dirty(s); // Gebäude, Jobs und Orte sind neu: Lager und Plätze erst jetzt rechnen
    if (ok(raw.young)) s.young = Math.min(count(raw.young), babyCap(s));
    for (const id in s.res) s.res[id] = Math.min(s.res[id], cap(s, id));
    return s;
  }

  const api = {
    create, log, calendar, effects, cap, batCap, babyCap, free, happiness, rates, leanFruit, arrivalBlock, step, simulate,
    needs, isUnlocked, price, canAfford, eta, click, build, research, assign, catchStar, placeState, explore, echoNeed,
    setFertilize, craft, craftCount, craftYield, recipeOpen, upgradeVisible, buyUpgrade, setTinkerRecipe, setAutoJob,
    friendLevel, tradeYield, canTrade, trade, setStandingOrder, singSong, chooseBlessing, blessActive, blessCost, festIn,
    ascend, buyPerk, offlineMax,
    save, load,
    rng: Math.random, // Zufall; Tests setzen hier eine feste Folge ein
  };
  return api;
})();

if (typeof module !== 'undefined') module.exports = Engine;
