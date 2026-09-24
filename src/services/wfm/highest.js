// src/services/wfm/highest.js
// Ranking "Highest" de preços por categoria (prime sets, mods, arcanes...).
const fs = require('fs')
const axios = require('axios')
const {
  HIGHEST_CACHE_FILE, HIGHEST_CATALOG_TTL, HIGHEST_PRICE_TTL,
  HIGHEST_STATS_TTL, HIGHEST_REQUEST_DELAY
} = require('../../config/env')
const { HIGHEST_CATEGORIES } = require('../../config/constants')
const { WFM_HEADERS } = require('./client')

let highestLock = false

function loadHighestCache() {
  const empty = { catalog: null, prices: {}, stats: {}, updated: null }
  try {
    if (!fs.existsSync(HIGHEST_CACHE_FILE)) return empty
    const raw = JSON.parse(fs.readFileSync(HIGHEST_CACHE_FILE, 'utf8'))
    if (!raw || typeof raw !== 'object') return empty
    if (!raw.prices || typeof raw.prices !== 'object') raw.prices = {}
    if (!raw.stats || typeof raw.stats !== 'object') raw.stats = {}
    if (raw.catalog === undefined) raw.catalog = null
    return raw
  } catch (e) {
    console.error('Erro ao carregar cache Highest:', e.message)
    return empty
  }
}

function saveHighestCache(data) {
  try {
    fs.writeFileSync(HIGHEST_CACHE_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Erro ao salvar cache Highest:', e.message)
  }
}

function normalizeHighestCatalogItem(item) {
  if (!item || typeof item !== 'object') return null
  const slug = (item.slug || item.url_name || '').toLowerCase()
  if (!slug) return null
  const name = (item.i18n && item.i18n.en && item.i18n.en.name) || item.item_name || item.name || slug
  const maxRank = item.maxRank != null ? item.maxRank : (item.mod_max_rank != null ? item.mod_max_rank : 0)
  const tags = item.tags || []
  return { slug, maxRank, tags, i18n: { en: { name } } }
}

async function fetchHighestCatalog() {
  const urls = ['https://api.warframe.market/v2/items', 'https://api.warframe.market/v1/items']
  for (const url of urls) {
    try {
      console.log('📦 Highest: tentando catálogo ' + url)
      const res = await axios.get(url, { timeout: 45000, headers: WFM_HEADERS })
      let raw = []
      if (res.data && res.data.data && Array.isArray(res.data.data)) raw = res.data.data
      else if (res.data && res.data.payload && Array.isArray(res.data.payload.items)) raw = res.data.payload.items
      else if (Array.isArray(res.data)) raw = res.data

      const items = []
      for (const r of raw) {
        const n = normalizeHighestCatalogItem(r)
        if (n) items.push(n)
      }
      if (items.length) {
        console.log('📦 Catálogo Highest: ' + items.length + ' itens via ' + url)
        return items
      }
      console.log('⚠️ Highest: resposta sem itens em ' + url)
    } catch (e) {
      const status = e.response && e.response.status
      console.error('Erro catálogo Highest (' + url + '):', status || e.message)
    }
  }

  try {
    const cache = loadHighestCache()
    if (cache.catalog && Array.isArray(cache.catalog.items) && cache.catalog.items.length) {
      console.log('📦 Highest: usando catálogo em cache (' + cache.catalog.items.length + ' itens)')
      return cache.catalog.items.map((it) => normalizeHighestCatalogItem(it) || it).filter(Boolean)
    }
    if (Array.isArray(cache.items) && cache.items.length) {
      console.log('📦 Highest: usando cache.items (' + cache.items.length + ' itens)')
      return cache.items.map((it) => normalizeHighestCatalogItem(it) || it).filter(Boolean)
    }
  } catch (e2) {
    console.error('Highest cache fallback:', e2.message)
  }
  return []
}

function isWarframePrimeSet(name) {
  const warframes = ['Ash', 'Atlas', 'Banshee', 'Baruuk', 'Chroma', 'Ember', 'Equinox', 'Excalibur',
    'Frost', 'Gara', 'Garuda', 'Gauss', 'Grendel', 'Harrow', 'Hildryn', 'Hydroid', 'Inaros', 'Ivara',
    'Khora', 'Limbo', 'Loki', 'Mag', 'Mesa', 'Mirage', 'Nekros', 'Nezha', 'Nidus', 'Nova', 'Nyx', 'Oberon',
    'Octavia', 'Protea', 'Revenant', 'Rhino', 'Saryn', 'Sevagoth', 'Titania', 'Trinity', 'Valkyr',
    'Vauban', 'Volt', 'Wisp', 'Wukong', 'Yareli', 'Zephyr']
  const lower = name.toLowerCase()
  return warframes.some((w) => lower.includes(w.toLowerCase()))
}

function isArcaneItem(slug, name, tags) {
  const s = String(slug || '').toLowerCase()
  const n = String(name || '').toLowerCase()
  const t = (tags || []).map((x) => String(x).toLowerCase())

  if (t.indexOf('arcane') !== -1) return true
  if (/\barcane\b/.test(n) || s.startsWith('arcane_')) return true
  if (s.startsWith('magus_') || /\bmagus\b/.test(n)) return true
  if (s.startsWith('virtuos_') || /\bvirtuos\b/.test(n)) return true
  if (s.startsWith('pax_') || /\bpax\b/.test(n)) return true
  if (s.startsWith('theorem_') || /\btheorem\b/.test(n)) return true
  if (s.startsWith('exodia_') || /\bexodia\b/.test(n)) return true
  if (s.startsWith('primary_') || /^primary\s/.test(n)) return true
  if (s.startsWith('secondary_') || /^secondary\s/.test(n)) return true
  if (s.startsWith('melee_') || /^melee\s/.test(n)) return true
  if (s.startsWith('shotgun_') || /^shotgun\s/.test(n)) return true
  if (s.startsWith('sniper_') || /^sniper\s/.test(n)) return true
  if (s.startsWith('kitgun_') || /^kitgun\s/.test(n)) return true
  if (s.startsWith('moa_') || /^moa\s/.test(n)) return true
  if (/\b(longbow sharpshot|hot shot|hotshot|vendetta|compression|plated round|universal fallout)\b/.test(n)) return true
  if (/\b(longbow_sharpshot|hot_shot|plated_round|universal_fallout)\b/.test(s)) return true
  return false
}

function classifyHighestItems(catalog) {
  const result = {}
  for (const key in HIGHEST_CATEGORIES) result[HIGHEST_CATEGORIES[key].id] = []

  for (const item of catalog) {
    const slug = (item.slug || '').toLowerCase()
    const name = (item.i18n && item.i18n.en && item.i18n.en.name) ? item.i18n.en.name : slug
    if (!slug) continue
    const tags = item.tags || []

    if (isArcaneItem(slug, name, tags)) {
      result.arcanes_maxed.push({ slug, name, maxRank: item.maxRank || 0 })
      result.arcanes_unranked.push({ slug, name, maxRank: item.maxRank || 0 })
      continue
    }
    if (slug.includes('augment') || /\baugment\b/i.test(name) || tags.indexOf('augment') !== -1) {
      result.augments.push({ slug, name, maxRank: item.maxRank || 0 })
      continue
    }
    if (slug.startsWith('primed_') || slug.startsWith('archon_') || /\bprimed\b/i.test(name) || /\barchon\b/i.test(name)) {
      result.primed_maxed.push({ slug, name, maxRank: item.maxRank || 0 })
      result.primed_unranked.push({ slug, name, maxRank: item.maxRank || 0 })
      continue
    }
    if (slug.endsWith('_set') && /\bprime\b/i.test(name)) {
      result.prime_sets.push({ slug, name, maxRank: 0 })
      if (isWarframePrimeSet(name)) result.warframe_sets.push({ slug, name, maxRank: 0 })
      continue
    }
    if (tags.indexOf('mod') !== -1) {
      result.mods_maxed.push({ slug, name, maxRank: item.maxRank || 0 })
      result.mods_unranked.push({ slug, name, maxRank: item.maxRank || 0 })
    }
  }
  return result
}

async function fetchHighestPrice(slug, rank) {
  try {
    let url = 'https://api.warframe.market/v2/orders/item/' + slug + '/top'
    if (rank !== undefined && rank !== null && rank !== 'max') url += '?rank=' + rank
    const res = await axios.get(url, { timeout: 15000, headers: WFM_HEADERS })
    const sell = (res.data && res.data.data && res.data.data.sell) ? res.data.data.sell : []
    if (!sell.length) return null
    const ingame = sell.filter((o) => o.user && o.user.status === 'ingame')
    const pool = ingame.length ? ingame : sell
    let min = Infinity
    for (const o of pool) if (o.platinum != null && o.platinum < min) min = o.platinum
    return min === Infinity ? null : min
  } catch (e) {
    if (e.response && (e.response.status === 429 || e.response.status === 403)) {
      console.error('Highest: rate limit em ' + slug)
    }
    return null
  }
}

async function fetchHighestStats(slug) {
  try {
    const res = await axios.get('https://api.warframe.market/v1/items/' + slug + '/statistics', { timeout: 15000, headers: WFM_HEADERS })
    const payload = res.data && res.data.payload ? res.data.payload : {}
    const closed = payload.statistics_closed || {}
    let vol48 = 0, vol90 = 0
    for (const r of closed['48hours'] || []) vol48 += (r.volume || 0)
    for (const r of closed['90days'] || []) vol90 += (r.volume || 0)
    return { vol48h: vol48, vol90d: vol90 }
  } catch (e) {
    return null
  }
}

async function runHighestUpdater() {
  if (highestLock) {
    console.log('⏳ Highest: updater já em execução, ignorando')
    return
  }
  highestLock = true
  console.log('🚀 Highest: updater iniciado')
  try {
    const cache = loadHighestCache()
    if (!cache.prices) cache.prices = {}
    if (!cache.stats) cache.stats = {}

    const needsCatalog =
      !cache.catalog || !cache.catalog.classified || !cache.catalog.items || !cache.catalog.items.length ||
      (Date.now() - (cache.catalog.lastUpdate || 0)) > HIGHEST_CATALOG_TTL

    if (needsCatalog) {
      console.log('🔄 Highest: atualizando catálogo...')
      const catalog = await fetchHighestCatalog()
      if (catalog.length) {
        const classified = classifyHighestItems(catalog)
        cache.catalog = { lastUpdate: Date.now(), items: catalog, classified }
        saveHighestCache(cache)
        const counts = Object.keys(classified).map((k) => k + '=' + classified[k].length).join(', ')
        console.log('✅ Highest: catálogo atualizado (' + catalog.length + ' itens) ' + counts)
      } else {
        console.log('❌ Highest: catálogo vazio da API')
      }
    } else if (cache.catalog && cache.catalog.items && cache.catalog.items.length && !cache.catalog.classified) {
      console.log('🔧 Highest: reconstruindo classified a partir do catálogo...')
      cache.catalog.classified = classifyHighestItems(cache.catalog.items)
      saveHighestCache(cache)
    }

    if (!cache.catalog || !cache.catalog.classified) {
      console.log('❌ Highest: sem catálogo/classified — abortando')
      highestLock = false
      return
    }

    if (cache.catalog.items && cache.catalog.items.length) {
      cache.catalog.classified = classifyHighestItems(cache.catalog.items)
      saveHighestCache(cache)
      const arcN = (cache.catalog.classified.arcanes_maxed || []).length
      console.log('🔧 Highest: classified atualizado (arcanes_maxed=' + arcN + ')')
      const pricedArc = (cache.prices.arcanes_maxed && cache.prices.arcanes_maxed.items) ? cache.prices.arcanes_maxed.items.length : 0
      if (arcN > pricedArc + 5) {
        console.log('🔄 Highest: invalidando cache de preços de arcanes (lista expandiu ' + pricedArc + ' → ' + arcN + ')')
        delete cache.prices.arcanes_maxed
        delete cache.prices.arcanes_unranked
        saveHighestCache(cache)
      }
    }

    const cats = Object.keys(cache.catalog.classified)
    console.log('📋 Highest: categorias para processar: ' + cats.join(', '))
    for (const cat of cats) {
      const items = cache.catalog.classified[cat] || []
      if (!items.length) { console.log('⏭️ Highest: ' + cat + ' vazia, pulando'); continue }

      const priceEntry = cache.prices[cat] || { lastUpdate: 0, items: [] }
      if (priceEntry.items && priceEntry.items.length && (Date.now() - priceEntry.lastUpdate < HIGHEST_PRICE_TTL)) {
        console.log('⏭️ Highest: ' + cat + ' ainda fresco (' + priceEntry.items.length + ' itens), pulando')
        continue
      }

      console.log('🔄 Highest: atualizando preços de ' + cat + ' (' + items.length + ' itens)...')
      const prices = []
      const catCfg = HIGHEST_CATEGORIES[Object.keys(HIGHEST_CATEGORIES).find((k) => HIGHEST_CATEGORIES[k].id === cat)]
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const rank = catCfg && catCfg.rank === 'max' ? item.maxRank : (catCfg ? catCfg.rank : undefined)
        const price = await fetchHighestPrice(item.slug, rank)
        if (price != null) prices.push({ slug: item.slug, name: item.name, price, rank })
        if ((i + 1) % 50 === 0) {
          console.log('… Highest: ' + cat + ' ' + (i + 1) + '/' + items.length + ' (com preço: ' + prices.length + ')')
          const partial = prices.slice().sort((a, b) => b.price - a.price)
          cache.prices[cat] = { lastUpdate: Date.now(), items: partial, partial: true }
          saveHighestCache(cache)
        }
        await new Promise((r) => setTimeout(r, HIGHEST_REQUEST_DELAY))
      }

      prices.sort((a, b) => b.price - a.price)
      cache.prices[cat] = { lastUpdate: Date.now(), items: prices, partial: false }
      saveHighestCache(cache)
      console.log('✅ Highest: preços de ' + cat + ' atualizados (' + prices.length + ')')

      const top100 = prices.slice(0, 100)
      for (const item of top100) {
        const statsEntry = cache.stats[item.slug]
        if (statsEntry && (Date.now() - statsEntry.lastUpdate) < HIGHEST_STATS_TTL) continue
        const stats = await fetchHighestStats(item.slug)
        if (stats) cache.stats[item.slug] = { ...stats, lastUpdate: Date.now() }
        await new Promise((r) => setTimeout(r, HIGHEST_REQUEST_DELAY))
      }
      saveHighestCache(cache)
      console.log('✅ Highest: estatísticas de ' + cat + ' atualizadas')
    }
    console.log('✅ Highest: atualização completa')
  } catch (e) {
    console.error('Erro no updater Highest:', e.message)
  } finally {
    highestLock = false
  }
}

function formatHighestMenu() {
  let reply = '🏆 *HIGHEST — RANKING DE PREÇOS*\n\n'
  for (const key in HIGHEST_CATEGORIES) reply += key + '️⃣ ' + HIGHEST_CATEGORIES[key].label + '\n'
  reply += '\nUse: `!highest 2` ou `!highest 2 2` (categoria + página)'
  return reply
}

function formatHighestRanking(catNum, page) {
  const catKey = HIGHEST_CATEGORIES[catNum]
  if (!catKey) return '❌ Categoria inválida. Use `!highest` para ver o menu.'

  const cache = loadHighestCache()
  const prices = cache.prices || {}
  const priceEntry = prices[catKey.id]
  if (!priceEntry || !priceEntry.items || !priceEntry.items.length) {
    if (!highestLock) runHighestUpdater().catch((e) => console.error('Highest updater:', e.message))
    return '⏳ *Coletando dados...* Isso pode levar alguns minutos.\nTente novamente em breve.'
  }

  const items = priceEntry.items
  const perPage = 10
  const totalPages = Math.ceil(items.length / perPage)
  const p = Math.max(1, Math.min(page, totalPages))
  const start = (p - 1) * perPage
  const slice = items.slice(start, start + perPage)

  let reply = '🏆 *HIGHEST — ' + catKey.label + '*\n'
  reply += '_Página ' + p + '/' + totalPages + ' | ' + items.length + ' itens_\n\n'

  for (let i = 0; i < slice.length; i++) {
    const item = slice[i]
    const pos = start + i + 1
    const stats = (cache.stats && cache.stats[item.slug]) || {}
    const vol90 = stats.vol90d != null ? stats.vol90d.toLocaleString('pt-BR') : '—'
    const vol48 = stats.vol48h != null ? stats.vol48h.toLocaleString('pt-BR') : '—'
    reply += pos + '. *' + item.name + '* — ' + item.price + 'p\n'
    reply += '   📊 90d: ' + vol90 + ' vendas | 48h: ' + vol48 + ' vendas\n\n'
  }

  if (totalPages > 1) reply += '💡 `!highest ' + catNum + ' ' + (p + 1) + '` para próxima página'
  return reply.trim()
}

module.exports = { runHighestUpdater, formatHighestMenu, formatHighestRanking, loadHighestCache }
