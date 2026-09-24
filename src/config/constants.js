// src/config/constants.js
// Tabelas estáticas usadas por vários módulos de worldstate/highest/incarnon.

const INCARNON_EPOCH_UTC = Date.UTC(2026, 8, 15) // 15 Sep 2026 = Week C
const INCARNON_EPOCH_INDEX = 2 // C

const INCARNON_ROTATIONS = [
  { letter: 'A', weapons: ['Braton', 'Lato', 'Skana', 'Paris', 'Kunai'] },
  { letter: 'B', weapons: ['Boar', 'Gammacor', 'Angstrum', 'Gorgon', 'Anku'] },
  { letter: 'C', weapons: ['Bo', 'Latron', 'Furis', 'Furax', 'Strun'] },
  { letter: 'D', weapons: ['Lex', 'Magistar', 'Boltor', 'Bronco', 'Ceramic Dagger'] },
  { letter: 'E', weapons: ['Torid', 'Dual Toxocyst', 'Dual Ichor', 'Miter', 'Atomos'] },
  { letter: 'F', weapons: ['Ack & Brunt', 'Soma', 'Vasto', 'Nami Solo', 'Burston'] },
  { letter: 'G', weapons: ['Zylok', 'Sibear', 'Dread', 'Despair', 'Hate'] },
  { letter: 'H', weapons: ['Dera', 'Sybaris', 'Cestra', 'Sicarus', 'Okina'] },
  { letter: 'I', weapons: ['Vectis', 'Stug', 'Ballistica', 'Destreza', 'Obex'] }
]

const ARBY_TIERS = {
  'Tyana Pass': 'S', 'Alator': 'S', 'Callisto': 'S', 'Xini': 'S', 'Cytherean': 'S',
  'Munio': 'A', 'Seimeni': 'A', 'Cinxia': 'A', 'Casta': 'A', 'Oestrus': 'A', 'Hyf': 'A',
  'Larzac': 'B', 'Sechura': 'B', 'Hydron': 'B', 'Helene': 'B', 'Ose': 'B', 'Akkad': 'B',
  'Kala-azar': 'B', 'Odin': 'B', 'Mithra': 'B', 'Belenus': 'B', 'Taranis': 'B',
  'Coba': 'C', 'Spear': 'C', 'Kadesh': 'C', 'Paimon': 'C', 'Lith': 'C', 'Stephano': 'C',
  'Tessera': 'C', 'Outer Terminus': 'C',
  'Umbriel': 'D', 'Cerberus': 'D', 'Lares': 'D', 'Sangeru': 'D', 'Sinai': 'D',
  'Gulliver': 'D', 'Romula': 'D', 'Proteus': 'D', 'Io': 'D', 'Stöfler': 'D', 'Gaia': 'D',
  'Terrorem': 'Special', 'Ani': 'Special', 'Mot': 'Special', 'Kappa': 'Special',
  'Ur': 'Special', 'Laomedeia': 'Special', 'Apollo': 'Special', 'Ganymede': 'Special'
}

const TIER_EMOJI = { S: '🔵', A: '🟢', B: '🟡', C: '🟠', D: '🟤', F: '🔴', Special: '🟣' }

const POLARITY_SYMBOL = {
  madurai: 'V', vazarin: 'D', naramon: '—', zenurik: '=',
  unairu: 'R', penjaga: 'Y', umbra: 'U', aura: 'O'
}

const HIGHEST_CATEGORIES = {
  1: { id: 'prime_sets', label: 'Prime Sets', type: 'set' },
  2: { id: 'mods_maxed', label: 'Mods (Maxed)', type: 'mod', rank: 'max' },
  3: { id: 'mods_unranked', label: 'Mods (Unranked)', type: 'mod', rank: 0 },
  4: { id: 'primed_maxed', label: 'Primed/Archon (Maxed)', type: 'primed', rank: 'max' },
  5: { id: 'primed_unranked', label: 'Primed/Archon (Unranked)', type: 'primed', rank: 0 },
  6: { id: 'arcanes_maxed', label: 'Arcanes (Maxed)', type: 'arcane', rank: 'max' },
  7: { id: 'arcanes_unranked', label: 'Arcanes (Unranked)', type: 'arcane', rank: 0 },
  8: { id: 'warframe_sets', label: 'Warframes (Prime Sets)', type: 'warframe_set' },
  9: { id: 'augments', label: 'Augments', type: 'augment' }
}

const FISS_INTEREST_DEFENSE = [
  'helene', 'hydron', 'casta', 'stephano', 'io', 'seimeni',
  'belenus', 'taranis', 'hyf', 'outer terminus', 'tessera'
]
const FISS_INTEREST_EXTERMINATE = ['mariana', 'e prime', 'oxomoco']

const STEAL_SCAN_WEAPONS_FALLBACK = [
  'torid', 'kuva_bramma', 'kuva_zarr', 'phenmor', 'laetum', 'felarx', 'kuva_heck',
  'burston', 'braton', 'soma', 'tenora', 'acceltra', 'nataruk', 'phantasma',
  'kuva_nukor', 'epitaph', 'tenet_cycron', 'kuva_kohm', 'stahlta', 'trumna'
]

const DESCENDIA_TYPES = {
  UNIQUE: 'Battle Kaithes', Unique: 'Battle Kaithes', DT_UNIQUE: 'Battle Kaithes',
  'LOOT CREATURES': 'Gruzzling Plunder', LOOT_CREATURES: 'Gruzzling Plunder',
  LOOTCREATURES: 'Gruzzling Plunder', LootCreatures: 'Gruzzling Plunder',
  NETRACELLS: 'Targeted Elimination', Netracells: 'Targeted Elimination',
  BOSS: 'Boss Fight', Boss: 'Boss Fight', DT_ASSASSINATION: 'Boss Fight',
  PROTOFRAME: 'Protoframe', Protoframe: 'Protoframe',
  'SABOTAGE HIVE': 'Hive Sabotage', SABOTAGE_HIVE: 'Hive Sabotage',
  SABOTAGEHIVE: 'Hive Sabotage', SabotageHive: 'Hive Sabotage', DT_HIVE: 'Hive Sabotage',
  'SABOTAGE DEFENSE': 'Cradle Defense', SABOTAGE_DEFENSE: 'Cradle Defense',
  SABOTAGEDEFENSE: 'Cradle Defense', SabotageDefense: 'Cradle Defense',
  MIMICS: 'Mimic Plunder', Mimics: 'Mimic Plunder',
  'SHRINE DEFENSE': 'Shrine Defense', SHRINE_DEFENSE: 'Shrine Defense',
  SHRINEDEFENSE: 'Shrine Defense', ShrineDefense: 'Shrine Defense',
  Defense: 'Protoframe Defense', DT_DEFENSE: 'Protoframe Defense',
  DT_INFESTED_SALVAGE: 'Infested Salvage', INFESTED_SALVAGE: 'Infested Salvage',
  InfestedSalvage: 'Infested Salvage', 'INFESTED SALVAGE': 'Infested Salvage',
  DT_EXTERMINATE: 'Exterminate', EXTERMINATE: 'Exterminate', Exterminate: 'Exterminate',
  DT_ALCHEMY: 'Alchemy', ALCHEMY: 'Alchemy', Alchemy: 'Alchemy',
  DT_EXCAVATION: 'Excavation', EXCAVATION: 'Excavation', Excavation: 'Excavation',
  DT_PRESURE_GAUGE: 'Pressure Cooker', DT_PRESSURE_GAUGE: 'Pressure Cooker',
  PRESSURE_GAUGE: 'Pressure Cooker', PRESSURE_COOKER: 'Pressure Cooker',
  'PRESSURE COOKER': 'Pressure Cooker', PressureCooker: 'Pressure Cooker',
  Wisp: 'Wisp', Harrow: 'Harrow', Devil: 'Devil'
}

const DESCENDIA_CHALLENGES = {
  HorseCombatOnly: 'Destroy Hologlobes', 'Horse Combat Only': 'Destroy Hologlobes', HORSECOMBATONLY: 'Destroy Hologlobes',
  VeryToxic: 'Energy Leech, Leech and Venomous Eximus Cabal', 'Very Toxic': 'Energy Leech, Leech and Venomous Eximus Cabal', VERYTOXIC: 'Energy Leech, Leech and Venomous Eximus Cabal',
  BasicLootCreatures: 'Kill 6 Gruzzlings.', 'Basic Loot Creatures': 'Kill 6 Gruzzlings.', BASICLOOTCREATURES: 'Kill 6 Gruzzlings.',
  FireAndIce: 'Arctic, Arson and Blitz Eximus Cabal', 'Fire And Ice': 'Arctic, Arson and Blitz Eximus Cabal', FIREANDICE: 'Arctic, Arson and Blitz Eximus Cabal',
  HardShell: 'Arctic, Energy Leech and Guardian Eximus Cabal', 'Hard Shell': 'Arctic, Energy Leech and Guardian Eximus Cabal', HARDSHELL: 'Arctic, Energy Leech and Guardian Eximus Cabal',
  ArchonBoreal: 'Archon Boreal', 'Archon Boreal': 'Archon Boreal', ARCHONBOREAL: 'Archon Boreal',
  GiantRealm: 'Gigantism', 'Giant Realm': 'Gigantism', GIANTREALM: 'Gigantism', Gigantism: 'Gigantism',
  Sentients: "Tau's Revenge", SENTIENTS: "Tau's Revenge", "Tau's Revenge": "Tau's Revenge",
  HordeWeakpoints: 'Weakpoint Horde', 'Horde Weakpoints': 'Weakpoint Horde', HORDEWEAKPOINTS: 'Weakpoint Horde', 'Weakpoint Horde': 'Weakpoint Horde',
  ShockingLeech: 'Leech, Shock, and Venomous Eximus Cabal', 'Shocking Leech': 'Leech, Shock, and Venomous Eximus Cabal', SHOCKINGLEECH: 'Leech, Shock, and Venomous Eximus Cabal',
  BasicMimics: 'Plunder Roulette', 'Basic Mimics': 'Plunder Roulette', BASICMIMICS: 'Plunder Roulette', 'Plunder Roulette': 'Plunder Roulette',
  HeadShotsOnly: 'Only Weak Points Are Vulnerable', 'Head Shots Only': 'Only Weak Points Are Vulnerable', HEADSHOTSONLY: 'Only Weak Points Are Vulnerable', 'Only Weak Points Are Vulnerable': 'Only Weak Points Are Vulnerable',
  JadeGuardian: 'Guardian, Jade Light and Shock Eximus Cabal', 'Jade Guardian': 'Guardian, Jade Light and Shock Eximus Cabal', JADEGUARDIAN: 'Guardian, Jade Light and Shock Eximus Cabal',
  UnseenFoes: 'Hidden Threats', 'Unseen Foes': 'Hidden Threats', UNSEENFOES: 'Hidden Threats', 'Hidden Threats': 'Hidden Threats',
  PowerHouse: 'Arson, Blitz and Jade Light Eximus Cabal', 'Power House': 'Arson, Blitz and Jade Light Eximus Cabal', POWERHOUSE: 'Arson, Blitz and Jade Light Eximus Cabal',
  FieryTrail: 'Fire Trails', 'Fiery Trail': 'Fire Trails', FIERYTRAIL: 'Fire Trails', 'Fire Trails': 'Fire Trails',
  SpicyKnife: 'Bomb Defusal', 'Spicy Knife': 'Bomb Defusal', SPICYKNIFE: 'Bomb Defusal', 'Bomb Defusal': 'Bomb Defusal',
  BubbleBlasters: 'Bubble Blasters', 'Bubble Blasters': 'Bubble Blasters',
  NarmerDeacons: 'Narmer Deacons', 'Narmer Deacons': 'Narmer Deacons',
  ChemicalWarfare: 'Chemical Warfare', 'Chemical Warfare': 'Chemical Warfare',
  VampyricLiminus: 'Vampyric Liminus', 'Vampyric Liminus': 'Vampyric Liminus',
  ChainsOfFire: 'Chains of Fire', 'Chains of Fire': 'Chains of Fire',
  HeadStompers: 'Head Stompers', 'Head Stompers': 'Head Stompers',
  BasicRace: 'BasicRace', LaserLimbo: 'Laser Limbo', 'Laser Limbo': 'Laser Limbo',
  FireballRollers: 'Fireball Rollers', 'Fireball Rollers': 'Fireball Rollers',
  Frictionless: 'Frictionless', FallingDebris: 'Falling Debris', 'Falling Debris': 'Falling Debris',
  SneakyRetreats: 'Sneaky Retreats', 'Sneaky Retreats': 'Sneaky Retreats',
  Kullervo: 'Kullervo', Minefield: 'Minefield', ManicMania: 'Manic Mania', 'Manic Mania': 'Manic Mania',
  ArbitrationDrones: 'Arbitration Drones', 'Arbitration Drones': 'Arbitration Drones',
  SolBanished: 'Sol Banished', 'Sol Banished': 'Sol Banished',
  GlassmakerCephalites: 'Glassmaker Cephalites', 'Glassmaker Cephalites': 'Glassmaker Cephalites',
  FoesVulnerableToRockets: 'Foes Vulnerable to Rockets', 'Foes Vulnerable to Rockets': 'Foes Vulnerable to Rockets',
  FoesVulnerableToArchguns: 'Foes Vulnerable to Archguns', 'Foes Vulnerable to Archguns': 'Foes Vulnerable to Archguns',
  PlunderRoulette: 'Plunder Roulette', Race: 'Race'
}

module.exports = {
  INCARNON_EPOCH_UTC, INCARNON_EPOCH_INDEX, INCARNON_ROTATIONS,
  ARBY_TIERS, TIER_EMOJI, POLARITY_SYMBOL, HIGHEST_CATEGORIES,
  FISS_INTEREST_DEFENSE, FISS_INTEREST_EXTERMINATE, STEAL_SCAN_WEAPONS_FALLBACK,
  DESCENDIA_TYPES, DESCENDIA_CHALLENGES
}
