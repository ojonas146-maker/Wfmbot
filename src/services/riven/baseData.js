// src/services/riven/baseData.js
// Carrega e indexa base_values.json, dispositions.json e riven_meta.json.
const fs = require('fs')
const { BASE_VALUES_FILE, DISPOSITIONS_FILE, RIVEN_META_FILE } = require('../../config/env')
const { normDispKey, normalizeWeaponKey } = require('../../utils/text')

let _baseValuesCache = null
let _dispositionsCache = null
let _rivenMetaCache = null

function loadBaseValues() {
  if (_baseValuesCache) return _baseValuesCache
  _baseValuesCache = JSON.parse(fs.readFileSync(BASE_VALUES_FILE, 'utf8'))
  return _baseValuesCache
}

function loadDispositions() {
  if (_dispositionsCache) return _dispositionsCache
  const list = JSON.parse(fs.readFileSync(DISPOSITIONS_FILE, 'utf8'))
  const map = {}
  for (const w of list) {
    if (!w || !w.name) continue
    const raw = String(w.name).toLowerCase()
    const norm = normDispKey(w.name)
    map[raw] = w
    map[norm] = w
    map[norm.replace(/\s+/g, '')] = w
  }
  _dispositionsCache = map
  return _dispositionsCache
}

function loadRivenMeta() {
  if (_rivenMetaCache) return _rivenMetaCache
  try {
    _rivenMetaCache = JSON.parse(fs.readFileSync(RIVEN_META_FILE, 'utf8'))
  } catch (e) {
    console.error('riven_meta.json:', e.message)
    _rivenMetaCache = {}
  }
  return _rivenMetaCache
}

function getWeaponMeta(weaponUrlName) {
  const meta = loadRivenMeta()
  const key = normalizeWeaponKey(weaponUrlName)
  if (meta[key]) return meta[key]
  const stripped = key.replace(/^(kuva_|tenet_|prime_)/, '')
  if (stripped !== key && meta[stripped]) return meta[stripped]
  const keys = Object.keys(meta)
  for (const k of keys) {
    if (k === key || k.endsWith('_' + key) || key.endsWith('_' + k)) return meta[k]
  }
  return null
}

function findDisposition(weaponUrlName) {
  const map = loadDispositions()
  const raw = String(weaponUrlName || '').toLowerCase().trim()
  const key = normDispKey(weaponUrlName)
  const compact = key.replace(/\s+/g, '')

  if (map[raw]) return map[raw]
  if (map[key]) return map[key]
  if (map[compact]) return map[compact]

  const variants = []
  if (key.indexOf('mk1 ') === 0 || key.indexOf('mk 1 ') === 0) {
    variants.push(key.replace(/^mk\s*1\s+/, ''))
  } else {
    variants.push('mk1 ' + key)
    variants.push('mk 1 ' + key)
  }
  for (const vk of variants) {
    if (map[vk]) return map[vk]
    if (map[vk.replace(/\s+/g, '')]) return map[vk.replace(/\s+/g, '')]
  }

  for (const k of Object.keys(map)) {
    const nk = normDispKey(k)
    if (nk === key || nk.replace(/\s+/g, '') === compact) return map[k]
  }
  return null
}

function resolveRivenCategory(weaponType) {
  const bv = loadBaseValues()
  const t = String(weaponType || '')
  if (bv.type_to_category && bv.type_to_category[t]) return bv.type_to_category[t]
  if (/shotgun/i.test(t)) return 'Shotgun'
  if (/pistol|secondary|throwing/i.test(t)) return 'Pistol'
  if (/arch.?gun/i.test(t)) return 'Archgun'
  if (/melee|zaw|arch.?melee/i.test(t)) return 'Melee'
  return 'Rifle'
}

/** Prefere category do dispositions.json (mais confiável que type em alguns Mk1). */
function resolveCategoryFromDisp(disp) {
  if (!disp) return 'Rifle'
  const cat = String(disp.category || '').toLowerCase()
  if (cat === 'melee' || cat === 'arch-melee') return 'Melee'
  if (cat === 'arch-gun' || cat === 'archgun') return 'Archgun'
  return resolveRivenCategory(disp.type || disp.category)
}

module.exports = {
  loadBaseValues,
  loadDispositions,
  loadRivenMeta,
  getWeaponMeta,
  findDisposition,
  resolveRivenCategory,
  resolveCategoryFromDisp
}
