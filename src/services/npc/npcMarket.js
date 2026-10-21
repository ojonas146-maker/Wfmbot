// src/services/npc/npcMarket.js
// Preços do warframe.market para os itens dos vendedores (!npc).
// 1) Usa o cache do "highest" (highest_cache.json): catálogo (nome -> slug) e preços por categoria
//    (arcanes/mods: rank 0 e rank máximo). Resposta instantânea, sem rede.
// 2) Só o que faltar é buscado ao vivo (poucos pedidos por comando) e guardado em memória.

const axios = require('axios')
const { loadHighestCache } = require('../wfm/highest')
const { WFM_HEADERS } = require('../wfm/client')

const CACHE_MAX_AGE = 12 * 60 * 60 * 1000 // aceita preço do cache do highest de até 12h
const LIVE_TTL = 30 * 60 * 1000
const LIVE_NULL_TTL = 10 * 60 * 1000 // "sem ofertas" / erro: tenta de novo mais cedo
const MAX_LIVE_REQUESTS = 16
const CONCURRENCY = 4

const live = new Map() // "slug|rank" -> { price, at }

function norm(s) {
  return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')
}

function guessSlug(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/&/g, 'and').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function buildIndex() {
  const cache = loadHighestCache()
  const idx = { names: new Map(), r0: new Map(), max: new Map(), hasCache: false }
  const items = (cache.catalog && cache.catalog.items) || []
  for (const it of items) {
    const n = it && it.i18n && it.i18n.en && it.i18n.en.name
    if (n && it.slug) idx.names.set(norm(n), it.slug)
  }
  const fresh = (id) => cache.prices && cache.prices[id] && (Date.now() - (cache.prices[id].lastUpdate || 0)) < CACHE_MAX_AGE
  const fill = (ids, map) => {
    for (const id of ids) {
      if (!fresh(id)) continue
      idx.hasCache = true
      for (const p of cache.prices[id].items || []) if (p && p.slug && p.price != null) map.set(p.slug, p.price)
    }
  }
  fill(['arcanes_unranked', 'mods_unranked', 'primed_unranked'], idx.r0)
  fill(['arcanes_maxed', 'mods_maxed', 'primed_maxed'], idx.max)
  return idx
}

async function fetchPrice(slug, rank) {
  try {
    let url = 'https://api.warframe.market/v2/orders/item/' + slug + '/top'
    if (rank !== undefined && rank !== null) url += '?rank=' + rank
    const res = await axios.get(url, { timeout: 12000, headers: WFM_HEADERS })
    const sell = (res.data && res.data.data && res.data.data.sell) || []
    const ok = sell.filter((o) => o && o.platinum > 0)
    if (!ok.length) return null
    const ingame = ok.filter((o) => o.user && o.user.status === 'ingame')
    const pool = ingame.length ? ingame : ok
    return Math.min(...pool.map((o) => o.platinum))
  } catch (e) {
    if (e.response && e.response.status === 404) return null // item não existe no mercado
    return undefined // erro (429, rede...): não guarda como "sem ofertas"
  }
}

function liveGet(slug, rank) {
  const hit = live.get(slug + '|' + rank)
  if (!hit) return { known: false }
  const ttl = hit.price == null ? LIVE_NULL_TTL : LIVE_TTL
  if (Date.now() - hit.at > ttl) { live.delete(slug + '|' + rank); return { known: false } }
  return { known: true, price: hit.price }
}

/**
 * @param {Array} items itens do catálogo de vendedores ({name, maxRank, copiesForMax})
 * @returns {Promise<{ prices: Object, pending: number, live: number }>}
 *   prices[nome] = { r0: number|null, max: number|null }
 */
async function getMarketPrices(items) {
  const idx = buildIndex()
  const prices = {}
  const need = [] // { slug, rank }

  // armas de sindicato, rivens e cores não são vendidos no mercado: nem consulta
  const NO_MARKET = ['primary', 'secondary', 'melee', 'riven', 'transmuteCore']
  items = items.filter((it) => {
    if (NO_MARKET.includes(it.type)) { prices[it.name] = { r0: null, max: null }; return false }
    return true
  })

  const plan = items.map((it) => {
    const slug = idx.names.get(norm(it.name)) || guessSlug(it.name)
    const ranked = it.maxRank != null && it.copiesForMax > 1
    return { it, slug, ranked }
  })

  const lookup = (p, kind) => {
    const rank = kind === 'max' ? p.it.maxRank : (p.ranked ? 0 : 'any')
    if (kind === 'r0' && idx.r0.has(p.slug)) return { done: true, price: idx.r0.get(p.slug) }
    if (kind === 'max' && idx.max.has(p.slug)) return { done: true, price: idx.max.get(p.slug) }
    const l = liveGet(p.slug, rank)
    if (l.known) return { done: true, price: l.price }
    return { done: false, rank }
  }

  for (const p of plan) {
    const e = { r0: null, max: null }
    prices[p.it.name] = e
    const a = lookup(p, 'r0')
    if (a.done) e.r0 = a.price
    else need.push({ p, kind: 'r0', slug: p.slug, rank: a.rank })
    if (p.ranked) {
      const b = lookup(p, 'max')
      if (b.done) e.max = b.price
      else need.push({ p, kind: 'max', slug: p.slug, rank: b.rank })
    }
  }

  const batch = need.slice(0, MAX_LIVE_REQUESTS)
  const pending = need.length - batch.length
  let cursor = 0
  async function worker() {
    while (cursor < batch.length) {
      const job = batch[cursor++]
      const price = await fetchPrice(job.slug, job.rank === 'any' ? undefined : job.rank)
      if (price !== undefined) live.set(job.slug + '|' + job.rank, { price, at: Date.now() })
      prices[job.p.it.name][job.kind] = price === undefined ? null : price
      await new Promise((r) => setTimeout(r, 120))
    }
  }
  if (batch.length) await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker))

  return { prices, pending, live: batch.length, fromCache: idx.hasCache }
}

module.exports = { getMarketPrices }
