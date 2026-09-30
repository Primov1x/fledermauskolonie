// Fledermauskolonie – Spiellogik ohne DOM. Im Browser global `Engine`, in Node per require().
const Engine = (() => {
  const D = typeof DATA !== 'undefined' ? DATA : require('./data.js');
  const R = D.rules;
  const byId = list => Object.assign(Object.create(null), Object.fromEntries(list.map(x => [x.id, x])));
  const RES = byId(D.resources), BLD = byId(D.buildings), JOB = byId(D.jobs), TECH = byId(D.techs);
  const CLICKS = new Set(D.clicks.map(c => c.id));

  // ---------- Spielstand ----------

  function create() {
    const s = {
      v: R.saveVersion, time: 0, savedAt: 0,
      res: {}, bld: {}, jobs: {}, tech: {}, seen: {},
      bats: 0, arrival: 0, hungry: 0, isHungry: false,
      log: [], logSeq: 0,
    };
    for (const r of D.resources) s.res[r.id] = 0;
    for (const b of D.buildings) s.bld[b.id] = 0;
    for (const j of D.jobs) s.jobs[j.id] = 0;
    log(s, R.startText);
    return s;
  }

  function log(s, text) {
    s.log.push({ id: ++s.logSeq, text });
    if (s.log.length > R.logMax) s.log.splice(0, s.log.length - R.logMax);
  }

  // ---------- Zeit ----------

  // Jeder Tag beginnt mit der Nacht. Gerechnet wird in Sekunden, damit Phasengrenzen exakt bleiben.
  function calendar(s) {
    const day = Math.floor(s.time / R.dayLength);
    const t = s.time % R.dayLength;
    const nightEnd = R.nightShare * R.dayLength;
    const night = t < nightEnd;
    const moonDay = day % R.moonDays;
    let acc = 0, moon = R.moonPhases[0][0];
    for (const [name, days] of R.moonPhases) {
      acc += days;
      if (moonDay < acc) { moon = name; break; }
    }
    return {
      day, night, moon,
      phaseLeft: night ? nightEnd - t : R.dayLength - t,
      season: R.seasons[Math.floor(day / R.seasonDays) % R.seasons.length],
      dayOfSeason: (day % R.seasonDays) + 1,
      year: Math.floor(day / (R.seasonDays * R.seasons.length)) + 1,
    };
  }

  // ---------- Werte ----------

  // Summe aller Effekte; zwischengespeichert, bis eine Aktion Gebäude, Jobs oder Forschung ändert.
  function effects(s) {
    if (s._eff) return s._eff;
    const e = {};
    const add = (fx, n) => { for (const k in fx) e[k] = (e[k] || 0) + fx[k] * n; };
    for (const b of D.buildings) if (s.bld[b.id]) add(b.effects, s.bld[b.id]);
    for (const j of D.jobs) if (s.jobs[j.id]) add(j.effects, s.jobs[j.id]);
    for (const t of D.techs) if (s.tech[t.id] && t.effects) add(t.effects, 1);
    return (s._eff = e);
  }
  const dirty = s => { s._eff = null; };

  const cap = (s, id) => RES[id].cap + (effects(s)[id + '.cap'] || 0);
  const batCap = s => effects(s)['bats.cap'] || 0;
  const free = s => s.bats - D.jobs.reduce((n, j) => n + s.jobs[j.id], 0);

  // Wer bei Hunger wegzieht (oder beim Laden gestrichen wird): erst ohne Job, dann andere Jobs,
  // Sammlerinnen zuletzt. Liefert die Job-Id oder null, wenn eine Fledermaus ohne Job gehen kann.
  function leaver(s) {
    if (free(s) >= 1) return null;
    const busy = D.jobs.filter(j => s.jobs[j.id] > 0);
    const others = busy.filter(j => !j.effects['fruit.night']);
    return (others.length ? others : busy).reduce((a, j) => (s.jobs[j.id] > s.jobs[a.id] ? j : a)).id;
  }

  // Zufriedenheit. Der Hunger-Abzug bremst nur die Träume, nicht das Sammeln (sonst Teufelskreis).
  function happiness(s, withHunger = true) {
    const z = 1 - R.crowdPenalty * Math.max(0, s.bats - R.crowdFree) - (withHunger && s.isHungry ? R.hungerPenalty : 0);
    return Math.max(R.happinessMin, z);
  }

  // Raten je Sekunde für Nacht oder Tag, Hunger schon abgezogen.
  function rates(s, night = calendar(s).night) {
    const e = effects(s), work = happiness(s, false), out = {};
    for (const r of D.resources) {
      out[r.id] = night ? (e[r.id + '.night'] || 0) * (1 + (e[r.id + '.bonus'] || 0)) * work : 0;
    }
    if (night) out.fruit -= s.bats * R.batHunger;
    else out.dreams += s.bats * R.batDream * (1 + (e['dreams.bonus'] || 0)) * happiness(s);
    return out;
  }

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
    const night = calendar(s).night;
    const r = rates(s, night);
    for (const id in r) {
      const v = s.res[id] + r[id] * dt;
      s.res[id] = Math.min(cap(s, id), Math.max(0, v));
      if (s.res[id] > 0) s.seen[id] = true;
      if (id === 'fruit' && night) hunger(s, v < 0 && s.bats > 0, dt);
    }
    if (night) arrivals(s, dt);
    s.time += dt;
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

  // Warum gerade niemand einzieht: 'full', 'hungry', 'food' oder null (es kann jemand kommen).
  // Die allererste Fledermaus kommt immer; danach nur, wenn der Nachtertrag für eine mehr reicht.
  function arrivalBlock(s) {
    if (s.bats >= batCap(s)) return 'full';
    if (s.isHungry) return 'hungry';
    if ((s.bats > 0 || s.seen.bats) && rates(s, true).fruit < R.batHunger) return 'food';
    return null;
  }

  function arrivals(s, dt) {
    if (arrivalBlock(s)) { s.arrival = 0; return; }
    s.arrival += dt;
    if (s.arrival < R.arrivalEvery) return;
    s.arrival -= R.arrivalEvery;
    s.bats++;
    log(s, s.seen.bats ? 'Eine Fledermaus zieht ein.' : 'Die erste Fledermaus zieht ein. Sie isst nachts Früchte.');
    s.seen.bats = true;
  }

  // Holt verpasste Zeit nach (höchstens offlineMax) und fasst zusammen, was sich geändert hat.
  function simulate(s, seconds) {
    const secs = Math.min(Math.max(0, seconds) || 0, R.offlineMax);
    const bats = s.bats, res = { ...s.res };
    step(s, secs);
    const diff = {};
    for (const id in s.res) diff[id] = s.res[id] - res[id];
    return { seconds: secs, bats: s.bats - bats, res: diff };
  }

  // ---------- Aktionen ----------

  const needs = item => [].concat(item.requires?.tech || []);
  const isUnlocked = (s, item) => needs(item).every(t => s.tech[t]);

  function price(s, kind, id) {
    if (kind === 'tech') return { ...TECH[id].cost };
    const b = BLD[id], out = {};
    for (const r in b.cost) out[r] = b.cost[r] * b.ratio ** s.bld[id];
    return out;
  }
  const canAfford = (s, cost) => Object.keys(cost).every(r => s.res[r] >= cost[r] - 1e-9);
  function pay(s, cost) { for (const r in cost) s.res[r] = Math.max(0, s.res[r] - cost[r]); }

  // Sekunden bis bezahlbar, gemittelt über Nacht und Tag. Infinity: so nie (kein Ertrag oder Lager zu klein).
  function eta(s, cost) {
    const night = rates(s, true), day = rates(s, false);
    let worst = 0;
    for (const r in cost) {
      const missing = cost[r] - s.res[r];
      if (missing <= 0) continue;
      if (cost[r] > cap(s, r)) return Infinity;
      const avg = night[r] * R.nightShare + day[r] * (1 - R.nightShare);
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
    if (!t || s.tech[id] || !isUnlocked(s, t) || !canAfford(s, t.cost)) return false;
    pay(s, t.cost);
    s.tech[id] = true;
    dirty(s);
    log(s, `Erforscht: ${t.name}.`);
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
    for (const k of ['time', 'savedAt', 'arrival', 'hungry', 'logSeq']) if (ok(raw[k])) s[k] = raw[k];
    s.time = Math.min(s.time, 1e10); // gut 300 Jahre Spielzeit; darüber bliebe die Uhr stehen
    s.arrival = Math.min(s.arrival, R.arrivalEvery);
    s.hungry = Math.min(s.hungry, R.hungerLeaveAfter);
    if (ok(raw.bats)) s.bats = count(raw.bats);
    s.isHungry = raw.isHungry === true;
    for (const id in s.res) if (ok(raw.res?.[id])) s.res[id] = raw.res[id];
    for (const id in s.bld) if (ok(raw.bld?.[id])) s.bld[id] = count(raw.bld[id]);
    for (const id in s.jobs) if (ok(raw.jobs?.[id])) s.jobs[id] = count(raw.jobs[id]);
    for (const id in TECH) if (raw.tech?.[id] === true) s.tech[id] = true;
    for (const k in raw.seen || {}) if (raw.seen[k] === true) s.seen[k] = true;
    if (Array.isArray(raw.log)) {
      s.log = raw.log.filter(l => l && typeof l.text === 'string' && Number.isFinite(l.id))
        .slice(-R.logMax).map(l => ({ id: l.id, text: l.text }));
    }
    while (free(s) < 0) s.jobs[leaver(s)]--;
    for (const id in s.res) s.res[id] = Math.min(s.res[id], cap(s, id));
    return s;
  }

  return {
    create, log, calendar, effects, cap, batCap, free, happiness, rates, arrivalBlock, step, simulate,
    needs, isUnlocked, price, canAfford, eta, click, build, research, assign, save, load,
  };
})();

if (typeof module !== 'undefined') module.exports = Engine;
