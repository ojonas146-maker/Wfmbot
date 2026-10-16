// src/services/lich/lichData.js
// Catálogo de Kuva Lich / Sisters of Parvos no warframe.market (armas, efêmeras, quirks)
// + índice das imagens locais em assets/lich/.
//
// O catálogo vem da API (/v1/lich/* e /v1/sister/*) e é guardado em cache. Se a API falhar,
// cai numa lista estática montada a partir das imagens que temos.
// Este módulo NÃO depende do env.js do bot, para poder rodar no script de teste.

const fs = require('fs')
const path = require('path')
const axios = require('axios')

const API = 'https://api.warframe.market/v1'
const API_V2 = 'https://api.warframe.market/v2'
const ASSET_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'lich')
const CACHE_TTL = 24 * 60 * 60 * 1000

const HEADERS = {
  Platform: 'pc',
  Language: 'en',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://warframe.market',
  Referer: 'https://warframe.market/auctions',
  'Accept-Language': 'en-US,en;q=0.9'
}

const KINDS = {
  lich: { key: 'lich', label: 'Kuva Lich', weaponsDir: 'Kuva_Weapons', ephemeraDir: 'Vengeful_Ephemeras' },
  sister: { key: 'sister', label: 'Sister of Parvos', weaponsDir: 'Tenet_Weapons', ephemeraDir: 'Sisters_Ephemeras' }
}

const ELEMENTS = {
  impact: { name: 'Impact', color: '#c7ccd6' },
  heat: { name: 'Heat', color: '#ff7a3d' },
  cold: { name: 'Cold', color: '#6fd6ff' },
  electricity: { name: 'Electricity', color: '#5b9bff' },
  toxin: { name: 'Toxin', color: '#6fe04a' },
  magnetic: { name: 'Magnetic', color: '#a98bff' },
  radiation: { name: 'Radiation', color: '#f5d142' }
}

// Efêmera -> elemento (usado quando a API não devolve o elemento).
const STATIC_EPHEMERA_ELEMENT = {
  // Kuva (Vengeful)
  vengeful_charge_ephemera: 'electricity',
  vengeful_chill_ephemera: 'cold',
  vengeful_flame_ephemera: 'heat',
  vengeful_pull_ephemera: 'magnetic',
  vengeful_shockwave_ephemera: 'impact',
  vengeful_toxin_ephemera: 'toxin',
  vengeful_trickster_ephemera: 'radiation',
  // Sisters of Parvos
  gloriana_ephemera: 'cold',
  hypatia_ephemera: 'radiation',
  kyruna_ephemera: 'impact',
  lucretia_ephemera: 'toxin',
  solena_ephemera: 'magnetic',
  sybillina_ephemera: 'electricity',
  zarina_ephemera: 'heat'
}

// A API grafa alguns quirks com erro de digitação; corrige só na exibição.
const QUIRK_NAME_FIX = {
  hatered_of_children: 'Hatred of Children',
  hatered: 'Hatred'
}

// ---------------------------------------------------------------- utilidades

function normKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function prettify(s) {
  return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

function toUrlName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// "KuvaTwinStubbas" -> "Kuva Twin Stubbas"
function splitCamel(s) {
  return String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
}

// ---------------------------------------------------------------- imagens locais

let _imgIndex = null
function getImageIndex() {
  if (_imgIndex) return _imgIndex
  const idx = {}
  try {
    for (const dir of fs.readdirSync(ASSET_DIR)) {
      const full = path.join(ASSET_DIR, dir)
      if (!fs.statSync(full).isDirectory()) continue
      for (const f of fs.readdirSync(full)) {
        if (!/\.(png|webp|jpe?g)$/i.test(f)) continue
        idx[normKey(f.replace(/\.[^.]+$/, ''))] = { file: path.join(full, f), dir, name: splitCamel(f.replace(/\.[^.]+$/, '')) }
      }
    }
  } catch (e) { /* sem imagens: o cartão sai sem figura */ }
  _imgIndex = idx
  return idx
}

/** Caminho da imagem a partir do nome ("Kuva Hek") ou do url_name ("kuva_hek"). */
function getImagePath(nameOrUrl) {
  const hit = getImageIndex()[normKey(nameOrUrl)]
  return hit ? hit.file : null
}

const _b64 = {}
function getImageDataUri(file) {
  if (!file) return null
  if (!_b64[file]) {
    const ext = path.extname(file).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    _b64[file] = 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64')
  }
  return _b64[file]
}

// ---------------------------------------------------------------- catálogo

function staticCatalog(kind) {
  const k = KINDS[kind]
  const weapons = []
  const ephemeras = []
  for (const e of Object.values(getImageIndex())) {
    const urlName = toUrlName(e.name)
    if (e.dir === k.weaponsDir) weapons.push({ url_name: urlName, name: e.name })
    if (e.dir === k.ephemeraDir) ephemeras.push({ url_name: urlName, name: e.name, element: STATIC_EPHEMERA_ELEMENT[urlName] || null })
  }
  return { kind, weapons, ephemeras, quirks: [], source: 'static' }
}

function firstArray(payload, preferred) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload[preferred])) return payload[preferred]
  for (const v of Object.values(payload)) if (Array.isArray(v)) return v
  return []
}

// v2: { data: [ { slug, element?, i18n: { en: { name } } } ] }   v1: { payload: { weapons: [...] } }
async function fetchList(kind, what) {
  const errors = []
  for (const base of [API_V2, API]) {
    try {
      const res = await axios.get(base + '/' + kind + '/' + what, { timeout: 20000, headers: HEADERS })
      const body = res.data || {}
      const list = Array.isArray(body.data) ? body.data : firstArray(body.payload, what)
      if (list && list.length) return { raw: body, list, version: base === API_V2 ? 'v2' : 'v1' }
      errors.push(base + ': lista vazia')
    } catch (e) {
      errors.push(base + ': ' + ((e.response && e.response.status) || e.message))
    }
  }
  throw new Error(errors.join(' | '))
}

function enName(w) {
  return (w.i18n && w.i18n.en && w.i18n.en.name) || w.item_name || w.name || null
}

function normWeapon(w) {
  const url = w.slug || w.url_name || toUrlName(enName(w))
  return { url_name: url, name: enName(w) || prettify(url) }
}

function normEphemera(e) {
  const url = e.slug || e.url_name || toUrlName(enName(e))
  const name = enName(e) || prettify(url)
  const key = toUrlName(name)
  const el = String(e.element || '').toLowerCase() || STATIC_EPHEMERA_ELEMENT[key] || STATIC_EPHEMERA_ELEMENT[url] || STATIC_EPHEMERA_ELEMENT[url + '_ephemera'] || null
  return { url_name: url, name, element: el }
}

function normQuirk(q) {
  const url = q.slug || q.url_name || toUrlName(enName(q))
  const description = (q.i18n && q.i18n.en && q.i18n.en.description) || q.description || ''
  return { url_name: url, name: enName(q) || prettify(url), description }
}

const _cache = {}
const _debug = {}

/** Carrega (e guarda em cache) o catálogo de 'lich' ou 'sister'. */
async function loadCatalog(kind, opts) {
  opts = opts || {}
  const c = _cache[kind]
  if (c && !opts.force && Date.now() - c.at < CACHE_TTL) return c.data

  // cache em disco (opcional)
  const root = process.env.DATA_ROOT || path.join(process.cwd(), 'data_runtime')
  const file = path.join(root, 'lich_catalog_' + kind + '.json')
  if (!opts.force && !opts.noDisk) {
    try {
      const st = fs.statSync(file)
      if (Date.now() - st.mtimeMs < CACHE_TTL) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        _cache[kind] = { at: Date.now(), data }
        return data
      }
    } catch (e) { /* sem cache em disco */ }
  }

  try {
    const [w, e, q] = await Promise.all([
      fetchList(kind, 'weapons'),
      fetchList(kind, 'ephemeras'),
      fetchList(kind, 'quirks').catch(() => ({ raw: null, list: [], version: null }))
    ])
    _debug[kind] = { api: w.version, weapon: w.list[0], ephemera: e.list[0], quirk: q.list[0] }
    const data = {
      kind,
      weapons: w.list.map(normWeapon),
      ephemeras: e.list.map(normEphemera),
      quirks: q.list.map(normQuirk),
      source: 'api ' + w.version
    }
    if (!data.weapons.length) throw new Error('catálogo de armas vazio')
    _cache[kind] = { at: Date.now(), data }
    if (!opts.noDisk) {
      try {
        fs.mkdirSync(root, { recursive: true })
        fs.writeFileSync(file, JSON.stringify(data))
      } catch (err) { /* sem permissão de escrita: segue só com a memória */ }
    }
    return data
  } catch (err) {
    console.error('lich catálogo (' + kind + '):', err.message, '- usando lista estática')
    const data = staticCatalog(kind)
    _cache[kind] = { at: Date.now() - CACHE_TTL + 5 * 60 * 1000, data } // tenta de novo em 5 min
    return data
  }
}

/** Catálogo já carregado (ou o estático, se ainda não foi carregado). */
function getCatalogSync(kind) {
  return (_cache[kind] && _cache[kind].data) || staticCatalog(kind)
}

function getDebugSamples() {
  return _debug
}

// ---------------------------------------------------------------- consultas

/** Efêmera de um (kind, elemento). */
function findEphemera(kind, element) {
  const el = String(element || '').toLowerCase()
  return getCatalogSync(kind).ephemeras.find((e) => e.element === el) || null
}

function findEphemeraByName(text) {
  const key = normKey(text)
  if (!key) return null
  for (const kind of Object.keys(KINDS)) {
    const list = getCatalogSync(kind).ephemeras
    const exact = list.find((e) => normKey(e.name) === key || normKey(e.url_name) === key)
    if (exact) return { kind, ephemera: exact }
    const part = list.filter((e) => normKey(e.name).includes(key))
    if (part.length === 1) return { kind, ephemera: part[0] }
  }
  return null
}

/**
 * Resolve o texto digitado ("hek", "kuva hek", "tenet envoy") em { kind, weapon }.
 * Retorna { candidates: [...] } se ficar ambíguo, ou null se não achar.
 */
function resolveWeapon(text) {
  const key = normKey(text)
  if (!key) return null
  const all = []
  for (const kind of Object.keys(KINDS)) {
    for (const w of getCatalogSync(kind).weapons) all.push({ kind, weapon: w })
  }
  const exact = all.filter((x) => normKey(x.weapon.name) === key || normKey(x.weapon.url_name) === key)
  if (exact.length === 1) return exact[0]
  const part = all.filter((x) => normKey(x.weapon.name).includes(key))
  if (part.length === 1) return part[0]
  if (part.length > 1) return { candidates: part }
  return null
}

const SMALL_WORDS = new Set(['of', 'the', 'to', 'for', 'in', 'on', 'a', 'an', 'and'])

/** Nome bonito de um quirk (usa o catálogo; senão corrige erros de grafia conhecidos). */
function quirkDisplayName(kind, value) {
  if (!value) return null
  const v = String(value)
  const key = normKey(v)
  const q = getCatalogSync(kind).quirks.find((x) => normKey(x.url_name) === key || normKey(x.name) === key)
  if (q) return q.name
  if (QUIRK_NAME_FIX[v.toLowerCase()]) return QUIRK_NAME_FIX[v.toLowerCase()]
  return v.replace(/[_-]+/g, ' ').split(' ').filter(Boolean)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function weaponDisplayName(kind, urlName) {
  const w = getCatalogSync(kind).weapons.find((x) => x.url_name === urlName)
  return w ? w.name : prettify(urlName)
}

module.exports = {
  KINDS,
  ELEMENTS,
  ASSET_DIR,
  normKey,
  prettify,
  getImageIndex,
  getImagePath,
  getImageDataUri,
  loadCatalog,
  getCatalogSync,
  getDebugSamples,
  findEphemera,
  findEphemeraByName,
  resolveWeapon,
  weaponDisplayName,
  quirkDisplayName
}
