// node test.js        Prüfungen der Spiellogik
// node test.js tempo  Tempo-Bot: wann fallen die Meilensteine?
const assert = require('assert');
const D = require('./js/data.js');
const E = require('./js/engine.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} statt ${b}`);
const byId = (list, id) => list.find(x => x.id === id);

test('Daten: jede verwiesene Id existiert', () => {
  const ids = list => {
    const set = new Set(list.map(x => x.id));
    assert.strictEqual(set.size, list.length, 'doppelte Id');
    return set;
  };
  const res = ids(D.resources), bld = ids(D.buildings), jobs = ids(D.jobs), tech = ids(D.techs), places = ids(D.places);
  const FREE = new Set(['bats.cap', 'babies.cap', 'babies.bonus', 'star.auto', 'star.rate', 'happy.bonus', 'explore.discount',
    'craft.bonus', 'cap.bonus', 'work.bonus', 'winter.hunger', 'research.discount', 'trade.bonus', 'friend.bonus',
    'bless.bonus', 'all.bonus', 'arrival.speed']);
  const checkEffects = (fx, where) => {
    for (const k in fx) {
      const [a, b] = k.split('.');
      const known = FREE.has(k) || (a === 'job' && jobs.has(b)) || (a === 'bld' && bld.has(b))
        || (a === 'per' && byId(D.resources, b)?.perUnit) || (res.has(a) && ['night', 'cap', 'bonus'].includes(b));
      assert.ok(known, `${where}: unbekannter Effekt ${k}`);
    }
  };
  ids(D.upgrades);
  for (const x of [...D.buildings, ...D.techs, ...D.recipes, ...D.upgrades]) {
    for (const r in x.cost) assert.ok(res.has(r), `${x.id}: Kosten ${r}`);
  }
  for (const r of D.recipes) assert.ok(byId(D.resources, r.id)?.crafted, `Rezept ${r.id} ohne Ware`);
  for (const x of [...D.buildings, ...D.jobs, ...D.techs, ...D.places, ...D.upgrades]) checkEffects(x.effects || {}, x.id);
  for (const r of D.resources) checkEffects(r.perUnit || {}, r.id);
  const songs = ids(D.songs);
  ids(D.blessings);
  for (const x of [...D.songs, ...D.blessings]) checkEffects(x.effects, x.id);
  for (const g of D.songs) for (const r in g.cost) assert.ok(res.has(r), `${g.id}: Kosten ${r}`);
  for (const b of D.blessings) for (const g of [].concat(b.requires?.song || [])) assert.ok(songs.has(g), `${b.id}: Lied ${g}`);
  assert.strictEqual(D.rules.moonPhases.filter(p => p.fest).length, 1, 'genau ein Vollmond');
  for (const x of D.places) for (const r in x.cost || {}) assert.ok(res.has(r), `${x.id}: Kosten ${r}`);
  ids(D.perks);
  for (const x of D.perks) {
    checkEffects(x.effects || {}, x.id);
    assert.ok(x.desc.length < 90, `${x.id}: Beschreibung zu lang`);
    const st = x.start || {};
    for (const r in st.res || {}) assert.ok(res.has(r), `${x.id}: ${r}`);
    for (const b in st.bld || {}) assert.ok(bld.has(b), `${x.id}: ${b}`);
    for (const t of st.tech || []) assert.ok(tech.has(t), `${x.id}: ${t}`);
    for (const q of st.places || []) assert.ok(places.has(q), `${x.id}: ${q}`);
  }
  for (const n of D.constellationNames) assert.ok(n.length <= D.rules.nameMax, `Name zu lang: ${n}`);
  ids(D.neighbors);
  for (const n of D.neighbors) {
    assert.ok(places.has(n.place), `${n.id}: Ort ${n.place}`);
    for (const r of [...Object.keys(n.wants), ...Object.keys(n.gives)]) assert.ok(res.has(r), `${n.id}: ${r}`);
    checkEffects(n.help, n.id);
    assert.ok(n.desc.length < 90, `${n.id}: Beschreibung zu lang`);
  }
  for (const x of [...D.resources, ...D.buildings, ...D.jobs, ...D.techs, ...D.places, ...D.upgrades]) {
    for (const t of [].concat(x.requires?.tech || [])) assert.ok(tech.has(t), `${x.id}: Forschung ${t}`);
    for (const p of [].concat(x.requires?.place || [])) assert.ok(places.has(p), `${x.id}: Ort ${p}`);
  }
  for (const c of D.clicks) assert.ok(res.has(c.id), `Klick ${c.id}`);
  for (const x of [...D.buildings, ...D.techs, ...D.places, ...D.upgrades]) assert.ok(x.desc.length < 90, `${x.id}: Beschreibung zu lang`);
  for (const season of D.rules.seasons) for (const r in season.mult) assert.ok(res.has(r), `${season.name}: ${r}`);
  for (const ph of D.rules.moonPhases) for (const r in ph.bonus) assert.ok(res.has(r), `${ph.name}: ${r}`);
});

test('Kalender aus der Spielzeit', () => {
  const s = E.create();
  let c = E.calendar(s);
  assert.deepStrictEqual([c.night, c.season, c.dayOfSeason, c.year, c.moon], [true, 'Frühling', 1, 1, 'Neumond']);
  assert.strictEqual(c.phaseLeft, 30);
  s.time = 30;
  c = E.calendar(s);
  assert.deepStrictEqual([c.night, c.phaseLeft], [false, 30]);
  s.time = 60 * 10;
  c = E.calendar(s);
  assert.deepStrictEqual([c.season, c.dayOfSeason], ['Sommer', 1]);
  s.time = 60 * 40;
  assert.strictEqual(E.calendar(s).year, 2);
  s.time = 60 * 4;
  assert.strictEqual(E.calendar(s).moon, 'Vollmond');
  s.time = 60 * 7 + 1;
  assert.strictEqual(E.calendar(s).moon, 'abnehmender Mond');
  s.time = 60 * 8;
  assert.strictEqual(E.calendar(s).moon, 'Neumond');
});

test('Nacht: Bäume und Jobs arbeiten, Fledermäuse essen', () => {
  const s = E.create();
  s.bld.fruitTree = 2; s.bats = 1; s.jobs.twigCarrier = 1;
  E.step(s, 30);
  near(s.res.fruit, 15, 'Früchte (2 × 0,5 − 0,5 = +0,5/s)');
  near(s.res.twigs, 9, 'Zweige (0,3/s)');
  near(s.res.dreams, 0, 'Träume nachts');
  assert.strictEqual(s.isHungry, false);
  const even = E.create();
  even.bld.fruitTree = 1; even.bats = 1;                     // 0,5 wächst, 0,5 wird gegessen
  E.step(even, 5);
  assert.strictEqual(even.isHungry, false);                  // genau aufgegessen ist nicht hungrig
});

test('Tag: Fledermäuse träumen und essen nichts', () => {
  const s = E.create();
  s.time = 30; s.bats = 2; s.res.fruit = 10;
  E.step(s, 30);
  near(s.res.dreams, 6, 'Träume (2 × 0,1 × 30)');
  near(s.res.fruit, 10, 'Früchte');
});

test('Lager deckelt, Klick am Limit geht nicht', () => {
  const s = E.create();
  s.res.fruit = 99.5; s.bld.fruitTree = 10;
  E.step(s, 10);
  near(s.res.fruit, 100, 'Früchte am Limit');
  assert.strictEqual(E.click(s, 'fruit'), false);
  assert.strictEqual(E.click(s, 'twigs'), true);
  near(s.res.twigs, 1, 'Zweig geklickt');
  assert.strictEqual(E.click(s, 'dreams'), false);
});

test('Preise steigen mit dem Faktor', () => {
  const s = E.create();
  s.res.twigs = 60;
  assert.ok(E.build(s, 'roost'));
  assert.ok(E.build(s, 'roost'));
  near(s.res.twigs, 34, 'bezahlt (10 + 16)');
  near(E.price(s, 'building', 'roost').twigs, 25.6, 'dritter Schlafplatz');
  s.res.twigs = 20;
  assert.strictEqual(E.build(s, 'roost'), false);
  assert.strictEqual(E.batCap(s), 4);
  s.res.twigs = 60;
  assert.strictEqual(E.build(s, 'larder'), false);   // bezahlbar, aber noch nicht erforscht
});

test('Forschung kostet Träume und schaltet frei', () => {
  const s = E.create();
  assert.strictEqual(E.isUnlocked(s, byId(D.techs, 'orchard')), false);
  s.res.dreams = 10;
  assert.strictEqual(E.research(s, 'mooncalendar'), false);   // zu wenig Träume
  s.res.dreams = 50;
  assert.strictEqual(E.research(s, 'orchard'), false);
  assert.ok(E.research(s, 'mooncalendar'));
  near(s.res.dreams, 35, 'Träume nach Mondkalender');
  s.res.dreams = 45;
  assert.ok(E.research(s, 'orchard'));
  s.res.dreams = 50;
  assert.strictEqual(E.research(s, 'orchard'), false);   // schon erforscht
  assert.ok(E.isUnlocked(s, byId(D.buildings, 'larder')));
  assert.ok(E.isUnlocked(s, byId(D.jobs, 'gatherer')));
  assert.match(s.log.at(-1).text, /Erforscht: Obstbau/);
});

test('Jobs verteilen', () => {
  const s = E.create();
  s.bats = 2;
  assert.strictEqual(E.assign(s, 'gatherer', 1), false);      // frei, aber noch nicht erforscht
  assert.ok(E.assign(s, 'twigCarrier', 1));
  assert.ok(E.assign(s, 'twigCarrier', 1));
  assert.strictEqual(E.assign(s, 'twigCarrier', 1), false);   // keine frei
  assert.ok(E.assign(s, 'twigCarrier', -1));
  assert.strictEqual(E.free(s), 1);
  assert.strictEqual(E.assign(s, 'twigCarrier', 0), false);   // nur +1 oder -1
  s.tech.orchard = true;
  assert.strictEqual(E.assign(s, 'gatherer', -1), false);     // niemand zum Abziehen
  const before = E.rates(s, true).fruit;
  assert.ok(E.assign(s, 'gatherer', 1));
  near(E.rates(s, true).fruit - before, 1, 'Sammlerin wirkt sofort');
  assert.strictEqual(E.assign(s, 'gatherer', 1), false);      // keine mehr frei
});

test('Zuzug nur nachts und nur mit freiem Platz', () => {
  const s = E.create();
  s.bld.roost = 1; s.bld.fruitTree = 3; s.res.fruit = 100;
  E.step(s, 20);
  assert.strictEqual(s.bats, 1);
  assert.match(s.log.at(-1).text, /erste Fledermaus/);
  E.step(s, 40);                    // Rest der Nacht und ganzer Tag
  assert.strictEqual(s.bats, 1);
  E.step(s, 10);                    // 10 s neue Nacht + 10 s aus der ersten Nacht
  assert.strictEqual(s.bats, 2);
  E.step(s, 60);
  assert.strictEqual(s.bats, 2);    // voll
});

test('Zuzug: die erste kommt immer, weitere nur mit genug Früchten', () => {
  const s = E.create();
  s.bld.roost = 2; s.res.fruit = 100;
  E.step(s, 20);
  assert.strictEqual(s.bats, 1);                           // die erste auch ohne Obstbaum
  E.step(s, 70);                                           // Rest der Nacht, Tag, nächste Nacht
  assert.strictEqual(s.bats, 1);                           // ohne Überschuss keine zweite
  assert.strictEqual(E.arrivalBlock(s), 'food');
  assert.ok(E.build(s, 'fruitTree') && E.build(s, 'fruitTree'));   // 1 Frucht/s, die erste isst 0,5
  assert.strictEqual(E.arrivalBlock(s), null);
  E.step(s, 50);                                           // Tag, dann 20 s Nacht
  assert.strictEqual(s.bats, 2);
});

test('Hunger: bremst Träume, nicht das Sammeln; nach 30 s zieht eine weg', () => {
  const s = E.create();
  s.bld.roost = 1; s.bats = 2; s.jobs.twigCarrier = 2;
  E.step(s, 1);
  assert.strictEqual(s.isHungry, true);
  assert.strictEqual(E.arrivalBlock(s), 'full');
  near(E.happiness(s), 0.7, 'Zufriedenheit');
  near(E.rates(s, true).twigs, 0.6, 'Sammeln ungebremst');
  near(E.rates(s, false).dreams, 2 * 0.1 * 0.7, 'Träume gebremst');
  E.step(s, 29);
  assert.strictEqual(s.bats, 1);
  assert.strictEqual(s.jobs.twigCarrier, 1);
  near(E.rates(s, true).twigs, 0.3, 'eine Trägerin weniger');
  assert.strictEqual(E.arrivalBlock(s), 'hungry');
  assert.match(s.log.at(-1).text, /zieht weg/);
});

test('Hunger: eine satte Pause setzt die Frist zurück', () => {
  const s = E.create();
  s.bld.roost = 1; s.bats = 2; s.jobs.twigCarrier = 2;
  E.step(s, 20);                                           // 20 s hungrig
  s.res.fruit = 30; E.step(s, 10);                         // satt bis Nachtende
  s.res.fruit = 0; E.step(s, 50);                          // Tag, dann wieder 20 s hungrig
  assert.strictEqual(s.bats, 2);                           // nie 30 s am Stück hungrig
});

test('Wegzug bei Hunger: erst ohne Job, Sammlerinnen zuletzt', () => {
  const after = jobs => {
    const s = E.create();
    s.tech.orchard = true; s.bld.roost = 2; s.bats = 3; Object.assign(s.jobs, jobs);
    E.step(s, 30);                                          // 1 Frucht/s gesammelt, 1,5 gegessen
    return [s.bats, s.jobs.gatherer, s.jobs.twigCarrier];
  };
  assert.deepStrictEqual(after({ gatherer: 1, twigCarrier: 1 }), [2, 1, 1]);   // die ohne Job geht
  assert.deepStrictEqual(after({ gatherer: 1, twigCarrier: 2 }), [2, 1, 1]);   // dann eine Zweigträgerin
  assert.deepStrictEqual(after({ gatherer: 2, twigCarrier: 0 }).slice(0, 2), [4, 2]);   // satt: eine Neue zieht ein
});

test('Zufriedenheit: Gedränge bremst alles, Traumfänger hilft', () => {
  const s = E.create();
  s.bats = 30; s.jobs.twigCarrier = 1; s.bld.dreamcatcher = 1;
  near(E.happiness(s), 0.9, 'Gedränge (30 Fledermäuse: 20 × 0,5 %)');
  near(E.rates(s, true).twigs, 0.3 * 0.9, 'Sammeln × 0,9');
  near(E.rates(s, false).dreams, 30 * 0.1 * 1.05 * 0.9, 'Träume × Traumfänger × 0,9');
});

test('8 Std. offline: eine satte Kolonie bleibt satt', () => {
  const s = E.create();
  s.tech.orchard = true; s.seen.bats = true; s.res.fruit = 50;
  s.bld.roost = 5; s.bats = 6; s.jobs.gatherer = 4; s.jobs.twigCarrier = 2;   // +1 Frucht/s nachts
  const lines = s.logSeq;
  E.simulate(s, 8 * 3600);
  assert.deepStrictEqual([s.bats, s.jobs.gatherer, s.jobs.twigCarrier], [8, 4, 2]);   // zwei Neue, dann reicht es genau
  assert.strictEqual(s.isHungry, false);
  assert.ok(s.logSeq - lines <= 3, `${s.logSeq - lines} neue Log-Zeilen`);
});

test('Speichern und Laden', () => {
  const s = E.create();
  s.res.fruit = 12.5; s.bld.fruitTree = 3; s.bats = 2; s.jobs.twigCarrier = 1; s.tech.mooncalendar = true; s.seen.fruit = true;
  s.time = 1234.5; s.savedAt = 1790000000000; s.arrival = 7; s.hungry = 12; s.isHungry = true;
  assert.strictEqual(E.save(E.load(E.save(s))), E.save(s));   // jedes Feld kommt zurück
  const old = E.load(JSON.stringify({ v: 1, res: { fruit: 5 } }));
  assert.strictEqual(old.res.fruit, 5);
  assert.strictEqual(old.bld.roost, 0);
  assert.throws(() => E.load('{"hallo":1}'));
  assert.throws(() => E.load('kaputt'));
  const odd = E.load(JSON.stringify({ v: 1, bats: 1, jobs: { twigCarrier: 5 }, res: { fruit: 1e9 } }));
  assert.strictEqual(E.free(odd), 0);
  assert.strictEqual(odd.res.fruit, 100);
  const huge = E.load(JSON.stringify({ v: 1, bats: 1, jobs: { twigCarrier: 1e300 } }));   // darf nicht hängen
  assert.strictEqual(E.free(huge), 0);
  const long = E.create();
  for (let i = 0; i < 150; i++) E.log(long, 'Zeile ' + i);
  assert.deepStrictEqual([long.log.length, long.log[0].text], [D.rules.logMax, 'Zeile 50']);   // älteste fallen raus
  const wild = E.load(JSON.stringify({ v: 1, time: 1e300, arrival: 1e9, hungry: 1e9 }));
  assert.ok(wild.time <= 1e10 && wild.arrival <= D.rules.arrivalEvery && wild.hungry <= D.rules.hungerLeaveAfter);
});

test('Unbekannte Namen tun nichts', () => {
  const s = E.create();
  s.res.fruit = s.res.twigs = s.res.dreams = 50; s.bats = 1;
  const before = E.save(s);
  for (const id of ['constructor', 'toString', '__proto__', 'nope']) {
    assert.strictEqual(E.build(s, id) || E.research(s, id) || E.assign(s, id, 1) || E.click(s, id), false, id);
  }
  assert.strictEqual(E.save(s), before);
});

test('Offline: simulate wie viele step(1), höchstens 3 Tage', () => {
  const setup = () => {
    const s = E.create();
    s.bld.fruitTree = 4; s.bld.roost = 3; s.res.fruit = 50; s.res.twigs = 5;
    return s;
  };
  const a = setup(), b = setup();
  const sum = E.simulate(a, 3600);
  for (let i = 0; i < 3600; i++) E.step(b, 1);
  assert.strictEqual(E.save(a), E.save(b));
  assert.strictEqual(sum.seconds, 3600);
  assert.strictEqual(sum.bats, a.bats);
  const c = setup();
  assert.strictEqual(E.simulate(c, 10 * 86400).seconds, D.rules.offlineMax);
  assert.strictEqual(c.time, D.rules.offlineMax);
  assert.strictEqual(E.simulate(E.create(), NaN).seconds, 0);
});

test('Zeit bis bezahlbar', () => {
  const s = E.create();
  s.bld.fruitTree = 2;                                        // nachts 1 Frucht/s, im Schnitt 0,5/s
  assert.strictEqual(E.eta(s, { fruit: 0 }), 0);
  near(E.eta(s, { fruit: 10 }), 20, 'Sekunden bis 10 Früchte');
  assert.strictEqual(E.eta(s, { fruit: 500 }), Infinity);    // Lager zu klein
  assert.strictEqual(E.eta(s, { twigs: 5 }), Infinity);      // kein Ertrag
  const hungry = E.create();
  hungry.bats = 2;                                            // essen nachts, nichts wächst
  assert.strictEqual(E.eta(hungry, { fruit: 10 }), Infinity);
  hungry.res.twigs = 10;
  assert.strictEqual(E.eta(hungry, { twigs: 5 }), 0);        // schon genug da
});

// ---------- Etappe 2: Jahreszeiten, Mond, Sternschnuppen ----------

function withRng(values, fn) {
  const old = E.rng;
  let i = 0;
  E.rng = () => (i < values.length ? values[i++] : 0.5);
  try { fn(); } finally { E.rng = old; }
}

test('Kalender: Nachtanteil je Jahreszeit, Mondphasen', () => {
  const s = E.create();
  const at = day => { s.time = day * 60; return E.calendar(s); };
  assert.deepStrictEqual([at(0).phaseLeft, at(10).phaseLeft, at(20).phaseLeft, at(30).phaseLeft], [30, 24, 30, 36]);
  assert.deepStrictEqual([at(10).season, at(30).season, at(40).season, at(40).year], ['Sommer', 'Winter', 'Frühling', 2]);
  s.time = 10 * 60 + 24;                                        // Sommer: nach 24 s ist die Nacht vorbei
  assert.strictEqual(E.calendar(s).night, false);
  assert.deepStrictEqual([at(4).moon, at(6).moon, at(8).moon], ['Vollmond', 'abnehmender Mond', 'Neumond']);
});

test('Jahreszeiten: Früchte, Nachtarbeit und Hunger; Vollmond +15 %', () => {
  const s = E.create();
  s.bld.fruitTree = 2; s.bats = 1; s.jobs.twigCarrier = 1;
  const at = day => { s.time = day * 60; return E.rates(s, true); };
  near(at(0).fruit, 1 - 0.5, 'Frühling');
  near(at(10).fruit, 1.25 - 0.5, 'Sommer ×1,25');
  near(at(22).fruit, 1.5 - 0.5, 'Herbst ×1,5');
  near(at(30).fruit, 0.25 - 0.5 * 0.25, 'Winter: Früchte ×0,25, Hunger ×0,25');
  near(at(30).twigs, 0.3 * 0.25, 'Winter: Nachtarbeit ×0,25');
  near(at(4).fruit, 1.15 - 0.5, 'Vollmond: Früchte +15 %');
  near(at(4).twigs, 0.3, 'Vollmond: Zweige gleich');
});

test('Winterschlaf: Träume auch nachts, niemand zieht ein', () => {
  const s = E.create();
  s.time = 30 * 60; s.bats = 2; s.seen.bats = true; s.bld.roost = 3; s.bld.fruitTree = 10; s.res.fruit = 100;
  near(E.rates(s, true).dreams, 2 * 0.1, 'Träume nachts im Winter');
  assert.strictEqual(E.arrivalBlock(s), 'winter');
  E.step(s, 30);
  assert.strictEqual(s.bats, 2);
});

test('Sternschnuppen: nachts ab Mondkalender, 15 s zum Antippen, +1 Sternkarte', () => {
  const s = E.create();
  s.starIn = 1;
  E.step(s, 1);
  assert.strictEqual(s.star, 0);                                  // ohne Mondkalender keine
  s.tech.mooncalendar = true;
  withRng([0.5, 0.5], () => E.step(s, 1));                        // fällt; nächste in 90 × (0,5 + 0,5) s Nacht
  near(s.star, 15, 'sichtbar');
  near(s.starIn, 90, 'nächste');
  assert.match(s.log.at(-1).text, /Sternschnuppe/);
  E.step(s, 5);
  assert.ok(E.catchStar(s));
  assert.deepStrictEqual([s.res.starmaps, s.star], [1, 0]);
  assert.strictEqual(E.catchStar(s), false);                      // schon gefangen
  s.starIn = 1;
  withRng([0.5, 0.5], () => E.step(s, 1));
  E.step(s, 15);                                                  // verfliegt
  assert.strictEqual(E.catchStar(s), false);
  s.time = 40; s.starIn = 1;                                      // Tag: keine Sternschnuppe
  E.step(s, 5);
  assert.deepStrictEqual([s.star, s.starIn], [0, 1]);
});

test('Chronik: erste Fledermaus, erste Forschung, erster Winter überstanden', () => {
  const s = E.create();
  s.bld.roost = 1; s.bld.fruitTree = 3; s.res.fruit = 100;
  E.step(s, 20);
  s.res.dreams = 20;
  assert.ok(E.research(s, 'mooncalendar'));
  s.time = 40 * 60 - 1;                                           // letzte Sekunde des ersten Winters
  E.step(s, 2);
  assert.deepStrictEqual(s.meta.chronicle.map(c => c.text),
    ['Die erste Fledermaus zieht ein.', 'Erste Forschung: Mondkalender.', 'Der erste Winter ist überstanden.']);
  assert.deepStrictEqual([s.meta.chronicle[0].date, s.meta.chronicle[2].date], ['Jahr 1, Frühling', 'Jahr 2, Frühling']);
});

test('Speichern und Laden mit Sternschnuppe und Chronik', () => {
  const s = E.create();
  s.star = 7; s.starIn = 33; s.res.starmaps = 2; s.seen.starmaps = true;
  s.meta.chronicle.push({ date: 'Jahr 1, Frühling', run: 0, text: 'Die erste Fledermaus zieht ein.' });
  assert.strictEqual(E.save(E.load(E.save(s))), E.save(s));
  const bad = E.load(JSON.stringify({ v: 1, star: 99, starIn: -3,
    meta: { chronicle: [{ date: 1, text: 'x' }, { date: 'Jahr 1, Sommer', run: 0, text: 'ok' }] } }));
  assert.deepStrictEqual([bad.star, bad.starIn, bad.meta.chronicle.length], [15, D.rules.starEvery, 1]);
});

// ---------- Etappe 3: Erkundung, Rohstoffe, Luxus, Babyzeit ----------

// Mit Echoortung, vier Fledermäusen und Platz für vier.
function explorer() {
  const s = E.create();
  Object.assign(s.tech, { mooncalendar: true, orchard: true, echolocation: true });
  s.bats = 4; s.seen.bats = true; s.bld.roost = 2; s._eff = null;
  return s;
}

test('Erkundung: Echo fließt aus dem Lager ins Ziel, fertig heißt entdeckt, das nächste Ziel startet', () => {
  const s = explorer();
  assert.deepStrictEqual(['brook', 'meadow', 'cave'].map(id => E.placeState(s, id)), ['open', 'open', 'hidden']);
  s.time = 2 * 60;                                              // zunehmender Mond, Nacht
  s.res.echo = 20; s.res.fruit = 100;
  assert.ok(E.explore(s, 'brook'));
  for (let i = 0; i < 4; i++) assert.ok(E.assign(s, 'scout', 1));   // 4 × 0,2 = 0,8 Echo/s nachts
  E.step(s, 1);
  near(s.echoIn.brook, 20.8, 'Lager zuerst, dann das neue Echo');
  near(s.res.echo, 0, 'Lager leer');
  E.step(s, 12);
  assert.ok(s.places.brook);
  assert.strictEqual(s.explore, 'meadow');
  near(s.res.echo, 0.4, 'Rest bleibt im Lager');
  assert.match(s.log.at(-1).text, /^Entdeckt: Bachufer/);
  assert.ok(s.meta.chronicle.some(c => c.text === 'Entdeckt: Bachufer.'));
  assert.deepStrictEqual(['brook', 'meadow', 'cave', 'barn'].map(id => E.placeState(s, id)), ['done', 'current', 'open', 'hidden']);
  assert.strictEqual(E.explore(s, 'barn'), false);              // noch „???“
  assert.ok(E.explore(s, null));                                // ohne Ziel füllt Echo das Lager
  s.time = 0;
  near(E.rates(s, true).echo, 0.8 * 1.25, 'Neumond: Echo +25 %');
});

test('Freischaltungen über Orte: Bachufer, Blumenwiese, Tropfsteinhöhle', () => {
  const s = explorer();
  const tech = id => byId(D.techs, id);
  assert.strictEqual(E.isUnlocked(s, tech('mosscare')), false);
  s.places.brook = true;
  assert.ok(E.isUnlocked(s, tech('mosscare')));
  s.places.meadow = true; s.places.cave = true;
  assert.ok(E.isUnlocked(s, tech('pollination')) && E.isUnlocked(s, tech('cavelore')));
  const fresh = E.create();
  fresh.tech.mooncalendar = true; fresh.tech.orchard = true; fresh.res.dreams = 80;
  assert.ok(E.research(fresh, 'echolocation'));
  assert.strictEqual(fresh.explore, 'brook');                   // erstes Ziel startet von selbst
});

test('Luxus: Zufriedenheit +10 % je Sorte mit Bestand; Nektar wird nachts genascht, Kristalle nicht', () => {
  const s = E.create();
  s.bats = 4; s.jobs.twigCarrier = 4; s.res.fruit = 100;
  near(E.happiness(s), 1, 'ohne Luxus');
  s.res.nectar = 1.02; s.res.crystals = 1;
  near(E.happiness(s), 1.2, 'zwei Sorten');
  E.step(s, 10);                                                // Nacht: 4 × 0,001 × 10 = 0,04 Nektar
  near(s.res.nectar, 1.02 - 0.04, 'Nektar genascht');
  near(s.res.crystals, 1, 'Kristalle funkeln nur');
  near(E.happiness(s), 1.1, 'Nektar unter 1: nur noch eine Sorte');
});

test('Guano tagsüber, im Winter ×0,25; Düngen: Obstbäume +50 %, solange Guano da ist', () => {
  const s = E.create();
  s.time = 40; s.bats = 4; s.young = 2;
  near(E.rates(s, false).guano, 4 * 0.05 + 2 * 0.02, 'Tag');
  s.time = 30 * 60 + 40;                                        // Winter, Tag
  near(E.rates(s, false).guano, (4 * 0.05 + 2 * 0.02) * 0.25, 'Winter');
  assert.strictEqual(E.setFertilize(E.create(), true), false);  // erst ab Düngung
  const f = E.create();
  f.tech.fertilizing = true; f.bld.fruitTree = 4; f.time = 120; f._eff = null;
  assert.ok(E.setFertilize(f, true));
  f.res.guano = 1;
  near(E.rates(f, true).fruit, 4 * 0.5 * 1.5, 'gedüngt');
  near(E.rates(f, true).guano, -4 * 0.02, 'Verbrauch');
  E.step(f, 13);                                                // 0,08/s: nach 12,5 s ist der Guano weg
  near(E.rates(f, true).fruit, 4 * 0.5, 'ohne Guano ungedüngt');
});

test('Nachtblumen: Nektar und Obstbäume +2 % je Beet; Kieselgrube, Höhlennische, Kristalle', () => {
  const s = E.create();
  Object.assign(s.tech, { pollination: true, cavelore: true });
  Object.assign(s.bld, { fruitTree: 2, nightflowers: 3, pebblePit: 1, niche: 2 });
  s.bats = 2; s.jobs.pebbler = 2; s.time = 120; s._eff = null;
  const r = E.rates(s, true);
  near(r.nectar, 3 * 0.05 * 1.5, 'Nektar im Frühling ×1,5');
  near(r.fruit, 2 * 0.5 * 1.06 - 2 * 0.5, 'Obstbäume +6 %, zwei essen');
  near(r.pebbles, 2 * 0.25 * 1.2, 'Kieselgrube +20 %');
  near(r.crystals, 2 * 0.002 * 1.2, 'Kristalle');
  assert.strictEqual(E.batCap(s), 6);
});

test('Babyzeit: Junge an Frühlingstag 8, halb so hungrig und verträumt, im Herbst groß oder Auszug', () => {
  const s = E.create();
  s.tech.broodcare = true; s.bld.nursery = 1; s.bld.roost = 5; s.bats = 9; s.seen.bats = true;
  s.bld.fruitTree = 20; s.res.fruit = 100; s._eff = null;       // Platz für 10, genug Früchte
  s.time = 7 * 60 - 1;                                          // letzte Sekunde von Tag 7
  E.step(s, 1);
  assert.strictEqual(s.young, 2);                               // ⌊9 × 0,25⌋ = 2, zwei Babyplätze
  assert.match(s.log.at(-1).text, /Junge/);
  assert.ok(s.meta.chronicle.some(c => c.text === 'Das erste Junge kommt zur Welt.'));
  near(E.rates(s, true).fruit, 20 * 0.5 - 9 * 0.5 - 2 * 0.25, 'Junge essen halb so viel');
  near(E.rates(s, false).dreams, 9 * 0.1 + 2 * 0.05, 'Junge träumen halb so viel');
  E.step(s, 60);
  assert.strictEqual(s.young, 2);                               // nur einmal je Frühling
  s.bats = 9;                                                   // die Nacht hat eine Neue gebracht; wieder ein Platz frei
  s.time = 20 * 60 - 1;                                         // letzte Sekunde vor dem Herbst
  E.step(s, 1);
  assert.deepStrictEqual([s.bats, s.young], [10, 0]);           // ein Platz frei: eins bleibt
  assert.match(s.log.at(-1).text, /1 bleibt, 1 sucht sich ein eigenes Zuhause/);
});

test('Speichern und Laden mit Erkundung, Jungen und Düngen', () => {
  const s = explorer();
  s.bld.nursery = 1; s._eff = null;
  Object.assign(s, { explore: 'meadow', echoIn: { meadow: 12.5 }, young: 2, fertilize: true, born: 1 });
  s.places.brook = true;
  assert.strictEqual(E.save(E.load(E.save(s))), E.save(s));
  const bad = E.load(JSON.stringify({ v: 1, explore: 'nope', echoIn: { brook: -1, cave: 1e9, x: 5 }, young: 1e9,
    fertilize: 'ja', born: -2, places: { brook: true, nope: true } }));
  assert.deepStrictEqual([bad.explore, bad.echoIn, bad.young, bad.fertilize, bad.born, bad.places],
    [null, { cave: 120 }, 0, false, 0, { brook: true }]);
});

// ---------- Etappe 4: Werkstatt, Upgrades, Tüftlerin, Ordnung ----------

// Mit Handwerk, einer Werkstatt und gut gefüllten Lagern (fünf Vorratshöhlen).
function crafter() {
  const s = E.create();
  Object.assign(s.tech, { mooncalendar: true, orchard: true, echolocation: true, mosscare: true, cavelore: true, crafting: true });
  s.bld.workshop = 1; s.bld.larder = 5; s._eff = null;
  Object.assign(s.res, { twigs: 500, pebbles: 300, moss: 200, dreams: 50 });
  return s;
}

test('Werkstatt: Herstellen braucht eine Werkstatt, +1/+10/max, Ausbeute +6 % je Werkstatt', () => {
  const s = crafter();
  s.bld.workshop = 0; s._eff = null;
  assert.strictEqual(E.craft(s, 'wicker', 1), false);             // ohne Werkstatt nicht
  s.bld.workshop = 2; s._eff = null;
  assert.ok(E.craft(s, 'wicker', 1));
  near(s.res.wicker, 1.12, 'Ausbeute +12 %');
  near(s.res.twigs, 450, 'Zweige bezahlt');
  assert.ok(E.craft(s, 'wicker', 10));                           // +10 macht, so viel geht: neun
  near(s.res.twigs, 0, 'Zweige leer');
  near(s.res.wicker, 10 * 1.12, 'zehn Geflecht');
  assert.strictEqual(E.craft(s, 'wicker', 1), false);
  assert.ok(E.craft(s, 'slab', 'max'));
  near(s.res.slab, 6 * 1.12, 'max: 300 Kiesel sind sechs Platten');
  near(s.res.pebbles, 0, 'Kiesel bezahlt');
  for (const bad of [0, -1, 1.5, '3', 'alles']) assert.strictEqual(E.craft(s, 'slab', bad), false);
  assert.strictEqual(E.craft(s, 'cushion', 1), false);           // Polsterei fehlt
  assert.strictEqual(E.craft(s, 'fruit', 1), false);             // kein Rezept
});

test('Moospolster: braucht Polsterei und ein Geflecht als Zutat', () => {
  const s = crafter();
  s.res.wicker = 2;
  assert.strictEqual(E.craft(s, 'cushion', 1), false);
  s.tech.upholstery = true;
  assert.ok(E.craft(s, 'cushion', 'max'));                       // Geflecht reicht für zwei
  near(s.res.cushion, 2 * 1.06, 'zwei Polster');
  near(s.res.moss, 120, '80 Moos');
  near(s.res.wicker, 0, 'Geflecht verbraucht');
});

test('Upgrades: sichtbar mit Werkstatt und freigeschalteten Kosten, nur einmal, mit Wirkung', () => {
  const s = crafter();
  s.bld.workshop = 0; s._eff = null;
  assert.strictEqual(E.upgradeVisible(s, 'straps'), false);      // keine Werkstatt
  s.bld.workshop = 1; s._eff = null;
  assert.ok(E.upgradeVisible(s, 'straps'));
  assert.strictEqual(E.upgradeVisible(s, 'mossbeds'), false);    // Moospolster noch nicht freigeschaltet
  assert.strictEqual(E.upgradeVisible(s, 'fertileBeds'), false); // braucht Bestäubung und Düngung
  s.bats = 2; s.jobs.twigCarrier = 2; s.time = 120; s.res.fruit = 100;
  near(E.rates(s, true).twigs, 0.6, 'ohne Gurte');
  s.res.wicker = 10; s.res.dreams = 300;
  assert.ok(E.buyUpgrade(s, 'straps'));
  assert.deepStrictEqual([s.res.wicker, s.res.dreams], [0, 0]);
  near(E.rates(s, true).twigs, 0.6 * 1.25, 'Tragegurte +25 %');
  assert.strictEqual(E.buyUpgrade(s, 'straps'), false);          // nur einmal
  s.res.wicker = 25; s.res.dreams = 700;
  assert.ok(E.buyUpgrade(s, 'bigBaskets'));
  assert.strictEqual(E.cap(s, 'twigs'), 60 + 5 * 100 * 1.5);     // Vorratshöhlen +50 %
  assert.strictEqual(E.buyUpgrade(s, 'nope'), false);
});

test('Tüftlerin: nachts aus Überschuss (Zutaten mit Lager ab 90 %), Waren immer, tagsüber nichts', () => {
  const s = crafter();
  Object.assign(s.tech, { tinkering: true, upholstery: true });
  s.bats = 5; s.jobs.tinkerer = 5; s.res.fruit = 100; s._eff = null;
  assert.strictEqual(E.setTinkerRecipe(s, 'lens'), false);       // Linsenschliff fehlt
  assert.ok(E.setTinkerRecipe(s, 'wicker'));
  s.time = 120; s.res.twigs = 500;                               // Nacht; 500 von 560 Zweigen sind unter 90 %
  E.step(s, 10);                                                 // 5 × 0,02 × 10 s = eine Herstellung
  near(s.res.wicker, 0, 'unter 90 % nichts');
  assert.ok(s.craftAcc <= 1, 'es staut sich höchstens eine an');
  s.res.twigs = 560;
  E.step(s, 1);
  near(s.res.wicker, 1.06, 'eins aus dem Überschuss');
  near(s.res.twigs, 510, '50 Zweige');
  assert.ok(E.setTinkerRecipe(s, 'cushion'));
  s.res.moss = 460;
  E.step(s, 10);
  near(s.res.cushion, 1.06, 'Geflecht als Zutat geht immer');
  near(s.res.wicker, 0.06, 'Geflecht verbraucht');
  assert.ok(E.setTinkerRecipe(s, 'wicker'));
  Object.assign(s, { time: 160, craftAcc: 0 });                  // Tag
  s.res.twigs = 560;
  E.step(s, 10);
  near(s.res.wicker, 0.06, 'tagsüber schlafen alle');
  assert.ok(E.setTinkerRecipe(s, null));
});

test('Ordnung: neue Fledermäuse und groß gewordene Junge bekommen den gewählten Job', () => {
  const s = E.create();
  s.bld.roost = 5; s.bld.fruitTree = 30; s.bats = 1; s.seen.bats = true; s.res.fruit = 100; s._eff = null;
  assert.strictEqual(E.setAutoJob(s, 'twigCarrier'), false);     // erst mit Ordnung
  s.tech.order = true;
  assert.strictEqual(E.setAutoJob(s, 'scout'), false);           // Echoortung fehlt
  assert.ok(E.setAutoJob(s, 'twigCarrier'));
  E.step(s, 20);                                                 // Nacht: nach 20 s zieht eine ein
  assert.deepStrictEqual([s.bats, s.jobs.twigCarrier], [2, 1]);
  s.young = 2;
  s.time = 20 * 60 - 1;                                          // letzte Sekunde vor dem Herbst
  E.step(s, 1);
  assert.deepStrictEqual([s.bats, s.jobs.twigCarrier], [4, 3]);
  assert.ok(E.setAutoJob(s, null));
});

test('Neue Gebäude: Traumarchiv, Kuschelhöhle, Lagerhöhle, Dachkammer, Singhöhle', () => {
  const s = E.create();
  Object.assign(s.bld, { dreamArchive: 2, cuddleCave: 1, storeCave: 1, attic: 1, singingCave: 2 });
  s.bats = 4; s.time = 40; s._eff = null;                         // Tag
  assert.strictEqual(E.cap(s, 'dreams'), 50 + 600);
  assert.strictEqual(E.batCap(s), 2 + 5);
  assert.deepStrictEqual(['fruit', 'twigs', 'pebbles', 'moss', 'nectar', 'crystals'].map(id => E.cap(s, id)),
    [400, 260, 280, 210, 80, 70]);
  near(E.happiness(s), 1.1, 'Singhöhlen +5 % je Stück');
  near(E.rates(s, false).dreams, 4 * 0.1 * (1 + 0.1 + 0.1) * 1.1, 'Träume: Archive und Kuschelhöhle');
});

test('Speichern und Laden mit Upgrades, Job für Neue und Rezept der Tüftlerinnen', () => {
  const s = crafter();
  Object.assign(s.tech, { order: true, tinkering: true });
  Object.assign(s, { autoJob: 'twigCarrier', tinkerRecipe: 'slab', craftAcc: 0.5 });
  s.upgrades.straps = true; s.res.wicker = 3.5; s._eff = null;
  assert.strictEqual(E.save(E.load(E.save(s))), E.save(s));
  const bad = E.load(JSON.stringify({ v: 1, upgrades: { straps: 'ja', nope: true, workbench: true }, autoJob: 'nope',
    tinkerRecipe: 'fruit', craftAcc: 7 }));
  assert.deepStrictEqual([bad.upgrades, bad.autoJob, bad.tinkerRecipe, bad.craftAcc], [{ workbench: true }, null, null, 1]);
});

// ---------- Etappe 5: Nachbarn, Tausch, Freundschaft, Daueraufträge ----------

// Mit Tauschhandel, entdecktem Bachufer (Frösche), vollem Nektar und zwei Vorratshöhlen (Moos-Lager 220).
function neighborly() {
  const s = E.create();
  Object.assign(s.tech, { mooncalendar: true, orchard: true, echolocation: true, mosscare: true, pollination: true,
    cavelore: true, crafting: true, trading: true });
  s.places.brook = true; s.bld.larder = 2; s._eff = null;
  Object.assign(s.res, { nectar: 30, moss: 0, dreams: 50 });
  return s;
}

test('Tausch: braucht Tauschhandel und den Ort, bezahlt, gibt höchstens bis zum Lager, Freundschaft +1', () => {
  const s = neighborly();
  assert.strictEqual(E.trade(s, 'owls'), false);                 // Alte Scheune noch nicht entdeckt
  s.tech.trading = false;
  assert.strictEqual(E.trade(s, 'frogs'), false);                // erst mit Tauschhandel
  s.tech.trading = true;
  assert.ok(E.trade(s, 'frogs'));
  assert.deepStrictEqual([s.res.nectar, s.res.moss, s.friends.frogs], [15, 80, 1]);
  assert.ok(E.trade(s, 'frogs'));
  assert.deepStrictEqual([s.res.nectar, s.res.moss], [0, 160]);
  assert.strictEqual(E.trade(s, 'frogs'), false);                // kein Nektar mehr
  s.res.nectar = 30;
  assert.ok(E.trade(s, 'frogs'));
  assert.strictEqual(s.res.moss, 220);                           // Lager voll, der Rest geht verloren
  assert.strictEqual(E.trade(s, 'nope'), false);
});

test('Freundschaft: Stufen bei 5, 15, 35, 70, 120 Täuschen, Hilfe je Stufe, Ausbeute +10 % je Stufe', () => {
  const s = neighborly();
  s.bats = 4; s.jobs.twigCarrier = 4; s.res.fruit = 100;
  for (let i = 0; i < 5; i++) { s.res.nectar = 15; assert.ok(E.trade(s, 'frogs')); }
  assert.strictEqual(E.friendLevel(s, 'frogs'), 1);
  assert.match(s.log.at(-1).text, /^Freundschaft mit den Fröschen: Stufe 1/);
  near(E.happiness(s), 1.02, 'Froschkonzert +2 %');
  s.res.nectar = 15; s.res.moss = 0;
  E.trade(s, 'frogs');
  near(s.res.moss, 88, 'Stufe 1: +10 %');
  s.friends.frogs = 119; s._eff = null;
  s.res.nectar = 15;
  E.trade(s, 'frogs');
  assert.strictEqual(E.friendLevel(s, 'frogs'), 5);
  assert.ok(s.meta.chronicle.some(c => c.text === 'Beste Freundschaft mit den Fröschen.'));
  near(E.happiness(s), 1.1, 'fünf Stufen');
  s.bld.tradingPost = 2; s._eff = null;
  near(E.tradeYield(s, 'frogs'), 1 + 0.1 + 0.5, 'Tauschplatz +5 % je Stück, Stufe 5 +50 %');
  // Eulen machen Forschung billiger, Eichhörnchen die Lager größer, Glühwürmchen die Nachtarbeit fleißiger
  Object.assign(s.friends, { owls: 15, squirrels: 5, fireflies: 35 }); s._eff = null;
  near(E.price(s, 'tech', 'weaving').dreams, 1600 * 0.94, 'Eulen Stufe 2: −6 %');
  near(E.cap(s, 'fruit'), (100 + 2 * 150) * 1.04, 'Eichhörnchen Stufe 1: Lager +4 %');
  s.time = 120;
  near(E.rates(s, true).twigs, 4 * 0.3 * 1.1 * 1.06, 'Glühwürmchen Stufe 3: Nachtarbeit +6 %');
});

test('Dauerauftrag: ab Stufe 2, tauscht von selbst über 80 % des Lagers, höchstens alle 10 s', () => {
  const s = neighborly();
  s.res.fruit = 100;
  assert.strictEqual(E.setStandingOrder(s, 'frogs', true), false); // Stufe 0
  s.friends.frogs = 15; s._eff = null;                             // Stufe 2
  assert.ok(E.setStandingOrder(s, 'frogs', true));
  s.res.nectar = 23;                                               // unter 80 % von 30
  E.step(s, 1);
  near(s.res.moss, 0, 'unter 80 % nichts');
  s.res.nectar = 30;
  E.step(s, 1);
  near(s.res.moss, 80 * 1.2, 'ein Tausch mit +20 %');
  near(s.res.nectar, 15, 'Nektar bezahlt');
  s.res.nectar = 30;
  E.step(s, 9);
  near(s.res.nectar, 30, 'noch keine 10 s');
  E.step(s, 1);
  near(s.res.nectar, 15, 'nach 10 s wieder');
  s.res.moss = 220; s.res.nectar = 30;
  E.step(s, 10);
  near(s.res.nectar, 30, 'Moos-Lager voll: kein Tausch');
  assert.ok(E.setStandingOrder(s, 'frogs', false));
  s.res.moss = 0;
  E.step(s, 20);
  near(s.res.nectar, 30, 'aus');
});

test('Winterhunger: Igel, Winterquartiere und Nussvorrat, zusammen höchstens −75 %', () => {
  const s = E.create();
  s.bats = 10; s.time = 30 * 60;                                   // Winter, Nacht
  near(E.rates(s, true).fruit, -10 * 0.5 * 0.25, 'Winter ohne Rabatt');
  s.friends.hedgehogs = 15; s.bld.winterQuarters = 2; s._eff = null; // Stufe 2: −10 %, zwei Quartiere −10 %
  near(E.rates(s, true).fruit, -10 * 0.5 * 0.25 * 0.8, '−20 %');
  s.upgrades.mossInsulation = true; s._eff = null;                 // Quartiere +50 %
  near(E.rates(s, true).fruit, -10 * 0.5 * 0.25 * 0.75, '−25 %');
  s.upgrades.nutStore = true; s.friends.hedgehogs = 120; s.bld.winterQuarters = 10; s._eff = null;
  near(E.rates(s, true).fruit, -10 * 0.5 * 0.25 * 0.25, 'höchstens −75 %');
  s.time = 0;                                                      // Frühling: kein Rabatt nötig
  near(E.rates(s, true).fruit, -10 * 0.5, 'Frühling');
});

test('Weberei: Seidenfaden, Echokarten (Echo +2 % je ganzer Karte), Traumbücher mit Traumtagebuch', () => {
  const s = crafter();
  Object.assign(s.tech, { trading: true, weaving: true, dreamwriting: true });
  s.res.silk = 20;
  assert.ok(E.craft(s, 'silkThread', 'max'));
  near(s.res.silkThread, 1.06, 'ein Faden aus 20 Seide');
  s.res.silkThread = 4; s.bld.listeningPost = 3; s._eff = null;  // Echo-Lager 250, Echo +30 %
  s.res.echo = 250;
  assert.ok(E.craft(s, 'echoMap', 1));
  near(s.res.echoMap, 1.06, 'eine Karte');
  s.bats = 5; s.jobs.scout = 5; s.time = 120; s.res.fruit = 100; s._eff = null;
  near(E.rates(s, true).echo, 5 * 0.2 * (1 + 0.3 + 0.02), 'eine ganze Karte: Echo +2 %');
  Object.assign(s.res, { dreams: 300, silkThread: 1 });
  s.bld.dreamArchive = 1; s._eff = null;                         // Träume-Lager 350
  assert.ok(E.craft(s, 'dreamBook', 1));
  assert.strictEqual(E.cap(s, 'dreams'), 50 + 300 + 25);         // 1,06 Bücher: ein ganzes zählt
  s.res.dreamBook = 10; s.upgrades.dreamDiary = true; s._eff = null;
  assert.strictEqual(E.cap(s, 'dreams'), 50 + 300 + 10 * 25 * 1.5);
});

test('Neue Luxusgüter: Nüsse werden genascht, Seide bleibt; die Lagerhöhle fasst mehr davon', () => {
  const s = E.create();
  s.bats = 4; s.jobs.twigCarrier = 4; s.res.fruit = 100;
  Object.assign(s.res, { nuts: 1.02, silk: 1 });
  near(E.happiness(s), 1.2, 'zwei Sorten');
  E.step(s, 10);
  near(s.res.nuts, 1.02 - 0.04, 'Nüsse genascht');
  near(s.res.silk, 1, 'Seide bleibt');
  s.bld.storeCave = 1; s._eff = null;
  assert.deepStrictEqual([E.cap(s, 'nuts'), E.cap(s, 'silk')], [90, 80]);
});

test('Speichern und Laden mit Freundschaften und Daueraufträgen', () => {
  const s = neighborly();
  s.friends = { frogs: 17, owls: 2.5 }; s.orders = { frogs: 4 };
  assert.strictEqual(E.save(E.load(E.save(s))), E.save(s));
  const bad = E.load(JSON.stringify({ v: 1, friends: { frogs: -1, owls: 'x', nope: 3, moles: 1e9 },
    orders: { owls: 99, nope: 1, frogs: -2 } }));
  assert.deepStrictEqual([bad.friends, bad.orders], [{ moles: 1e6 }, { owls: 10 }]);
});

// ---------- Etappe 6: Mondkult ----------

// Mit Mondkunde, zehn Fledermäusen, zwei Mondaltären (Mondlicht-Lager 300) und vollem Mondlicht.
function mooncult() {
  const s = E.create();
  Object.assign(s.tech, { mooncalendar: true, moonlore: true });
  s.bats = 10; s.res.fruit = 100; s.bld.moonAltar = 2; s._eff = null;
  s.res.moonlight = 300;
  return s;
}

test('Mondsängerin: Mondlicht nachts, bei Vollmond doppelt; Mondaltar: Lager +100, Mondlicht +5 %', () => {
  const s = mooncult();
  s.jobs.moonSinger = 4; s.time = 2 * 60; s._eff = null;         // zunehmender Mond, Nacht
  near(E.rates(s, true).moonlight, 4 * 0.05 * 1.1, 'zwei Altäre +10 %');
  s.time = 4 * 60;                                               // Vollmond
  near(E.rates(s, true).moonlight, 4 * 0.05 * (1 + 0.1 + 1), 'Vollmond doppelt');
  assert.strictEqual(E.cap(s, 'moonlight'), 300);
});

test('Mondlieder: einmal singen, kostet Mondlicht, wirkt dauerhaft', () => {
  const s = mooncult();
  s.tech.moonlore = false;
  assert.strictEqual(E.singSong(s, 'silver'), false);
  s.tech.moonlore = true;
  assert.ok(E.singSong(s, 'silver'));
  near(s.res.moonlight, 250, '50 Mondlicht');
  assert.strictEqual(E.singSong(s, 'silver'), false);            // nur einmal
  s.time = 40;                                                    // Tag
  near(E.rates(s, false).dreams, 10 * 0.1 * 1.1, 'Silberlied: Träume +10 %');
  s.bld.moonAltar = 20;
  for (const id of ['cradle', 'winterSong', 'grandChoir']) { s.res.moonlight = 1500; s._eff = null; assert.ok(E.singSong(s, id), id); }
  near(E.effects(s)['babies.bonus'], 0.5, 'Wiegenlied');
  near(E.effects(s)['winter.hunger'], 0.25, 'Winterlied');
  near(E.rates(s, false).dreams, 10 * 0.1 * 1.1 * 1.1, 'Großer Mondchor: alles +10 %');
  assert.strictEqual(E.singSong(s, 'nope'), false);
});

test('Mondfest: nur bei Vollmond, kostet 20 + 1 je Fledermaus, wirkt bis zum nächsten Vollmond', () => {
  const s = mooncult();
  s.time = 3 * 60;                                               // Tag 3: zunehmender Mond
  assert.strictEqual(E.chooseBlessing(s, 'harvest'), false);
  s.time = 4 * 60;                                               // Tag 4: Vollmond
  assert.strictEqual(E.chooseBlessing(s, 'warmHearts'), false);  // erst mit dem Festlied
  assert.ok(E.chooseBlessing(s, 'harvest'));
  near(s.res.moonlight, 300 - 30, '20 + 10 Fledermäuse');
  assert.ok(s.meta.chronicle.some(c => c.text === 'Das erste Mondfest: Reiche Ernte.'));
  s.bld.fruitTree = 10; s._eff = null;
  near(E.rates(s, true).fruit, 10 * 0.5 * (1 + 0.15 + 0.3) - 5, 'Vollmond +15 %, Reiche Ernte +30 %');
  assert.strictEqual(E.chooseBlessing(s, 'harvest'), false);     // schon aktiv
  assert.ok(E.chooseBlessing(s, 'deepDreams'));                  // wechseln kostet neu
  near(s.res.moonlight, 300 - 60, 'zweimal bezahlt');
  s.time = 11 * 60 + 59;                                         // letzte Sekunde vor dem nächsten Vollmond
  assert.ok(E.blessActive(s));
  s.res.moonlight = 0;
  E.step(s, 1);                                                  // Vollmond, aber kein Mondlicht
  assert.strictEqual(E.blessActive(s), false);
  s.res.moonlight = 100;
  E.step(s, 1);
  assert.ok(E.blessActive(s), 'erneuert sich von selbst');
  near(s.res.moonlight, 70, 'erneuert');
  assert.match(s.log.at(-1).text, /Tiefe Träume erneuert/);
  s.blessCycle = 0; s._eff = null;                               // diesmal nicht erneuert
  s.res.moonlight = 0;
  s.time = 13 * 60 + 59;                                         // letzte Sekunde des Vollmonds
  E.step(s, 1);
  assert.match(s.log.at(-1).text, /Segen ist verklungen/);
});

test('Mondfest mit Lampion (+50 %) und Festlied (+25 %); Festlied öffnet Warme Herzen und Handelsglück', () => {
  const s = mooncult();
  s.time = 4 * 60; s.res.lantern = 1.5;
  s.songs.feast = true; s._eff = null;
  assert.ok(E.chooseBlessing(s, 'warmHearts'));
  near(s.res.lantern, 0.5, 'Lampion verbraucht');
  near(E.happiness(s), 1 + 0.15 * (1 + 0.5 + 0.25), 'Warme Herzen × 1,75');
});

test('Speichern und Laden mit Mondliedern und Segen', () => {
  const s = mooncult();
  s.songs = { silver: true, feast: true };
  Object.assign(s, { blessing: 'harvest', blessCycle: 3, blessLantern: true });
  assert.strictEqual(E.save(E.load(E.save(s))), E.save(s));
  const bad = E.load(JSON.stringify({ v: 1, songs: { silver: 'ja', nope: true, cradle: true }, blessing: 'nope',
    blessCycle: 1.5, blessLantern: 1 }));
  assert.deepStrictEqual([bad.songs, bad.blessing, bad.blessCycle, bad.blessLantern], [{ cradle: true }, null, null, false]);
});

// ---------- Etappe 7: Sternbilder und Chronik ----------

test('Sternwarte: Sternschnuppen häufiger, und mit 10 % je Sternwarte fängt sich eine von selbst', () => {
  const s = E.create();
  s.tech.mooncalendar = true; s.bld.observatory = 3; s.starIn = 0.5; s._eff = null;
  withRng([0.29, 0.5], () => E.step(s, 1));                      // 0,29 unter 30 %: gefangen
  assert.deepStrictEqual([s.res.starmaps, s.star], [1, 0]);
  near(s.starIn, 90 / 1.3, 'nächste im Schnitt 30 % früher');
  s.starIn = 0.5;
  withRng([0.31, 0.5], () => E.step(s, 1));                      // 0,31: sie steht oben zum Antippen
  assert.deepStrictEqual([s.res.starmaps, s.star], [1, 15]);
});

test('Kartenkunde: Echokarten wirken doppelt; Ferne Wälder warten auf 5 Echokarten und nehmen sie', () => {
  const s = E.create();
  Object.assign(s.tech, { echolocation: true, weaving: true, astronomy: true });
  for (const p of D.places) if (p.id !== 'farwoods') s.places[p.id] = true;
  s.res.echoMap = 3; s._eff = null;
  near(E.effects(s)['echo.bonus'], 0.06, 'drei Karten');
  assert.strictEqual(E.placeState(s, 'farwoods'), 'hidden');    // erst mit Kartenkunde
  s.tech.mapping = true; s._eff = null;
  near(E.effects(s)['echo.bonus'], 0.12, 'doppelt');
  assert.ok(E.explore(s, 'farwoods'));
  s.res.echo = 100; s.echoIn.farwoods = 7950; s.time = 60 * 60 + 40; // Tag: kein neues Echo
  E.step(s, 1);
  near(s.echoIn.farwoods, 8000, 'Echo voll');
  assert.ok(!s.places.farwoods, 'drei Karten reichen nicht');
  near(s.res.echo, 50, 'nur so viel Echo wie nötig');
  s.res.echoMap = 5.5;
  E.step(s, 1);
  assert.ok(s.places.farwoods);
  near(s.res.echoMap, 0.5, 'fünf Karten genommen');
  assert.strictEqual(s.explore, null);                           // alles entdeckt
});

test('Weiterziehen: Sterne je Fledermaus über 20, Zeichen des größten Jobs, Chronik bleibt, alles andere beginnt neu', () => {
  const s = E.create();
  s.tech.departure = true; s.bats = 30;
  Object.assign(s.jobs, { twigCarrier: 8, gatherer: 12, scout: 10 });
  s.res.fruit = 500;
  s.meta.chronicle.push({ date: 'Jahr 1, Frühling', run: 0, text: 'Die erste Fledermaus zieht ein.' });
  assert.strictEqual(E.ascend(s, '   '), null);                  // Name fehlt
  assert.strictEqual(E.ascend(E.create(), 'Mausohr'), null);     // ohne Aufbruch nicht
  const long = E.create();
  long.tech.departure = true;
  assert.strictEqual(E.ascend(long, 'x'.repeat(25)), null);      // höchstens 24 Zeichen
  const n = E.ascend(s, '  Mausohr  ');
  assert.strictEqual(n.meta.runs, 1);
  assert.deepStrictEqual([n.meta.stars, n.meta.starsFree], [10, 10]);
  assert.deepStrictEqual(n.meta.constellations, [{ name: 'Mausohr', run: 0, sign: 'gatherer', stars: 10 }]);
  assert.strictEqual(n.meta.chronicle[0].text, 'Die erste Fledermaus zieht ein.');
  assert.ok(n.meta.chronicle.some(c => c.text === 'Sternbild Mausohr: 10 Sterne.'));
  assert.match(n.log.at(-1).text, /Sternbild Mausohr/);
  assert.deepStrictEqual([n.bats, n.res.fruit, n.tech.departure, n.time], [0, 0, undefined, 0]);
  n.bld.fruitTree = 10; n.bats = 2; n.jobs.gatherer = 2; n.time = 120; n._eff = null;
  near(E.rates(n, true).fruit, (10 * 0.5 + 2 * 1.05) * 1.1 - 1, 'Sterne +10 %, Zeichen Sammlerin +5 %');
  near(E.cap(n, 'fruit'), 110, 'Lager +10 %');
});

test('Himmelsgaben: kosten freie Sterne, der Bonus bleibt; Startgaben wirken ab der nächsten Kolonie', () => {
  const s = E.create({ runs: 1, chronicle: [], stars: 60, starsFree: 60, perks: {}, constellations: [] });
  assert.ok(E.buyPerk(s, 'earlyStart'));
  assert.ok(E.buyPerk(s, 'memory'));
  assert.ok(E.buyPerk(s, 'swiftWings'));
  assert.strictEqual(E.buyPerk(s, 'earlyStart'), false);         // nur einmal
  assert.strictEqual(E.buyPerk(s, 'starRain'), false);           // 30 frei, kostet 80
  assert.strictEqual(E.buyPerk(s, 'nope'), false);
  assert.deepStrictEqual([s.meta.starsFree, s.meta.stars], [30, 60]);
  assert.deepStrictEqual([s.res.fruit, s.tech.orchard], [0, undefined]); // erst in der nächsten Kolonie
  const n = E.create(s.meta);
  assert.deepStrictEqual([n.res.fruit, n.res.twigs, n.bld.fruitTree, n.bld.roost], [20, 20, 1, 1]);
  assert.ok(n.tech.mooncalendar && n.tech.orchard && n.tech.dreamlore && n.tech.echolocation);
  assert.strictEqual(n.explore, 'brook');                        // mit Echoortung läuft das erste Ziel
  n.bats = 1; n.seen.bats = true; n.bld.fruitTree = 10; n._eff = null;
  E.step(n, 10);
  assert.strictEqual(n.bats, 2);                                 // Schnelle Flügel: nach 10 s statt 20
  assert.strictEqual(E.offlineMax(n), 3 * 86400);
  n.meta.perks.longAbsence = true;
  assert.strictEqual(E.offlineMax(n), 7 * 86400);
  const f = E.create({ ...s.meta, perks: { oldFriends: true, localLore: true } });
  assert.deepStrictEqual([E.friendLevel(f, 'frogs'), f.places.brook, f.places.cave, f.places.barn], [1, true, true, undefined]);
});

test('Chronik: 25 Fledermäuse', () => {
  const s = E.create();
  s.bats = 24; s.seen.bats = true; s.bld.roost = 13; s.bld.fruitTree = 60; s.res.fruit = 100; s._eff = null;
  E.step(s, 20);
  assert.strictEqual(s.bats, 25);
  assert.ok(s.meta.chronicle.some(c => c.text === '25 Fledermäuse leben in der Kolonie.'));
});

test('Speichern und Laden mit Sternen, Himmelsgaben und Sternbildern', () => {
  const s = E.create({ runs: 2, chronicle: [], stars: 30, starsFree: 5, perks: { swiftWings: true },
    constellations: [{ name: 'Mausohr', run: 0, sign: 'gatherer', stars: 10 }, { name: 'Silberohr', run: 1, sign: null, stars: 20 }] });
  assert.strictEqual(E.save(E.load(E.save(s))), E.save(s));
  const bad = E.load(JSON.stringify({ v: 1, meta: { runs: 1, stars: -3, starsFree: 1e9,
    perks: { swiftWings: 'ja', nope: true, farSight: true },
    constellations: [{ name: 'A', run: 0, sign: 'nope', stars: 5 }, { name: 42 }, { name: 'B'.repeat(40), run: 0, sign: 'scout', stars: 1 }] } }));
  assert.deepStrictEqual([bad.meta.stars, bad.meta.starsFree, bad.meta.perks, bad.meta.constellations],
    [0, 0, { farSight: true }, [{ name: 'A', run: 0, sign: null, stars: 5 }, { name: 'B'.repeat(24), run: 0, sign: 'scout', stars: 1 }]]);
});

// ---------- Tempo-Bot ----------

// Wert einer Ressource für den Bot: Rohstoffe 1, Waren so viel wie ihre Zutaten.
const worth = id => { const r = byId(D.recipes, id); return r ? total(r.cost) : 1; };
const total = cost => Object.entries(cost).reduce((a, [id, v]) => a + v * worth(id), 0);

const MILESTONES = {
  bat: s => s.bats > 0,
  research: s => Object.keys(s.tech).length > 0,
  place: s => Object.keys(s.places).length > 0,
  workshop: s => s.bld.workshop > 0,
  trade: s => Object.keys(s.friends).length > 0,
  moon: s => !!s.tech.moonlore,
  fest: s => !!s.seen.fest,
  departure: s => !!s.tech.departure,
};
const track = (s, when) => { for (const k in MILESTONES) if (MILESTONES[k](s)) when[k] ??= s.time; };

// Fester Zufall (mulberry32): gleicher Samen, gleicher Lauf.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function withSeed(seed, fn) {
  const old = E.rng;
  E.rng = seeded(seed);
  try { return fn(); } finally { E.rng = old; }
}
const clickOnce = s => E.click(s, s.bld.fruitTree === 0 || s.res.fruit < s.res.twigs ? 'fruit' : 'twigs');

// Aktives Profil: klickt 2× je Sekunde, entscheidet alle 10 s, fängt jede Sternschnuppe.
function bot(maxSeconds = 3 * 3600, until = TEMPO.map(t => t[1]), seed = 1) {
  return withSeed(seed, () => {
    const s = E.create(), when = {};
    while (s.time < maxSeconds && !until.every(k => k in when)) {
      for (let i = 0; i < 2; i++) clickOnce(s);
      if (s.time % 10 === 0) think(s);
      E.catchStar(s);
      E.step(s, 1);
      track(s, when);
    }
    return when;
  });
}

// Lockeres Profil: 4× am Tag (8, 12, 18, 22 Uhr) je 5 Minuten, am ersten Tag wird dabei geklickt.
// Dazwischen läuft simulate() wie bei echter Abwesenheit.
function casualBot(maxDays = 14, until = Object.keys(MILESTONES), seed = 1) {
  return withSeed(seed, () => {
    const s = E.create(), when = {};
    const WINDOWS = [8, 12, 18, 22].map(h => h * 3600);
    while (s.time < maxDays * 86400 && !until.every(k => k in when)) {
      const day = Math.floor(s.time / 86400) * 86400, t = s.time - day;
      const next = WINDOWS.find(w => w + 300 > t);
      const begin = next === undefined ? day + 86400 + WINDOWS[0] : day + next;
      if (begin > s.time) { E.simulate(s, begin - s.time); track(s, when); continue; }
      for (let i = 0; i < 300 && s.time < begin + 300; i++) {
        if (s.time < 86400) for (let c = 0; c < 2; c++) clickOnce(s);
        if (i % 10 === 0) think(s);
        E.catchStar(s);
        E.step(s, 1);
        track(s, when);
      }
    }
    return when;
  });
}

function think(s) {
  const open = D.techs.filter(t => E.isUnlocked(s, t) && !s.tech[t.id]);
  for (const t of open.sort((a, b) => total(a.cost) - total(b.cost))) E.research(s, t.id);
  // Jobs: Futter zuerst, von Kundschafterin, Moos und Kiesel je eine je fünf Fledermäuse, der Rest trägt Zweige.
  // Wer fehlt, kommt von den Zweigträgerinnen.
  const unlocked = id => E.isUnlocked(s, byId(D.jobs, id));
  const move = id => (E.free(s) > 0 || E.assign(s, 'twigCarrier', -1)) && E.assign(s, id, 1);
  if (E.leanFruit(s) < 0.5 && unlocked('gatherer')) move('gatherer');
  for (const id of ['scout', 'mossPicker', 'pebbler']) if (unlocked(id) && s.jobs[id] < Math.ceil(s.bats / 5)) move(id);
  if (unlocked('tinkerer') && s.jobs.tinkerer < Math.ceil(s.bats / 10)) move('tinkerer');
  if (unlocked('moonSinger') && s.jobs.moonSinger < Math.ceil(s.bats / 10)) move('moonSinger');
  while (E.free(s) > 0 && E.assign(s, 'twigCarrier', 1));
  E.setFertilize(s, true);
  E.setAutoJob(s, 'twigCarrier');
  E.setTinkerRecipe(s, 'wicker');
  // Werkstatt: aus halbvollen Lagern ein Drittel verarbeiten, Upgrades kaufen, sobald bezahlbar
  for (const [id, from] of [['wicker', 'twigs'], ['slab', 'pebbles'], ['cushion', 'moss']]) {
    if (s.res[from] >= 0.5 * E.cap(s, from)) E.craft(s, id, Math.max(1, Math.floor(s.res[from] * 0.3 / byId(D.recipes, id).cost[from])));
  }
  for (const u of D.upgrades) if (E.upgradeVisible(s, u.id)) E.buyUpgrade(s, u.id);
  // Nachbarn: tauschen, was über 80 % liegt, und ab Stufe 2 alles auf Dauerauftrag
  for (const n of D.neighbors) {
    if (!E.canTrade(s, n.id)) continue;
    if (Object.keys(n.wants).every(r => s.res[r] >= 0.8 * E.cap(s, r))) E.trade(s, n.id);
    E.setStandingOrder(s, n.id, true);
  }
  for (const [id, from] of [['silkThread', 'silk'], ['leafBlanket', 'leaves'], ['lantern', 'glowdust'], ['lens', 'crystals']]) {
    if (E.recipeOpen(s, id) && s.res[from] >= 0.5 * E.cap(s, from)) E.craft(s, id, 'max');
  }
  // Echokarten, solange Echo im Lager liegt (ohne Ziel), bis zehn da sind (Ferne Wälder, Kartentisch).
  // Fehlen für die Fernen Wälder noch Karten, lauscht niemand dorthin, damit sich Echo für Karten sammelt.
  if (s.res.echoMap < 10 && s.res.echo >= 0.8 * E.cap(s, 'echo')) E.craft(s, 'echoMap', 1);
  if (E.placeState(s, 'farwoods') !== 'hidden' && !s.places.farwoods) E.explore(s, s.res.echoMap >= 5 ? 'farwoods' : null);
  // Mondkult: Lieder, sobald bezahlbar, und bei Vollmond Tiefe Träume
  for (const g of D.songs) E.singSong(s, g.id);
  E.chooseBlessing(s, 'deepDreams');
  const food = E.leanFruit(s) < 0.5 ? ['fruitTree'] : [];
  // Reicht das Traumlager nicht für die nächste Forschung, geht das Traumlager vor, samt Waren fürs Traumarchiv.
  const next = D.techs.filter(t => E.isUnlocked(s, t) && !s.tech[t.id]).sort((a, b) => total(a.cost) - total(b.cost))[0];
  const dreamy = next && next.cost.dreams > E.cap(s, 'dreams') ? ['dreamArchive', 'dreamcatcher'] : [];
  if (dreamy.length && E.recipeOpen(s, 'wicker')) {
    const p = E.price(s, 'building', 'dreamArchive');
    for (const id of ['wicker', 'slab']) if (s.res[id] < p[id]) E.craft(s, id, Math.ceil((p[id] - s.res[id]) / E.craftYield(s)));
    if (s.res.dreams >= 0.9 * E.cap(s, 'dreams')) E.craft(s, 'dreamBook', 1);
  }
  const rest = D.buildings.filter(b => E.isUnlocked(s, b)).map(b => b.id)
    .sort((a, b) => total(E.price(s, 'building', a)) - total(E.price(s, 'building', b)));
  // bis zu fünf Bauten je Entscheidung, wie ein Mensch, der in einer Sitzung mehrmals tippt
  for (let n = 0; n < 5; n++) if (![...food, ...dreamy, ...rest].some(id => E.build(s, id))) break;
}

const TEMPO = [
  ['Erste Fledermaus', 'bat', 120, '≈ 1 Min.'],
  ['Erste Forschung', 'research', 300, '≤ 5 Min.'],
  ['Erster Ort', 'place', 1200, '≤ 20 Min.'],
  ['Werkstatt', 'workshop', 4800, '≈ 1 Std.'],
];
const TEMPO_CASUAL = [
  ['Werkstatt', 'workshop', ''],
  ['Erster Tausch', 'trade', ''],
  ['Mondkult', 'moon', '≈ 1 Tag'],
  ['Erstes Mondfest', 'fest', ''],
  ['Weiterziehen möglich', 'departure', '≈ 1 Woche'],
];

test('Tempo: Meilensteine im Ziel (aktiv)', () => {
  const when = bot();
  for (const [name, key, max] of TEMPO) assert.ok(when[key] <= max, `${name} nach ${when[key]} s (höchstens ${max} s)`);
});

function tempo() {
  const when = bot(), runs = [1, 2, 3].map(seed => casualBot(14, TEMPO_CASUAL.map(t => t[1]), seed));
  const clock = sec => (sec === undefined ? '–' : sec < 3600 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')} Min.`
    : sec >= 86400 ? `${(sec / 86400).toFixed(1)} Tage` : `${Math.floor(sec / 3600)}:${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')} Std.`);
  console.log('Aktiv                   Zeit        Ziel');
  for (const [name, key, , goal] of TEMPO) console.log(`${name.padEnd(24)}${clock(when[key]).padEnd(12)}${goal}`);
  console.log('\nLocker (4× am Tag 5 Min., ab 8 Uhr), Median aus 3 Läufen (Spanne)');
  for (const [name, key, goal] of TEMPO_CASUAL) {
    const t = runs.map(r => (r[key] === undefined ? Infinity : r[key] - 8 * 3600)).sort((a, b) => a - b);
    const c = x => (x === Infinity ? '–' : clock(x));
    console.log(`${name.padEnd(24)}${c(t[1]).padEnd(12)}${goal.padEnd(12)}(${c(t[0])} bis ${c(t[2])})`);
  }
}

function run() {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { fn(); console.log('ok      ' + name); }
    catch (err) { failed++; console.log('FEHLER  ' + name + '\n        ' + err.message); }
  }
  console.log(failed ? `${failed} von ${tests.length} fehlgeschlagen` : `alle ${tests.length} ok`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[2] === 'tempo') tempo();
else run();
