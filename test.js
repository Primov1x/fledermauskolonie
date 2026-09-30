// node test.js        Prüfungen der Spiellogik
// node test.js tempo  Tempo-Bot: wann fallen die Meilensteine?
const assert = require('assert');
const D = require('./js/data.js');
const E = require('./js/engine.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} statt ${b}`);
const byId = (list, id) => list.find(x => x.id === id);

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
  s.bats = 20; s.jobs.twigCarrier = 1; s.bld.dreamcatcher = 1;
  near(E.happiness(s), 0.9, 'Gedränge (20 Fledermäuse)');
  near(E.rates(s, true).twigs, 0.3 * 0.9, 'Sammeln × 0,9');
  near(E.rates(s, false).dreams, 20 * 0.1 * 1.05 * 0.9, 'Träume × Traumfänger × 0,9');
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

// ---------- Tempo-Bot ----------

const total = cost => Object.values(cost).reduce((a, b) => a + b, 0);

// Aktives Profil: klickt 2× je Sekunde, entscheidet alle 10 s.
function bot(maxSeconds = 1800) {
  const s = E.create(), when = {};
  while (s.time < maxSeconds && !(when.bat && when.research)) {
    for (let i = 0; i < 2; i++) E.click(s, s.bld.fruitTree === 0 || s.res.fruit < s.res.twigs ? 'fruit' : 'twigs');
    if (s.time % 10 === 0) think(s);
    E.step(s, 1);
    if (s.bats > 0) when.bat ??= s.time;
    if (Object.keys(s.tech).length) when.research ??= s.time;
  }
  return when;
}

function think(s) {
  const open = D.techs.filter(t => E.isUnlocked(s, t) && !s.tech[t.id]);
  for (const t of open.sort((a, b) => total(a.cost) - total(b.cost))) E.research(s, t.id);
  while (E.free(s) > 0) {
    const short = E.rates(s, true).fruit < 0.5;
    const job = short && E.isUnlocked(s, byId(D.jobs, 'gatherer')) ? 'gatherer' : 'twigCarrier';
    if (!E.assign(s, job, 1)) break;
  }
  const food = E.rates(s, true).fruit < 0.5 ? ['fruitTree'] : [];
  const rest = D.buildings.filter(b => E.isUnlocked(s, b)).map(b => b.id)
    .sort((a, b) => total(E.price(s, 'building', a)) - total(E.price(s, 'building', b)));
  for (const id of [...food, ...rest]) if (E.build(s, id)) break;
}

const TEMPO = [
  ['Erste Fledermaus', 'bat', 120, '≈ 1 Min.'],
  ['Erste Forschung', 'research', 300, '≤ 5 Min.'],
];

test('Tempo: Meilensteine im Ziel', () => {
  const when = bot();
  for (const [name, key, max] of TEMPO) assert.ok(when[key] <= max, `${name} nach ${when[key]} s (höchstens ${max} s)`);
});

function tempo() {
  const when = bot();
  const clock = sec => (sec === undefined ? '–' : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`);
  console.log('Meilenstein         Zeit    Ziel');
  for (const [name, key, , goal] of TEMPO) console.log(`${name.padEnd(20)}${clock(when[key]).padEnd(8)}${goal}`);
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
