// src/services/lich/lichSearch.js
// Busca de leilões de Kuva Lich / Sister of Parvos no warframe.market.
// Sempre filtra de novo localmente (elemento, efêmera, dano, quirk, preço), então o resultado
// fica correto mesmo que a API ignore algum parâmetro.

const axios = require('axios')
const { prettify, normKey, quirkDisplayName } = require('./lichData')

const SEARCH_URL = 'https://api.warframe.market/v1/auctions/search'
const HEADERS = {
  Platform: 'pc',
  Language: 'en',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://warframe.market',
  Referer: 'https://warframe.market/auctions',
  'Accept-Language': 'en-US,en;q=0.9'
}

let lich429Until = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Converte o leilão cru da API num objeto simples. */
function normalizeAuction(a, kind) {
  const item = (a && a.item) || {}
  const owner = (a && a.owner) || {}
  const price = a.buyout_price != null ? a.buyout_price : a.starting_price
  const quirk = item.quirk && String(item.quirk).toLowerCase() !== 'none' ? String(item.quirk) : null
  return {
    id: a.id,
    kind: item.type === 'sister' ? 'sister' : item.type === 'lich' ? 'lich' : kind,
    weapon_url_name: item.weapon_url_name || '',
    element: String(item.element || '').toLowerCase(),
    damage: item.damage != null ? Number(item.damage) : null,
    ephemera: item.ephemera === true || item.having_ephemera === true,
    quirk,
    price,
    startingPrice: a.starting_price,
    buyoutPrice: a.buyout_price,
    isDirect: a.is_direct_sell === true,
    seller: owner.ingame_name || owner.slug || '?',
    status: owner.status || '',
    created: a.created || a.updated || null,
    url: a.id ? 'https://warframe.market/auction/' + a.id : '',
    raw: a
  }
}

/**
 * @param {object} f  { kind: 'lich'|'sister', weapon (url_name), element, ephemera (true|false|undefined),
 *                      damageMin, damageMax, quirk (url_name), maxPrice, minPrice, direct, sortBy }
 * @returns {Promise<{auctions: object[], total: number, error?: string}>}
 */
async function searchLichAuctions(f) {
  f = f || {}
  const kind = f.kind === 'sister' ? 'sister' : 'lich'

  const now = Date.now()
  if (now < lich429Until) await sleep(lich429Until - now)

  const params = { type: kind, sort_by: f.sortBy || 'price_asc' }
  if (f.weapon) params.weapon_url_name = f.weapon
  if (f.element) params.element = f.element
  if (f.ephemera === true || f.ephemera === false) {
    params.having_ephemera = String(f.ephemera) // nome usado pelo site/item
    params.ephemera = String(f.ephemera)
  }
  if (f.damageMin != null) params.damage_min = f.damageMin
  if (f.damageMax != null) params.damage_max = f.damageMax

  let raw = []
  try {
    const res = await axios.get(SEARCH_URL, { timeout: 20000, headers: HEADERS, params })
    raw = (res.data && res.data.payload && res.data.payload.auctions) || []
  } catch (e) {
    const status = (e.response && e.response.status) || null
    if (status === 429) {
      const retry = Number(e.response.headers && e.response.headers['retry-after'])
      const wait = Math.min(Math.max((retry || 20) * 1000, 10000), 60000)
      lich429Until = Date.now() + wait
      return { auctions: [], total: 0, error: '429 (cooldown ' + Math.round(wait / 1000) + 's)' }
    }
    return { auctions: [], total: 0, error: String(status || e.message) }
  }

  let list = raw
    .filter((a) => a && a.visible !== false && a.closed !== true)
    .map((a) => normalizeAuction(a, kind))

  const q = f.quirk ? normKey(quirkDisplayName(kind, f.quirk)) : null
  list = list.filter((n) => {
    if (n.kind !== kind) return false
    if (f.weapon && n.weapon_url_name && n.weapon_url_name !== f.weapon) return false
    if (f.element && n.element !== String(f.element).toLowerCase()) return false
    if (f.ephemera === true && !n.ephemera) return false
    if (f.ephemera === false && n.ephemera) return false
    if (f.damageMin != null && (n.damage == null || n.damage < f.damageMin)) return false
    if (f.damageMax != null && (n.damage == null || n.damage > f.damageMax)) return false
    if (q && (!n.quirk || normKey(quirkDisplayName(kind, n.quirk)) !== q)) return false
    if (f.maxPrice != null && (n.price == null || n.price > f.maxPrice)) return false
    if (f.minPrice != null && (n.price == null || n.price < f.minPrice)) return false
    if (f.direct === true && !n.isDirect) return false
    return true
  })

  list.sort((a, b) => (a.price == null ? 1e12 : a.price) - (b.price == null ? 1e12 : b.price))
  return { auctions: list, total: raw.length }
}

module.exports = { searchLichAuctions, normalizeAuction, prettify }
