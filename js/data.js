// Fledermauskolonie – alle Inhalte als Tabellen.
// Zahlen sind Startwerte aus der Spec; der Tempo-Bot (node test.js tempo) prüft das Tempo.
const DATA = {
  rules: {
    saveVersion: 1,
    dayLength: 60,          // Sekunden je Spieltag, jeder Tag beginnt mit der Nacht
    nightShare: 0.5,        // ponytail: in Etappe 1 fest, Etappe 2 macht den Nachtanteil je Jahreszeit
    seasonDays: 10,
    seasons: ['Frühling', 'Sommer', 'Herbst', 'Winter'],
    moonDays: 8,
    moonPhases: [['Neumond', 2], ['zunehmender Mond', 2], ['Vollmond', 2], ['abnehmender Mond', 2]],
    batHunger: 0.5,         // Früchte/s je Erwachsene, nachts
    batDream: 0.1,          // Träume/s je Erwachsene, tagsüber
    arrivalEvery: 20,       // Nachtsekunden je Zuzug
    hungerLeaveAfter: 30,   // hungrige Nachtsekunden, bis eine wegzieht
    hungerPenalty: 0.3,
    crowdFree: 10,
    crowdPenalty: 0.01,     // je Erwachsene über crowdFree
    happinessMin: 0.25,
    offlineMax: 3 * 86400,
    logMax: 100,
    startText: 'Eine kleine Fledermaus in einem stillen Wald. Es wird Nacht.',
  },

  resources: [
    { id: 'fruit', name: 'Früchte', one: 'Frucht', cap: 100 },
    { id: 'twigs', name: 'Zweige', one: 'Zweig', cap: 60 },
    { id: 'dreams', name: 'Träume', one: 'Traum', cap: 50 },
  ],

  clicks: [
    { id: 'fruit', name: 'Früchte pflücken' },
    { id: 'twigs', name: 'Zweige sammeln' },
  ],

  // effects: '<id>.night' = Ertrag/s nachts, '<id>.cap' = Lager, '<id>.bonus' = Anteil obendrauf, 'bats.cap' = Plätze
  buildings: [
    { id: 'fruitTree', name: 'Obstbaum', desc: 'Aus verteilten Kernen wächst ein Baum. Trägt nachts Früchte.',
      cost: { fruit: 10 }, ratio: 1.12, effects: { 'fruit.night': 0.5 } },
    { id: 'roost', name: 'Schlafplatz', desc: 'Ein ruhiger Ast zum Kopfüberhängen. Platz für zwei.',
      cost: { twigs: 10 }, ratio: 1.6, effects: { 'bats.cap': 2 } },
    { id: 'larder', name: 'Vorratshöhle', desc: 'Eine trockene Höhle für Vorräte.',
      cost: { twigs: 40 }, ratio: 1.3, effects: { 'fruit.cap': 150, 'twigs.cap': 100 }, requires: { tech: 'orchard' } },
    { id: 'dreamcatcher', name: 'Traumfänger', desc: 'Hält Träume fest, damit keiner verfliegt.',
      cost: { twigs: 30 }, ratio: 1.25, effects: { 'dreams.cap': 40, 'dreams.bonus': 0.05 }, requires: { tech: 'dreamlore' } },
  ],

  jobs: [
    { id: 'twigCarrier', name: 'Zweigträgerin', effects: { 'twigs.night': 0.3 } },
    { id: 'gatherer', name: 'Sammlerin', effects: { 'fruit.night': 1 }, requires: { tech: 'orchard' } },
  ],

  techs: [
    { id: 'mooncalendar', name: 'Mondkalender', desc: 'Den Mond beobachten und die Tage zählen.',
      cost: { dreams: 15 }, unlockText: 'Kalender und Mondphasen' },
    { id: 'orchard', name: 'Obstbau', desc: 'Bäume pflegen und Früchte gezielt ernten.',
      cost: { dreams: 40 }, requires: { tech: 'mooncalendar' } },
    { id: 'dreamlore', name: 'Traumdeutung', desc: 'Träume verstehen und aufbewahren.',
      cost: { dreams: 45 }, requires: { tech: 'mooncalendar' } },
  ],
};

if (typeof module !== 'undefined') module.exports = DATA;
