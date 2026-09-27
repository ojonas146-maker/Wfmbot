// src/services/farming/planetResources.js
// Dataset estático portado de warframe-mcp (mpeciakk/warframe-mcp,
// src/data/planet-resources.ts). Recursos por planeta + bônus de dark
// sector — a mesma fonte que o farm_route_optimizer original usa (em vez
// da tabela de drops ao vivo do warframestat.us, que a v1 deste bot usava).
const PLANET_RESOURCES = {
  Earth: {
    resources: ['Ferrite', 'Polymer Bundle', 'Detonite Ampule', 'Neurodes', 'Rubedo'],
    darkSectors: [
      { name: 'Coba', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Tikal', missionType: 'Excavation', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Venus: {
    resources: ['Alloy Plate', 'Polymer Bundle', 'Circuits', 'Fieldron Sample'],
    darkSectors: [
      { name: 'Romula', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Malva', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Mercury: {
    resources: ['Ferrite', 'Polymer Bundle', 'Detonite Ampule', 'Morphics'],
    darkSectors: []
  },
  Mars: {
    resources: ['Ferrite', 'Salvage', 'Detonite Ampule', 'Morphics', 'Gallium'],
    darkSectors: [
      { name: 'Kadesh', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Wahiba', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Phobos: {
    resources: ['Alloy Plate', 'Rubedo', 'Morphics', 'Plastids'],
    darkSectors: [
      { name: 'Memphis', missionType: 'Defection', resourceBonus: 20, creditBonus: 20 },
      { name: 'Zeugma', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Ceres: {
    resources: ['Alloy Plate', 'Circuits', 'Detonite Ampule', 'Orokin Cells'],
    darkSectors: [
      { name: 'Seimeni', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Gabii', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Jupiter: {
    resources: ['Alloy Plate', 'Salvage', 'Fieldron Sample', 'Neural Sensors', 'Hexenon'],
    darkSectors: [
      { name: 'Sinai', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Cameria', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Europa: {
    resources: ['Ferrite', 'Rubedo', 'Fieldron Sample', 'Morphics'],
    darkSectors: [
      { name: 'Larzac', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Cholistan', missionType: 'Excavation', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Saturn: {
    resources: ['Nano Spores', 'Plastids', 'Orokin Cells'],
    darkSectors: [
      { name: 'Caracol', missionType: 'Defection', resourceBonus: 20, creditBonus: 20 },
      { name: 'Piscinas', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Uranus: {
    resources: ['Ferrite', 'Polymer Bundle', 'Detonite Ampule', 'Plastids', 'Gallium', 'Tellurium'],
    darkSectors: [
      { name: 'Ur', missionType: 'Disruption', resourceBonus: 20, creditBonus: 20 },
      { name: 'Assur', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Neptune: {
    resources: ['Nano Spores', 'Ferrite', 'Fieldron Sample', 'Control Module'],
    darkSectors: [
      { name: 'Yursa', missionType: 'Defection', resourceBonus: 20, creditBonus: 20 },
      { name: 'Kelashin', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Pluto: {
    resources: ['Alloy Plate', 'Rubedo', 'Fieldron Sample', 'Morphics', 'Plastids'],
    darkSectors: [
      { name: 'Sechura', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Hieracon', missionType: 'Excavation', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Sedna: {
    resources: ['Alloy Plate', 'Salvage', 'Circuits', 'Detonite Ampule'],
    darkSectors: [
      { name: 'Sangeru', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Amarna', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Eris: {
    resources: ['Nano Spores', 'Plastids', 'Neurodes', 'Mutagen Sample'],
    darkSectors: [
      { name: 'Akkad', missionType: 'Defense', resourceBonus: 20, creditBonus: 20 },
      { name: 'Zabala', missionType: 'Survival', resourceBonus: 25, creditBonus: 25 }
    ]
  },
  Void: { resources: ['Ferrite', 'Rubedo', 'Argon Crystal', 'Control Module'], darkSectors: [] },
  'Kuva Fortress': { resources: ['Salvage', 'Circuits', 'Detonite Ampule'], darkSectors: [] },
  Lua: { resources: ['Ferrite', 'Salvage', 'Circuits', 'Neurodes'], darkSectors: [] },
  Deimos: { resources: ['Nano Spores', 'Mutagen Sample', 'Orokin Cells'], darkSectors: [] }
}

const RESOURCE_ALIASES = {
  'nano spore': 'Nano Spores',
  nanospores: 'Nano Spores',
  'neural sensor': 'Neural Sensors',
  neurals: 'Neural Sensors',
  neurode: 'Neurodes',
  'orokin cell': 'Orokin Cells',
  cells: 'Orokin Cells',
  'o cells': 'Orokin Cells',
  ocells: 'Orokin Cells',
  polymer: 'Polymer Bundle',
  polymers: 'Polymer Bundle',
  poly: 'Polymer Bundle',
  alloy: 'Alloy Plate',
  alloys: 'Alloy Plate',
  argon: 'Argon Crystal',
  argons: 'Argon Crystal',
  'control module': 'Control Module',
  'control modules': 'Control Module',
  plastid: 'Plastids',
  morphic: 'Morphics',
  rubedos: 'Rubedo',
  galliums: 'Gallium',
  tellurium: 'Tellurium',
  hexenons: 'Hexenon',
  circuit: 'Circuits',
  'fieldron samples': 'Fieldron Sample',
  'detonite ampules': 'Detonite Ampule',
  'mutagen samples': 'Mutagen Sample',
  ferrites: 'Ferrite'
}

const PREFERRED_MISSION_TYPES = ['Survival', 'Defense', 'Excavation', 'Disruption', 'Exterminate', 'Capture']

module.exports = { PLANET_RESOURCES, RESOURCE_ALIASES, PREFERRED_MISSION_TYPES }
