// src/services/riven/grading.js
const { loadBaseValues } = require('./baseData')

const RIVEN_STAT_LABEL = {
  'base_damage_/_melee_damage': 'Damage', damage: 'Damage', multishot: 'Multishot',
  'fire_rate_/_attack_speed': 'Fire Rate', fire_rate: 'Fire Rate', attack_speed: 'Attack Speed',
  damage_vs_corpus: 'Dmg Corpus', damage_vs_grineer: 'Dmg Grineer', damage_vs_infested: 'Dmg Infested',
  impact: 'Impact', impact_damage: 'Impact', puncture: 'Puncture', puncture_damage: 'Puncture',
  slash: 'Slash', slash_damage: 'Slash', cold: 'Cold', cold_damage: 'Cold',
  electricity: 'Electric', electricity_damage: 'Electric', electric_damage: 'Electric',
  heat: 'Heat', heat_damage: 'Heat', toxin: 'Toxin', toxin_damage: 'Toxin',
  combo_duration: 'Combo Duration', critical_chance: 'Crit Chance',
  slide_attack_critical_chance: 'Slide Crit', critical_damage: 'Crit Damage',
  finisher_damage: 'Finisher', projectile_speed: 'Flight Speed', ammo_maximum: 'Ammo Max',
  magazine_capacity: 'Magazine', punch_through: 'Punch Through', reload_speed: 'Reload',
  range: 'Range', status_chance: 'Status Chance', status_duration: 'Status Duration',
  recoil: 'Recoil', weapon_recoil: 'Recoil', zoom: 'Zoom', initial_combo: 'Initial Combo',
  heavy_attack_efficiency: 'Heavy Efficiency', combo_chance: 'Combo Chance',
  chance_to_gain_combo_count: 'Combo Gain (curse)', additional_combo_count_chance: 'Extra Combo Chance',
  chance_to_gain_extra_combo_count: 'Extra Combo Chance', combo_count_chance: 'Extra Combo Chance'
}

const RIVEN_STAT_ALIASES = {
  damage: 'base_damage_/_melee_damage', dmg: 'base_damage_/_melee_damage', md: 'base_damage_/_melee_damage',
  multi: 'multishot', ms: 'multishot', as: 'fire_rate_/_attack_speed', fr: 'fire_rate_/_attack_speed',
  speed: 'fire_rate_/_attack_speed', corpus: 'damage_vs_corpus', corp: 'damage_vs_corpus', dtc: 'damage_vs_corpus',
  grineer: 'damage_vs_grineer', grin: 'damage_vs_grineer', dtg: 'damage_vs_grineer',
  infested: 'damage_vs_infested', inf: 'damage_vs_infested', dti: 'damage_vs_infested',
  impact: 'impact', imp: 'impact', puncture: 'puncture', pun: 'puncture', slash: 'slash', sl: 'slash',
  cold: 'cold_damage', cold_damage: 'cold_damage',
  electric: 'electric_damage', elec: 'electric_damage', ele: 'electric_damage',
  electricity: 'electric_damage', electricity_damage: 'electric_damage', electric_damage: 'electric_damage',
  heat: 'heat_damage', fire: 'heat_damage', heat_damage: 'heat_damage',
  toxin: 'toxin_damage', tox: 'toxin_damage', toxin_damage: 'toxin_damage',
  combo: 'combo_duration', critchance: 'critical_chance', cc: 'critical_chance',
  slide: 'slide_attack_critical_chance', critdmg: 'critical_damage', cd: 'critical_damage',
  finisher: 'finisher_damage', fin: 'finisher_damage', flight: 'projectile_speed', pfs: 'projectile_speed',
  ps: 'projectile_speed', ammo: 'ammo_maximum', magazine: 'magazine_capacity', mag: 'magazine_capacity',
  punch: 'punch_through', pt: 'punch_through', reload: 'reload_speed', rld: 'reload_speed', rs: 'reload_speed',
  range: 'range', rng: 'range', statusc: 'status_chance', sc: 'status_chance', statusd: 'status_duration',
  sd: 'status_duration', recoil: 'recoil', rec: 'recoil', wr: 'recoil', zoom: 'zoom', z: 'zoom',
  initc: 'initial_combo', initial: 'initial_combo', ic: 'initial_combo',
  comboefficiency: 'heavy_attack_efficiency', heavy: 'heavy_attack_efficiency', eff: 'heavy_attack_efficiency',
  combogainextra: 'combo_chance', combogainlost: 'combo_chance', combochance: 'combo_chance'
}

const WFM_TO_BASE_STAT = {
  multishot: 'Multishot', critical_chance: 'Critical Chance', critical_damage: 'Critical Damage',
  'base_damage_/_melee_damage': 'Damage', damage: 'Damage', status_chance: 'Status Chance',
  status_duration: 'Status Duration', 'fire_rate_/_attack_speed': 'Fire Rate / Attack Speed',
  fire_rate: 'Fire Rate / Attack Speed', attack_speed: 'Fire Rate / Attack Speed',
  reload_speed: 'Reload Speed', magazine_capacity: 'Magazine Capacity', ammo_maximum: 'Ammo Maximum',
  punch_through: 'Punch Through', projectile_speed: 'Projectile Speed', recoil: 'Weapon Recoil',
  weapon_recoil: 'Weapon Recoil', zoom: 'Zoom', impact: 'Impact Damage', impact_damage: 'Impact Damage',
  puncture: 'Puncture Damage', puncture_damage: 'Puncture Damage', slash: 'Slash Damage',
  slash_damage: 'Slash Damage', cold: 'Cold Damage', cold_damage: 'Cold Damage', heat: 'Heat Damage',
  heat_damage: 'Heat Damage', electricity: 'Electricity Damage', electricity_damage: 'Electricity Damage',
  electric_damage: 'Electricity Damage', toxin: 'Toxin Damage', toxin_damage: 'Toxin Damage',
  damage_vs_corpus: 'Damage vs. Corpus', damage_vs_grineer: 'Damage vs. Grineer',
  damage_vs_infested: 'Damage vs. Infested', range: 'Range', initial_combo: 'Initial Combo',
  combo_duration: 'Combo Duration', heavy_attack_efficiency: 'Heavy Attack Efficiency',
  finisher_damage: 'Finisher Damage', slide_attack_critical_chance: 'Critical Chance for Slide Attack',
  chance_to_gain_combo_count: 'Chance to Gain Combo Count',
  additional_combo_count_chance: 'Additional Combo Count Chance',
  chance_to_gain_extra_combo_count: 'Additional Combo Count Chance',
  combo_count_chance: 'Additional Combo Count Chance'
}

function resolveRivenStat(token) {
  const t = String(token || '').toLowerCase().trim()
  return RIVEN_STAT_ALIASES[t] || null
}

function letterGrade(dev) {
  if (dev >= 9.5) return 'S'
  if (dev >= 7.5) return '+A'
  if (dev >= 5.5) return 'A'
  if (dev >= 3.5) return '-A'
  if (dev >= 1.5) return '+B'
  if (dev >= -1.5) return 'B'
  if (dev >= -3.5) return '-B'
  if (dev >= -5.5) return '+C'
  if (dev >= -7.5) return 'C'
  if (dev >= -9.5) return '-C'
  return 'F'
}

function gradeRank(g) {
  const order = { S: 10, '+A': 9, A: 8, '-A': 7, '+B': 6, B: 5, '-B': 4, '+C': 3, C: 2, '-C': 1, F: 0 }
  return order[g] != null ? order[g] : -1
}

function getConfigKey(attrs) {
  let pos = 0, neg = 0
  for (const a of attrs || []) {
    if (a.positive === false) neg++
    else pos++
  }
  if (pos === 2 && neg === 0) return '2P'
  if (pos === 2 && neg === 1) return '2P1N'
  if (pos === 3 && neg === 0) return '3P'
  if (pos === 3 && neg === 1) return '3P1N'
  if (pos >= 3) return neg ? '3P1N' : '3P'
  return neg ? '2P1N' : '2P'
}

/**
 * Resolve a categoria base (Rifle / Shotgun / Pistol / Archgun / Melee)
 * a partir do objeto da arma (vindo do dispositions JSON).
 *
 * Regras:
 * - Kitgun Primary  → Rifle
 * - Kitgun Secondary → Pistol
 * - Robotic          → Rifle  (exceto Deconstructor que já tem type: Melee)
 * - Hound            → Melee
 * - Restante         → usa type_to_category do base_values
 */
function resolveBaseCategory(weapon, baseValues) {
  if (!weapon) return null

  const type = String(weapon.type || '').trim()
  const cat  = String(weapon.category || '').trim()

  // Kitgun: decide pelo slot (Primary/Secondary)
  if (type === 'Kitgun' || type.toLowerCase() === 'kitgun') {
    if (cat === 'Secondary') return 'Pistol'
    return 'Rifle' // Primary ou fallback
  }

  // Deconstructor já vem com type: Melee no dispositions
  // Robotic genérico → Rifle (já mapeado no type_to_category)
  // Hound → Melee (já mapeado)

  const map = (baseValues && baseValues.type_to_category) || {}
  return map[type] || map[cat] || null
}

/**
 * Grade de um stat individual.
 * base_values.json guarda valores no RANK MÁXIMO (8). Anúncios unranked
 * mostram ~1/9 do valor — por isso a escala por rank abaixo.
 *
 * @param {object} attr          - atributo do riven { url_name, value, positive }
 * @param {string|object} weaponOrCategory - string da categoria base OU objeto arma (com type + category)
 * @param {number} disposition
 * @param {string} configKey     - '2P' | '2P1N' | '3P' | '3P1N'
 * @param {number} [modRank]
 * @param {number} [maxRank]
 */
function gradeOneStat(attr, weaponOrCategory, disposition, configKey, modRank, maxRank) {
  const bv = loadBaseValues()

  // Aceita tanto string (categoria antiga) quanto objeto arma
  let category
  if (typeof weaponOrCategory === 'string') {
    category = weaponOrCategory
  } else {
    category = resolveBaseCategory(weaponOrCategory, bv)
  }

  if (!category) {
    return {
      label: RIVEN_STAT_LABEL[String(attr.url_name || '').toLowerCase()] || attr.url_name,
      value: attr.value,
      positive: attr.positive !== false,
      grade: null,
      dev: null,
      note: 'categoria desconhecida'
    }
  }

  const url = String(attr.url_name || '').toLowerCase()
  let baseName = WFM_TO_BASE_STAT[url]
  if (!baseName) {
    const alt = url.replace(/_damage$/, '').replace(/_chance$/, '')
    baseName = WFM_TO_BASE_STAT[alt] || WFM_TO_BASE_STAT[url.replace(/__/g, '_')]
  }
  if (!baseName || !bv.stats[baseName]) {
    return {
      label: RIVEN_STAT_LABEL[url] || attr.url_name,
      value: attr.value,
      positive: attr.positive !== false,
      grade: null,
      dev: null,
      note: 'sem base'
    }
  }

  const entry = bv.stats[baseName]
  const base = entry[category]
  if (base == null) {
    return {
      label: baseName,
      value: attr.value,
      positive: attr.positive !== false,
      grade: null,
      dev: null,
      note: 'não rola nesta categoria'
    }
  }

  const mults = bv.count_multipliers[configKey] || bv.count_multipliers['3P1N']
  const isPos = attr.positive !== false
  let mult = isPos ? mults.positive : mults.negative
  if (mult == null) mult = isPos ? 1 : -0.75

  const expectedMax = base * disposition * Math.abs(mult)

  let mr = modRank != null && !isNaN(Number(modRank)) ? Number(modRank) : 8
  let mx = maxRank != null && !isNaN(Number(maxRank)) ? Number(maxRank) : 8
  if (mx < 1) mx = 8
  if (mr < 0) mr = 0
  if (mr > mx) mr = mx

  const rankScale = (mr + 1) / (mx + 1)
  const expected = expectedMax * rankScale

  const unit = entry.unit || '%'
  let actual = Number(attr.value)

  // Faction damage (unit "x") arrives as the final multiplier (x0.79 or x1.25).
  // Convert to the magnitude of the bonus/malus so it matches the base 0.45 scale.
  if (unit === 'x') {
    actual = Math.abs(actual - 1)
  } else if (!isPos) {
    actual = Math.abs(actual)
  }

  // Positivos: actual > expected = melhor
  // Negativos: actual > expected (curse mais forte) = melhor → inverte o sinal
  let dev = expected ? ((actual - expected) / expected) * 100 : 0
  if (!isPos) dev = -dev

  const grade = letterGrade(dev)

  return {
    label: baseName,
    value: attr.value,
    positive: isPos,
    grade,
    dev,
    expected,
    expectedMax,
    rankScale,
    unit
  }
}

function analyzeRivenMeta(weaponUrlName, attrs, getWeaponMeta) {
  const meta = getWeaponMeta(weaponUrlName)
  if (!meta) {
    return {
      hasMeta: false,
      label: null,
      mustHaveHit: 0,
      mustHaveTotal: 0,
      priorityHit: 0,
      priorityTotal: 0,
      score: 0,
      mustHave: [],
      priority: [],
      raw: null,
      display: weaponUrlName
    }
  }

  const positive = {}
  for (const a of attrs || []) {
    if (a.positive !== false) positive[a.url_name] = true
  }

  const must = meta.must_have || []
  const prio = meta.priority || []

  let mustHit = 0
  for (const m of must) if (positive[m]) mustHit++

  let prioHit = 0
  for (let p = 0; p < prio.length; p++) if (positive[prio[p]]) prioHit++

  let score = 0
  if (must.length) score += (mustHit / must.length) * 60
  for (let j = 0; j < prio.length; j++) {
    if (positive[prio[j]]) score += Math.max(2, 12 - j * 1.5)
  }

  let label = 'MEH'
  if (mustHit === must.length && must.length > 0) {
    if (prioHit >= 3 || score >= 85) label = 'GOD ROLL'
    else if (prioHit >= 2 || score >= 70) label = 'META'
    else label = 'BOM'
  } else if (mustHit > 0) {
    label = 'PARCIAL'
  }

  return {
    hasMeta: true,
    label,
    mustHaveHit: mustHit,
    mustHaveTotal: must.length,
    priorityHit: prioHit,
    priorityTotal: prio.length,
    score: Math.round(score),
    mustHave: must,
    priority: prio,
    raw: meta.raw_text || null,
    display: meta.display || weaponUrlName
  }
}

function formatMetaBlock(analysis) {
  if (!analysis || !analysis.hasMeta) return '_Sem meta cadastrada para esta arma._\n'

  let reply = '🎯 *Análise Meta (' + analysis.display + ')*\n'
  reply += '*' + analysis.label + '*  ·  score ' + analysis.score + '\n'
  reply += 'Must-have: *' + analysis.mustHaveHit + '/' + analysis.mustHaveTotal + '*'

  if (analysis.mustHaveTotal) {
    const mh = analysis.mustHave.map(s => RIVEN_STAT_LABEL[s] || s).join(', ')
    reply += '  (' + mh + ')'
  }
  reply += '\n'
  reply += 'Priority: *' + analysis.priorityHit + '/' + Math.min(analysis.priorityTotal, 5) + '*'

  if (analysis.priority && analysis.priority.length) {
    const top = analysis.priority.slice(0, 5).map(s => RIVEN_STAT_LABEL[s] || s).join(' › ')
    reply += '\n  ' + top
  }
  reply += '\n'
  if (analysis.raw) reply += 'Formato: `' + analysis.raw + '`\n'
  return reply
}

module.exports = {
  RIVEN_STAT_LABEL,
  RIVEN_STAT_ALIASES,
  WFM_TO_BASE_STAT,
  resolveRivenStat,
  letterGrade,
  gradeRank,
  getConfigKey,
  resolveBaseCategory,
  gradeOneStat,
  analyzeRivenMeta,
  formatMetaBlock
}
