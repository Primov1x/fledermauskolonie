// Fledermauskolonie – alle Inhalte als Tabellen.
// Zahlen sind Startwerte aus der Spec; der Tempo-Bot (node test.js tempo) prüft das Tempo.
const DATA = {
  rules: {
    saveVersion: 1,
    dayLength: 60,          // Sekunden je Spieltag, jeder Tag beginnt mit der Nacht
    seasonDays: 10,
    // night = Nachtanteil; mult = Faktor je Ressource, work = übrige Nachtarbeit, hunger = Futterbedarf,
    // guano = Guano am Tag; dreamsAtNight = Winterschlaf (Träume auch nachts), noArrival = niemand zieht ein
    seasons: [
      { name: 'Frühling', night: 0.5, mult: { nectar: 1.5 } },
      { name: 'Sommer', night: 0.4, mult: { fruit: 1.25 } },
      { name: 'Herbst', night: 0.5, mult: { fruit: 1.5, nectar: 0.5 } },
      { name: 'Winter', night: 0.6, mult: { fruit: 0.25, nectar: 0 }, work: 0.25, hunger: 0.25, guano: 0.25,
        dreamsAtNight: true, noArrival: true },
    ],
    // days = Länge in Tagen; bonus = Anteil obendrauf je Ressource
    moonPhases: [
      { name: 'Neumond', days: 2, bonus: { echo: 0.25 } },
      { name: 'zunehmender Mond', days: 2, bonus: {} },
      { name: 'Vollmond', days: 2, bonus: { fruit: 0.15, moonlight: 1 }, fest: true },
      { name: 'abnehmender Mond', days: 2, bonus: {} },
    ],
    starEvery: 90,          // Nachtsekunden je Sternschnuppe im Schnitt (3 Nächte à 30 s)
    starShow: 15,           // so lange steht sie im Kopf zum Antippen
    batHunger: 0.5,         // Früchte/s je Erwachsene, nachts
    youngHunger: 0.25,      // … je Junges
    batDream: 0.1,          // Träume/s je Erwachsene, tagsüber
    youngDream: 0.05,
    batGuano: 0.05,         // Guano/s je Erwachsene, tagsüber
    youngGuano: 0.02,
    arrivalEvery: 20,       // Nachtsekunden je Zuzug
    hungerLeaveAfter: 30,   // hungrige Nachtsekunden, bis eine wegzieht
    hungerPenalty: 0.3,
    crowdFree: 10,
    crowdPenalty: 0.005,    // je Erwachsene über crowdFree (0,01 drückte große Kolonien unter ihre eigene Leistung)
    happinessMin: 0.25,
    luxuryHappy: 0.1,       // Zufriedenheit je Luxusgut-Sorte mit Bestand
    fertilizeUse: 0.02,     // Guano/s je Obstbaum beim Düngen, nachts
    fertilizeBonus: 0.5,    // Obstbäume beim Düngen
    babyDay: 8,             // Frühling, Tag 8: Babyzeit
    babyShare: 0.25,        // Junge je Erwachsene
    placesAhead: 2,         // so viele unentdeckte Orte sind sichtbar, weitere stehen als „???“ da
    tinkerRate: 0.02,       // Herstellungen/s je Tüftlerin, nachts
    tinkerFill: 0.9,        // Tüftlerinnen nehmen Zutaten mit Lager erst ab so voll
    friendLevels: [5, 15, 35, 70, 120], // Täusche bis zur nächsten Freundschaftsstufe
    friendTrade: 0.1,       // Tausch-Ausbeute je Freundschaftsstufe
    orderLevel: 2,          // Daueraufträge ab dieser Stufe
    orderFill: 0.8,         // Dauerauftrag tauscht, wenn alles Gewollte über diesem Anteil seines Lagers liegt
    orderEvery: 10,         // höchstens alle so viele Sekunden
    winterHungerMax: 0.75,  // Winterhunger-Rabatte zusammen höchstens
    researchDiscountMax: 0.5, // Forschung höchstens so viel billiger
    blessCost: 20,          // Mondfest: Mondlicht, dazu blessPerBat je Erwachsene
    blessPerBat: 1,
    lanternBless: 0.5,      // ein Lampion im Lager macht den Segen so viel stärker
    starsFrom: 20,          // Weiterziehen: ein Stern je Erwachsene über dieser Zahl
    starBonus: 0.01,        // je jemals verdientem Stern: alles und alle Lager +1 %
    signBonus: 0.05,        // Zeichen eines Sternbilds: sein Job +5 %
    batMilestones: [25, 50, 100], // Chronik
    nameMax: 24,            // Sternbild-Name
    offlineLong: 7 * 86400, // mit der Himmelsgabe Lange Abwesenheit
    offlineMax: 3 * 86400,
    logMax: 100,
    chronicleMax: 500,
    startText: 'Eine kleine Fledermaus in einem stillen Wald. Es wird Nacht.',
  },

  // luxury: hebt die Zufriedenheit, solange ≥ 1 da ist. use: so viel nascht jede Erwachsene davon je Nachtsekunde
  // (Kristalle funkeln nur und bleiben).
  resources: [
    { id: 'fruit', name: 'Früchte', one: 'Frucht', cap: 100 },
    { id: 'twigs', name: 'Zweige', one: 'Zweig', cap: 60 },
    { id: 'dreams', name: 'Träume', one: 'Traum', cap: 50 },
    { id: 'guano', name: 'Guano', one: 'Guano', cap: 50, requires: { seen: 'guano' } },
    { id: 'echo', name: 'Echo', one: 'Echo', cap: 100, requires: { tech: 'echolocation' } },
    { id: 'moss', name: 'Moos', one: 'Moos', cap: 60, requires: { tech: 'mosscare' } },
    { id: 'pebbles', name: 'Kiesel', one: 'Kiesel', cap: 80, requires: { tech: 'cavelore' } },
    { id: 'nectar', name: 'Nektar', one: 'Nektar', cap: 30, luxury: true, use: 0.001, requires: { tech: 'pollination' } },
    { id: 'crystals', name: 'Kristalle', one: 'Kristall', cap: 20, luxury: true, requires: { tech: 'cavelore' } },
    { id: 'nuts', name: 'Nüsse', one: 'Nuss', cap: 40, luxury: true, use: 0.001, requires: { seen: 'nuts' } },
    { id: 'silk', name: 'Seide', one: 'Seide', cap: 30, luxury: true, requires: { seen: 'silk' } },
    { id: 'leaves', name: 'Laub', one: 'Laub', cap: 50, requires: { seen: 'leaves' } },
    { id: 'glowdust', name: 'Leuchtstaub', one: 'Leuchtstaub', cap: 40, requires: { seen: 'glowdust' } },
    { id: 'moonlight', name: 'Mondlicht', one: 'Mondlicht', cap: 100, requires: { tech: 'moonlore' } },
    { id: 'starmaps', name: 'Sternkarten', one: 'Sternkarte', cap: 30, requires: { seen: 'starmaps' } },
    // crafted: aus der Werkstatt, kein Lager, stehen nur im Reiter Werkstatt
    { id: 'wicker', name: 'Geflecht', one: 'Geflecht', cap: Infinity, crafted: true, requires: { tech: 'crafting' } },
    { id: 'slab', name: 'Kieselplatten', one: 'Kieselplatte', cap: Infinity, crafted: true, requires: { tech: 'crafting' } },
    { id: 'cushion', name: 'Moospolster', one: 'Moospolster', cap: Infinity, crafted: true, requires: { tech: 'upholstery' } },
    { id: 'lens', name: 'Kristalllinsen', one: 'Kristalllinse', cap: Infinity, crafted: true, requires: { tech: 'lensgrinding' } },
    // perUnit: Wirkung je ganzem Stück im Bestand
    { id: 'silkThread', name: 'Seidenfaden', one: 'Seidenfaden', cap: Infinity, crafted: true, requires: { tech: 'weaving' } },
    { id: 'echoMap', name: 'Echokarten', one: 'Echokarte', cap: Infinity, crafted: true, perUnit: { 'echo.bonus': 0.02 },
      requires: { tech: 'weaving' } },
    { id: 'dreamBook', name: 'Traumbücher', one: 'Traumbuch', cap: Infinity, crafted: true, perUnit: { 'dreams.cap': 25 },
      requires: { tech: 'dreamwriting' } },
    { id: 'leafBlanket', name: 'Laubdecken', one: 'Laubdecke', cap: Infinity, crafted: true, requires: { tech: 'winterrest' } },
    { id: 'lantern', name: 'Lampions', one: 'Lampion', cap: Infinity, crafted: true, requires: { tech: 'lanterns' } },
  ],

  // Rezepte der Werkstatt: Id = hergestellte Ware
  recipes: [
    { id: 'wicker', cost: { twigs: 50 } },
    { id: 'slab', cost: { pebbles: 50 } },
    { id: 'cushion', cost: { moss: 40, wicker: 1 } },
    { id: 'lens', cost: { crystals: 10, slab: 2 } },
    { id: 'silkThread', cost: { silk: 20 } },
    { id: 'echoMap', cost: { echo: 200, silkThread: 2 } },
    { id: 'dreamBook', cost: { dreams: 300, silkThread: 1 } },
    { id: 'leafBlanket', cost: { leaves: 40, silkThread: 1 } },
    { id: 'lantern', cost: { glowdust: 25, silkThread: 1 } },
  ],

  clicks: [
    { id: 'fruit', name: 'Früchte pflücken' },
    { id: 'twigs', name: 'Zweige sammeln' },
  ],

  // effects: '<id>.night' = Ertrag/s nachts, '<id>.cap' = Lager, '<id>.bonus' = Anteil obendrauf, 'bats.cap' = Plätze,
  // 'babies.cap' = Babyplätze, 'bld.<id>' = alle Wirkungen dieses Gebäudes +x %, 'job.<id>' = dieser Job +x %,
  // 'craft.bonus' = Ausbeute der Werkstatt, 'happy.bonus' = Zufriedenheit, 'cap.bonus' = alle Lager +x %,
  // 'work.bonus' = Nachtarbeit, 'winter.hunger' = Winterhunger −x %, 'research.discount' = Forschung billiger,
  // 'trade.bonus' = Tausch-Ausbeute, 'friend.bonus' = Freundschaft je Tausch, 'per.<id>' = Ware je Stück +x %,
  // 'bless.bonus' = Segen +x %, 'all.bonus' = alles, was entsteht, +x %, 'arrival.speed' = Zuzug schneller,
  // 'star.rate' = Sternschnuppen häufiger, 'star.auto' = Chance auf Auto-Fang, 'explore.discount' = Erkundung billiger.
  // requires: tech, seen (Merker), place (entdeckter Ort), song (gesungenes Mondlied)
  buildings: [
    { id: 'fruitTree', name: 'Obstbaum', desc: 'Aus verteilten Kernen wächst ein Baum. Trägt nachts Früchte.',
      cost: { fruit: 10 }, ratio: 1.12, effects: { 'fruit.night': 0.5 } },
    { id: 'roost', name: 'Schlafplatz', desc: 'Ein ruhiger Ast zum Kopfüberhängen. Platz für zwei.',
      cost: { twigs: 10 }, ratio: 1.6, effects: { 'bats.cap': 2 } },
    { id: 'larder', name: 'Vorratshöhle', desc: 'Eine trockene Höhle für Vorräte.',
      cost: { twigs: 40 }, ratio: 1.3,
      effects: { 'fruit.cap': 150, 'twigs.cap': 100, 'pebbles.cap': 100, 'moss.cap': 80, 'guano.cap': 50 },
      requires: { tech: 'orchard' } },
    { id: 'dreamcatcher', name: 'Traumfänger', desc: 'Hält Träume fest, damit keiner verfliegt.',
      cost: { twigs: 30 }, ratio: 1.18, effects: { 'dreams.cap': 40, 'dreams.bonus': 0.05 }, requires: { tech: 'dreamlore' } },
    { id: 'listeningPost', name: 'Horchposten', desc: 'Ein stiller Ast, von dem aus man weit lauschen kann.',
      cost: { twigs: 60 }, ratio: 1.2, effects: { 'echo.cap': 50, 'echo.bonus': 0.1 }, requires: { tech: 'echolocation' } },
    { id: 'nightflowers', name: 'Nachtblumen', desc: 'Blüten, die erst nachts aufgehen. Die Obstbäume freuen sich mit.',
      cost: { fruit: 80, twigs: 20 }, ratio: 1.15, effects: { 'nectar.night': 0.05, 'bld.fruitTree': 0.02 },
      requires: { tech: 'pollination' } },
    { id: 'niche', name: 'Höhlennische', desc: 'Eine gemütliche Felsnische. Platz für drei.',
      cost: { pebbles: 60 }, ratio: 1.4, effects: { 'bats.cap': 3 }, requires: { tech: 'cavelore' } },
    { id: 'pebblePit', name: 'Kieselgrube', desc: 'Hier finden sich Kiesel ganz leicht.',
      cost: { twigs: 120 }, ratio: 1.15, effects: { 'job.pebbler': 0.2, 'pebbles.cap': 50 }, requires: { tech: 'cavelore' } },
    { id: 'nursery', name: 'Wochenstube', desc: 'Warm, weich und gut behütet. Platz für zwei Junge.',
      cost: { twigs: 150, moss: 60 }, ratio: 1.35, effects: { 'babies.cap': 2 }, requires: { tech: 'broodcare' } },
    { id: 'dungPit', name: 'Düngergrube', desc: 'Hier wartet der Guano, bis die Bäume ihn brauchen.',
      cost: { pebbles: 80 }, ratio: 1.2, effects: { 'guano.cap': 150 }, requires: { tech: 'fertilizing' } },
    { id: 'workshop', name: 'Werkstatt', desc: 'Ein Platz zum Flechten, Schleifen und Basteln.',
      cost: { twigs: 200, pebbles: 100 }, ratio: 1.15, effects: { 'craft.bonus': 0.06 }, requires: { tech: 'crafting' } },
    { id: 'dreamArchive', name: 'Traumarchiv', desc: 'Regale voller aufgeschriebener Träume.',
      cost: { wicker: 10, slab: 5 }, ratio: 1.15, effects: { 'dreams.cap': 300, 'dreams.bonus': 0.05 },
      requires: { tech: 'crafting' } },
    { id: 'cuddleCave', name: 'Kuschelhöhle', desc: 'Weich gepolstert. Wer hier schläft, träumt besonders schön.',
      cost: { cushion: 5, slab: 3 }, ratio: 1.25, effects: { 'bats.cap': 2, 'dreams.bonus': 0.1 },
      requires: { tech: 'upholstery' } },
    { id: 'storeCave', name: 'Lagerhöhle', desc: 'Eine große, trockene Höhle mit Regalen aus Kieselplatten.',
      cost: { slab: 5, wicker: 5 }, ratio: 1.2,
      effects: { 'fruit.cap': 300, 'twigs.cap': 200, 'pebbles.cap': 200, 'moss.cap': 150, 'nectar.cap': 50, 'crystals.cap': 50,
        'nuts.cap': 50, 'silk.cap': 50 },
      requires: { tech: 'storage' } },
    { id: 'attic', name: 'Dachkammer', desc: 'Ein warmer Platz unter einem Dach, wie in der Scheune.',
      cost: { wicker: 15, slab: 10 }, ratio: 1.25, effects: { 'bats.cap': 5 }, requires: { tech: 'architecture' } },
    { id: 'singingCave', name: 'Singhöhle', desc: 'Hier klingt jedes Lied doppelt so schön.',
      cost: { pebbles: 400, cushion: 10 }, ratio: 1.2, effects: { 'happy.bonus': 0.05 }, requires: { tech: 'choir' } },
    { id: 'tradingPost', name: 'Tauschplatz', desc: 'Ein Ast, an dem sich alle Nachbarn gern treffen.',
      cost: { wicker: 20 }, ratio: 1.2, effects: { 'trade.bonus': 0.05 }, requires: { tech: 'trading' } },
    { id: 'winterQuarters', name: 'Winterquartier', desc: 'Dick mit Laub gepolstert. Hier friert niemand.',
      cost: { leafBlanket: 5, slab: 10 }, ratio: 1.2, effects: { 'winter.hunger': 0.05 }, requires: { tech: 'winterrest' } },
    { id: 'moonAltar', name: 'Mondaltar', desc: 'Ein glatter Stein, der das Mondlicht sammelt.',
      cost: { pebbles: 500, crystals: 10 }, ratio: 1.2, effects: { 'moonlight.cap': 100, 'moonlight.bonus': 0.05 },
      requires: { tech: 'moonlore' } },
    { id: 'observatory', name: 'Sternwarte', desc: 'Durch Kristalllinsen sieht man jede Sternschnuppe kommen.',
      cost: { lens: 3, slab: 10 }, ratio: 1.3, effects: { 'star.rate': 0.1, 'star.auto': 0.1, 'starmaps.cap': 10 },
      requires: { tech: 'astronomy' } },
  ],

  jobs: [
    { id: 'twigCarrier', name: 'Zweigträgerin', effects: { 'twigs.night': 0.3 } },
    { id: 'gatherer', name: 'Sammlerin', effects: { 'fruit.night': 1 }, requires: { tech: 'orchard' } },
    { id: 'scout', name: 'Kundschafterin', effects: { 'echo.night': 0.2 }, requires: { tech: 'echolocation' } },
    { id: 'mossPicker', name: 'Moospflückerin', effects: { 'moss.night': 0.25 }, requires: { tech: 'mosscare' } },
    { id: 'pebbler', name: 'Kieselsucherin', effects: { 'pebbles.night': 0.25, 'crystals.night': 0.002 },
      requires: { tech: 'cavelore' } },
    // note: Text statt Wirkung (die Tüftlerin stellt her, was im Reiter Werkstatt gewählt ist)
    { id: 'tinkerer', name: 'Tüftlerin', effects: {}, note: 'stellt nachts das gewählte Rezept her',
      requires: { tech: 'tinkering' } },
    { id: 'moonSinger', name: 'Mondsängerin', effects: { 'moonlight.night': 0.05 }, requires: { tech: 'moonlore' } },
  ],

  techs: [
    { id: 'mooncalendar', name: 'Mondkalender', desc: 'Den Mond beobachten und die Tage zählen.',
      cost: { dreams: 15 }, unlockText: 'Kalender, Mondphasen, Sternschnuppen, Chronik' },
    { id: 'orchard', name: 'Obstbau', desc: 'Bäume pflegen und Früchte gezielt ernten.',
      cost: { dreams: 40 }, requires: { tech: 'mooncalendar' } },
    { id: 'dreamlore', name: 'Traumdeutung', desc: 'Träume verstehen und aufbewahren.',
      cost: { dreams: 45 }, requires: { tech: 'mooncalendar' } },
    { id: 'echolocation', name: 'Echoortung', desc: 'Rufen und lauschen: Das Echo verrät, was hinter den Bäumen liegt.',
      cost: { dreams: 80 }, requires: { tech: 'orchard' }, unlockText: 'Reiter Erkundung' },
    { id: 'mosscare', name: 'Moospflege', desc: 'Weiches Moos pflücken, ohne es kaputt zu machen.',
      cost: { dreams: 120 }, requires: { place: 'brook' } },
    { id: 'pollination', name: 'Bestäubung', desc: 'Von Blüte zu Blüte fliegen, damit mehr wächst.',
      cost: { dreams: 160 }, requires: { place: 'meadow' } },
    { id: 'cavelore', name: 'Höhlenkunde', desc: 'Sich in Höhlen zurechtfinden und Kiesel sammeln.',
      cost: { dreams: 220 }, requires: { place: 'cave' } },
    { id: 'broodcare', name: 'Brutpflege', desc: 'Wie man Junge warm hält und gut umsorgt.',
      cost: { dreams: 280 }, requires: { tech: 'mosscare' }, unlockText: 'Babyzeit im Frühling' },
    { id: 'fertilizing', name: 'Düngung', desc: 'Guano macht die Obstbäume stark.',
      cost: { dreams: 350 }, requires: { tech: 'cavelore' }, unlockText: 'Düngen' },
    { id: 'crafting', name: 'Handwerk', desc: 'Zweige flechten und Kiesel zu Platten legen.',
      cost: { dreams: 450 }, requires: { tech: 'cavelore' }, unlockText: 'Reiter Werkstatt, Geflecht, Kieselplatte' },
    { id: 'order', name: 'Ordnung', desc: 'Jede Neue weiß gleich, was sie tun soll.',
      cost: { dreams: 550 }, requires: { tech: 'crafting' }, unlockText: 'Job für neue Fledermäuse' },
    { id: 'upholstery', name: 'Polsterei', desc: 'Moos in Geflecht stopfen, fertig ist ein weiches Polster.',
      cost: { dreams: 700 }, requires: { tech: ['crafting', 'mosscare'] }, unlockText: 'Moospolster' },
    { id: 'storage', name: 'Vorratskunde', desc: 'Ordentlich stapeln, damit mehr hineinpasst.',
      cost: { dreams: 850 }, requires: { tech: 'crafting' } },
    { id: 'architecture', name: 'Baukunst', desc: 'Von den Eulen abgeschaut: So baut man ein Dach.',
      cost: { dreams: 1300 }, requires: { tech: 'crafting', place: 'barn' } },
    { id: 'choir', name: 'Chorgesang', desc: 'Gemeinsam singen macht alle froh.',
      cost: { dreams: 2000 }, requires: { tech: 'upholstery' } },
    { id: 'tinkering', name: 'Tüftelei', desc: 'Manche Fledermäuse basteln am liebsten die ganze Nacht.',
      cost: { dreams: 900 }, requires: { tech: 'order' } },
    { id: 'lensgrinding', name: 'Linsenschliff', desc: 'Kristalle schleifen, bis man durch sie die Sterne sieht.',
      cost: { dreams: 6000 }, requires: { tech: 'architecture' }, unlockText: 'Kristalllinse' },
    { id: 'trading', name: 'Tauschhandel', desc: 'Mit den Nachbarn tauschen, was man selbst nicht hat.',
      cost: { dreams: 1000 }, requires: { tech: 'crafting' }, unlockText: 'Reiter Nachbarn' },
    { id: 'weaving', name: 'Weberei', desc: 'Aus Spinnenseide feine Fäden ziehen.',
      cost: { dreams: 1600 }, requires: { tech: 'trading', place: 'spiders' }, unlockText: 'Seidenfaden, Echokarte' },
    { id: 'dreamwriting', name: 'Traumschrift', desc: 'Träume in Bücher schreiben, damit keiner verloren geht.',
      cost: { dreams: 2500 }, requires: { tech: 'weaving' }, unlockText: 'Traumbuch' },
    { id: 'winterrest', name: 'Winterruhe', desc: 'Von den Igeln gelernt: warm eingekuschelt durch den Winter.',
      cost: { dreams: 3000 }, requires: { tech: 'weaving', place: 'hedge' }, unlockText: 'Laubdecke' },
    { id: 'lanterns', name: 'Laternenkunde', desc: 'Leuchtstaub in Seide hüllen, schon leuchtet ein Lampion.',
      cost: { dreams: 5000 }, requires: { tech: 'weaving', place: 'glade' }, unlockText: 'Lampion' },
    { id: 'moonlore', name: 'Mondkunde', desc: 'Auf dem Mondfelsen dem Mond ganz nah sein und ihm etwas vorsingen.',
      cost: { dreams: 1600 }, requires: { place: 'moonrock' }, unlockText: 'Reiter Mondkult, Mondlicht' },
    { id: 'astronomy', name: 'Sternkunde', desc: 'Vom Sternenhügel aus die Sterne zählen und ihre Namen lernen.',
      cost: { dreams: 7500, starmaps: 5 }, requires: { tech: 'lensgrinding', place: 'starhill' } },
    { id: 'mapping', name: 'Kartenkunde', desc: 'Echokarten und Sternkarten zusammenlegen: So findet man überall hin.',
      cost: { dreams: 9000, starmaps: 10 }, requires: { tech: 'astronomy' }, effects: { 'per.echoMap': 1 },
      unlockText: 'Ferne Wälder' },
    { id: 'departure', name: 'Aufbruch', desc: 'Die Kolonie ist groß geworden. Zeit, weiterzuziehen und neu anzufangen.',
      cost: { dreams: 12000, starmaps: 25 }, requires: { place: 'farwoods' }, unlockText: 'Weiterziehen, Reiter Sterne' },
  ],

  // Einmalige Verbesserungen aus der Werkstatt: sichtbar, sobald eine Werkstatt steht, requires erfüllt ist
  // und alle Ressourcen in den Kosten freigeschaltet sind.
  upgrades: [
    { id: 'baskets', name: 'Geflochtene Körbe', desc: 'Da passen viel mehr Früchte hinein.',
      cost: { wicker: 10, dreams: 300 }, effects: { 'job.gatherer': 0.25 } },
    { id: 'straps', name: 'Tragegurte', desc: 'Zweige tragen sich so viel leichter.',
      cost: { wicker: 10, dreams: 300 }, effects: { 'job.twigCarrier': 0.25 } },
    { id: 'shovels', name: 'Kieselschaufeln', desc: 'Kleine Schaufeln aus Kieselplatten.',
      cost: { slab: 10, dreams: 500 }, effects: { 'job.pebbler': 0.25 } },
    { id: 'mossbeds', name: 'Moosbetten', desc: 'Weiche Betten für süße Träume.',
      cost: { cushion: 10, dreams: 600 }, effects: { 'dreams.bonus': 0.2 } },
    { id: 'bigBaskets', name: 'Große Vorratskörbe', desc: 'Mehr Platz in jeder Vorratshöhle.',
      cost: { wicker: 25, dreams: 700 }, effects: { 'bld.larder': 0.5 } },
    { id: 'workbench', name: 'Werkbank', desc: 'Ein fester Tisch, auf dem nichts verrutscht.',
      cost: { wicker: 20, slab: 20 }, effects: { 'craft.bonus': 0.1 } },
    { id: 'fertileBeds', name: 'Gedüngte Beete', desc: 'Etwas Guano, und die Nachtblumen blühen noch schöner.',
      cost: { guano: 500, dreams: 800 }, effects: { 'bld.nightflowers': 0.5 }, requires: { tech: ['pollination', 'fertilizing'] } },
    { id: 'funnel', name: 'Echotrichter', desc: 'Kristalllinsen bündeln jedes Echo.',
      cost: { lens: 5, dreams: 2000 }, effects: { 'echo.bonus': 0.25 } },
    { id: 'hammocks', name: 'Seidene Hängematten', desc: 'Sanft schaukeln und dabei wegträumen.',
      cost: { silkThread: 20, dreams: 1200 }, effects: { 'dreams.bonus': 0.1 } },
    { id: 'nutStore', name: 'Nussvorrat', desc: 'Ein kleiner Vorrat für kalte Tage.',
      cost: { nuts: 100, wicker: 10 }, effects: { 'winter.hunger': 0.15 } },
    { id: 'mapTable', name: 'Kartentisch', desc: 'Alle Echokarten auf einem Tisch: Man sieht, wo es langgeht.',
      cost: { echoMap: 10, dreams: 2500 }, effects: { 'explore.discount': 0.2 } },
    { id: 'dreamDiary', name: 'Traumtagebuch', desc: 'Jeden Morgen die Träume der Nacht aufschreiben.',
      cost: { dreamBook: 10 }, effects: { 'per.dreamBook': 0.5 } },
    { id: 'mossInsulation', name: 'Moosdämmung', desc: 'Moos in jede Ritze stopfen, damit es drinnen warm bleibt.',
      cost: { cushion: 20, leafBlanket: 10 }, effects: { 'bld.winterQuarters': 0.5 } },
    { id: 'glowPaths', name: 'Leuchtpfade', desc: 'Lampions zeigen den Kundschafterinnen den Weg.',
      cost: { lantern: 10 }, effects: { 'job.scout': 0.25 } },
    { id: 'moonMirror', name: 'Mondspiegel', desc: 'Geschliffene Linsen fangen noch mehr Mondlicht ein.',
      cost: { lens: 5, dreams: 4500 }, effects: { 'moonlight.bonus': 0.25 }, requires: { tech: 'moonlore' } },
  ],

  // Mondlieder: einmal singen, wirken dauerhaft.
  songs: [
    { id: 'silver', name: 'Silberlied', desc: 'Ein leises Lied, das süße Träume bringt.', cost: { moonlight: 50 },
      effects: { 'dreams.bonus': 0.1 } },
    { id: 'harvestSong', name: 'Erntelied', desc: 'Die Obstbäume hören gern zu.', cost: { moonlight: 80 },
      effects: { 'fruit.bonus': 0.1 } },
    { id: 'echoSong', name: 'Echolied', desc: 'Jede Strophe hallt noch weiter.', cost: { moonlight: 120 },
      effects: { 'echo.bonus': 0.1 } },
    { id: 'cradle', name: 'Wiegenlied', desc: 'Zum Einschlafen für die Kleinsten.', cost: { moonlight: 200 },
      effects: { 'babies.bonus': 0.5 } },
    { id: 'winterSong', name: 'Winterlied', desc: 'Wer mitsingt, friert nicht so schnell.', cost: { moonlight: 300 },
      effects: { 'winter.hunger': 0.25 } },
    { id: 'friendSong', name: 'Freundschaftslied', desc: 'Die Nachbarn singen fröhlich mit.', cost: { moonlight: 450 },
      effects: { 'friend.bonus': 0.5 } },
    { id: 'starSong', name: 'Sternenlied', desc: 'Die Sterne mögen es und fallen öfter.', cost: { moonlight: 650 },
      effects: { 'star.rate': 1 } },
    { id: 'feast', name: 'Festlied', desc: 'Für ein noch schöneres Mondfest.', cost: { moonlight: 900 },
      effects: { 'bless.bonus': 0.25 }, unlockText: 'Warme Herzen, Handelsglück' },
    { id: 'grandChoir', name: 'Großer Mondchor', desc: 'Die ganze Kolonie singt, und alles gelingt leichter.',
      cost: { moonlight: 1500 }, effects: { 'all.bonus': 0.1 } },
  ],

  // Himmelsgaben: kosten freie Sterne und bleiben für immer. start wirkt ab der nächsten Kolonie.
  perks: [
    { id: 'earlyStart', name: 'Frühstart', cost: 5, desc: 'Start mit 20 Früchten, 20 Zweigen, 1 Obstbaum, 1 Schlafplatz.',
      start: { res: { fruit: 20, twigs: 20 }, bld: { fruitTree: 1, roost: 1 } } },
    { id: 'swiftWings', name: 'Schnelle Flügel', cost: 10, desc: 'Neue Fledermäuse kommen doppelt so schnell.',
      effects: { 'arrival.speed': 1 } },
    { id: 'memory', name: 'Gutes Gedächtnis', cost: 15, desc: 'Mondkalender, Obstbau, Traumdeutung und Echoortung sind schon erforscht.',
      start: { tech: ['mooncalendar', 'orchard', 'dreamlore', 'echolocation'] } },
    { id: 'localLore', name: 'Ortskunde', cost: 20, desc: 'Bachufer, Blumenwiese und Tropfsteinhöhle sind schon entdeckt.',
      start: { places: ['brook', 'meadow', 'cave'] } },
    { id: 'bigFamily', name: 'Große Familie', cost: 25, desc: 'Mehr Junge in jeder Babyzeit.', effects: { 'babies.bonus': 0.5 } },
    { id: 'oldFriends', name: 'Alte Freunde', cost: 30, desc: 'Alle Nachbarn starten mit Freundschaftsstufe 1.',
      start: { friends: 5 } },
    { id: 'wiseSleep', name: 'Weiser Schlaf', cost: 40, desc: 'Tiefer schlafen, mehr träumen.', effects: { 'dreams.bonus': 0.15 } },
    { id: 'longAbsence', name: 'Lange Abwesenheit', cost: 50, desc: 'Wenn du weg bist, zählen bis zu 7 Tage.' },
    { id: 'eternalMoon', name: 'Ewiger Mond', cost: 60, desc: 'Jeder Segen wirkt stärker.', effects: { 'bless.bonus': 0.25 } },
    { id: 'starRain', name: 'Sternenregen', cost: 80, desc: 'Doppelt so viele Sternschnuppen, und mehr fängt sich von selbst.',
      effects: { 'star.rate': 1, 'star.auto': 0.25 } },
    { id: 'farSight', name: 'Weitsicht', cost: 100, desc: 'Die Erkundung braucht weniger Echo.', effects: { 'explore.discount': 0.25 } },
  ],

  // Vorschläge für Sternbild-Namen; genommen wird der erste noch freie.
  constellationNames: ['Kleine Flatter', 'Mausohr', 'Nachtschwinge', 'Mondsegler', 'Silberohr', 'Leiser Ruf',
    'Kopfüber', 'Große Kuschelhöhle', 'Sternenflügel', 'Glühwürmchenpfad', 'Obstschale', 'Nachtfalterin',
    'Weiches Moos', 'Traumfängerin', 'Flaumpelz', 'Mondsichel'],

  // Segen fürs Mondfest: bei Vollmond wählen, wirken bis zum nächsten Vollmond.
  blessings: [
    { id: 'harvest', name: 'Reiche Ernte', effects: { 'fruit.bonus': 0.3 } },
    { id: 'deepDreams', name: 'Tiefe Träume', effects: { 'dreams.bonus': 0.3 } },
    { id: 'farFlight', name: 'Weiter Flug', effects: { 'echo.bonus': 0.3 } },
    { id: 'warmHearts', name: 'Warme Herzen', effects: { 'happy.bonus': 0.15 }, requires: { song: 'feast' } },
    { id: 'tradeLuck', name: 'Handelsglück', effects: { 'trade.bonus': 0.3 }, requires: { song: 'feast' } },
  ],

  // Nachbarn: entdeckt über ihren Ort, Tauschen ab Tauschhandel. help wirkt einmal je Freundschaftsstufe.
  // dat: für „Freundschaft mit …“
  neighbors: [
    { id: 'frogs', name: 'Frösche', dat: 'den Fröschen', place: 'brook', desc: 'Sie lieben Nektar und geben dafür weiches Moos.',
      wants: { nectar: 15 }, gives: { moss: 80 }, help: { 'happy.bonus': 0.02 } },
    { id: 'owls', name: 'Eulen', dat: 'den Eulen', place: 'barn', desc: 'Weise und nachtaktiv. Für Träume zeigen sie ihre Sternkarten.',
      wants: { dreams: 150 }, gives: { starmaps: 1 }, help: { 'research.discount': 0.03 } },
    { id: 'hedgehogs', name: 'Igel', dat: 'den Igeln', place: 'hedge', desc: 'Sie düngen gern ihre Hecke und haben Laub im Überfluss.',
      wants: { guano: 40 }, gives: { leaves: 40 }, help: { 'winter.hunger': 0.05 } },
    { id: 'squirrels', name: 'Eichhörnchen', dat: 'den Eichhörnchen', place: 'oakgrove',
      desc: 'Flink und sparsam. Für Zweige für ihre Kobel geben sie Nüsse.', wants: { twigs: 150 }, gives: { nuts: 15 },
      help: { 'cap.bonus': 0.04 } },
    { id: 'spiders', name: 'Spinnen', dat: 'den Spinnen', place: 'spiders', desc: 'Freundliche Weberinnen mit viel Hunger auf Obst.',
      wants: { fruit: 120 }, gives: { silk: 12 }, help: { 'craft.bonus': 0.03 } },
    { id: 'moles', name: 'Maulwürfe', dat: 'den Maulwürfen', place: 'moles', desc: 'Sie graben Kiesel und manchmal Kristalle aus.',
      wants: { guano: 60 }, gives: { pebbles: 150, crystals: 2 }, help: { 'pebbles.bonus': 0.04 } },
    { id: 'fireflies', name: 'Glühwürmchen', dat: 'den Glühwürmchen', place: 'glade', desc: 'Kleine Lichter, die Nektar über alles lieben.',
      wants: { nectar: 25 }, gives: { glowdust: 20 }, help: { 'work.bonus': 0.02 } },
  ],

  // Orte für die Erkundung: echo = so viel Echo braucht die Entdeckung; effects wirken danach dauerhaft.
  places: [
    { id: 'brook', name: 'Bachufer', desc: 'Weiches Moos am Wasser. Die Frösche quaken zur Begrüßung.', echo: 30 },
    { id: 'meadow', name: 'Blumenwiese', desc: 'Nachts duften hier Blüten voller Nektar.', echo: 60 },
    { id: 'cave', name: 'Tropfsteinhöhle', desc: 'Eine kühle Höhle mit glitzernden Kieseln und Kristallen.', echo: 120 },
    { id: 'barn', name: 'Alte Scheune', desc: 'Unter dem Dach wohnen weise Eulen.', echo: 250 },
    { id: 'hedge', name: 'Igelhecke', desc: 'Dichtes Gestrüpp voller Laub. Hier schnaufen Igel.', echo: 400 },
    { id: 'oakgrove', name: 'Eichenhain', desc: 'Große Eichen mit vielen Zweigen. Eichhörnchen flitzen umher.', echo: 600,
      effects: { 'job.twigCarrier': 0.1 } },
    { id: 'spiders', name: 'Spinnenwinkel', desc: 'Feine Netze glänzen im Mondlicht. Die Spinnen sind freundlich.', echo: 900 },
    { id: 'moles', name: 'Maulwurfswiese', desc: 'Überall kleine Hügel. Die Maulwürfe graben nach Kieseln.', echo: 1300 },
    { id: 'glade', name: 'Glühwürmchenlichtung', desc: 'Tausend kleine Lichter tanzen über dem Gras.', echo: 1800 },
    { id: 'moonrock', name: 'Mondfelsen', desc: 'Ein heller Felsen, auf den der Mond besonders schön scheint.', echo: 2500 },
    { id: 'starhill', name: 'Sternenhügel', desc: 'Von hier sieht man alle Sterne. Ein guter Ort zum Träumen.', echo: 4000 },
    // cost: wird bei der Entdeckung genommen; ist das Echo voll und fehlt noch etwas, wartet die Entdeckung
    { id: 'farwoods', name: 'Ferne Wälder', desc: 'Hinter dem Sternenhügel wartet ein Wald, den noch niemand kennt.',
      echo: 8000, cost: { echoMap: 5 }, requires: { tech: 'mapping' } },
  ],
};

if (typeof module !== 'undefined') module.exports = DATA;
