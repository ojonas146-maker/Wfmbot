// src/services/wfm/client.js
// Cliente REST básico do warframe.market: resolução de itens, ordens, preços.
const axios = require('axios')
const { toSlug } = require('../../utils/text')

const headers = {
  Platform: 'pc',
  Language: 'en',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
}

const WFM_HEADERS = {
  Platform: 'pc',
  Language: 'en',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://warframe.market',
  Referer: 'https://warframe.market/',
  'Accept-Language': 'en-US,en;q=0.9'
}

async function getItemInfo(slug) {
  try {
    const res = await axios.get('https://api.warframe.market/v2/item/' + slug, { headers, timeout: 10000 })
    return res.data && res.data.data ? res.data.data : null
  } catch (e) {
    return null
  }
}

async function resolveItem(itemName) {
  const base = toSlug(itemName)
  const candidates = [base]
  if (base.indexOf('blueprint') === -1) candidates.push(base + '_blueprint')
  if (base.endsWith('_blueprint')) candidates.push(base.replace(/_blueprint$/, ''))
  const seen = {}
  const unique = []
  for (const c of candidates) {
    if (!seen[c]) { seen[c] = true; unique.push(c) }
  }
  for (const slug of unique) {
    const item = await getItemInfo(slug)
    if (item) return { item, slug }
  }
  return null
}

/** Tenta variações comuns (primed/prime) antes de desistir. Usado pelo RAG e pelo !g. */
async function resolveItemSmart(raw) {
  if (!raw) return null
  const tries = []
  const base = String(raw).trim()
  tries.push(base)
  tries.push(base.replace(/\bprined\b/gi, 'primed'))
  tries.push(base.replace(/\bprime\b/gi, 'primed'))
  tries.push(base.replace(/\bprimed\b/gi, 'prime'))
  if (!/\s/.test(base) && /flow|continuity|pressure|reach|fury|chamber/i.test(base)) {
    tries.push('primed ' + base)
  }
  const seen = {}
  for (const t of tries) {
    const key = t.toLowerCase()
    if (!t || seen[key]) continue
    seen[key] = true
    try {
      const r = await resolveItem(t)
      if (r) return r
    } catch (e) {}
  }
  return null
}

async function getTopOrders(slug, rank) {
  try {
    let url = 'https://api.warframe.market/v2/orders/item/' + slug + '/top'
    if (rank !== undefined && rank !== null) url += '?rank=' + rank
    const res = await axios.get(url, { headers, timeout: 10000 })
    const sell = (res.data && res.data.data && res.data.data.sell) ? res.data.data.sell : []
    const buy = (res.data && res.data.data && res.data.data.buy) ? res.data.data.buy : []
    return { sell, buy }
  } catch (e) {
    return { sell: [], buy: [] }
  }
}

function calcStatsFromOrders(orders) {
  const prices = (orders || []).map((o) => o.platinum).filter((p) => p > 0)
  if (!prices.length) return null
  let sum = 0
  for (const p of prices) sum += p
  return { avg: (sum / prices.length).toFixed(1), min: Math.min(...prices), max: Math.max(...prices), count: prices.length }
}

function cheapestSell(orders) {
  const sells = (orders || []).filter((o) => {
    if (!(o.platinum > 0)) return false
    const status = (o.user && o.user.status) ? o.user.status : ''
    return status === 'ingame'
  })
  if (!sells.length) return null
  sells.sort((a, b) => a.platinum - b.platinum)
  return sells[0]
}

async function getAveragePrice(itemName) {
  try {
    const resolved = await resolveItem(itemName)
    if (!resolved) return '❌ Item "' + itemName + '" não encontrado.'
    const item = resolved.item
    const slug = resolved.slug
    const name = (item.i18n && item.i18n.en && item.i18n.en.name) ? item.i18n.en.name : itemName
    const maxRank = item.maxRank || 0
    let reply = '📊 *' + name + '* (PC)\n\n'

    // ===== Volume de vendas (90d / 48h) — inline, sem dependência externa =====
    let salesStats = null
    try {
      const statsRes = await axios.get(
        'https://api.warframe.market/v1/items/' + slug + '/statistics',
        {
          timeout: 15000,
          headers: {
            'Platform': 'pc',
            'Language': 'en',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://warframe.market',
            'Referer': 'https://warframe.market/'
          }
        }
      )
      const payload = statsRes.data && statsRes.data.payload ? statsRes.data.payload : {}
      const closed = payload.statistics_closed || {}
      let vol48 = 0, vol90 = 0
      const h48 = closed['48hours'] || []
      const d90 = closed['90days'] || []
      for (const r of h48) vol48 += (r.volume || 0)
      for (const r of d90) vol90 += (r.volume || 0)
      salesStats = { vol48h: vol48, vol90d: vol90 }
    } catch (e) {
      console.error('volume stats:', e.message)
    }

    // ===== Preços =====
    if (maxRank > 0) {
      const rank0 = await getTopOrders(slug, 0)
      const rankMax = await getTopOrders(slug, maxRank)
      const stats0 = calcStatsFromOrders(rank0.sell)
      const statsMax = calcStatsFromOrders(rankMax.sell)
      reply += stats0
        ? '🔹 *Rank 0*\nMédia: *' + stats0.avg + 'p* | Min: ' + stats0.min + 'p\nOrdens: ' + stats0.count + '\n\n'
        : '🔹 *Rank 0*: Nenhuma ordem online\n\n'
      reply += statsMax
        ? '🔸 *Rank ' + maxRank + ' (Máximo)*\nMédia: *' + statsMax.avg + 'p* | Min: ' + statsMax.min + 'p\nOrdens: ' + statsMax.count
        : '🔸 *Rank ' + maxRank + '*: Nenhuma ordem online'
    } else {
      const orders = await getTopOrders(slug)
      const statsSell = calcStatsFromOrders(orders.sell)
      const statsBuy = calcStatsFromOrders(orders.buy)
      if (!statsSell && !statsBuy) return '❌ Nenhuma ordem online para *' + name + '*.'
      if (statsSell) reply += '🟢 *Vendendo (online)*\nMédia: *' + statsSell.avg + 'p*\nMin: ' + statsSell.min + 'p | Max: ' + statsSell.max + 'p\nOrdens: ' + statsSell.count + '\n\n'
      if (statsBuy) reply += '🔵 *Comprando (online)*\nMédia: *' + statsBuy.avg + 'p*\nMin: ' + statsBuy.min + 'p | Max: ' + statsBuy.max + 'p\nOrdens: ' + statsBuy.count
    }

    // ===== Volume de vendas no rodapé =====
    if (salesStats && (salesStats.vol90d || salesStats.vol48h)) {
      const v90 = salesStats.vol90d != null ? salesStats.vol90d.toLocaleString('pt-BR') : '—'
      const v48 = salesStats.vol48h != null ? salesStats.vol48h.toLocaleString('pt-BR') : '—'
      reply += '\n\n📈 *Volume de vendas*\n'
      reply += '• 90d: *' + v90 + '* vendas\n'
      reply += '• 48h: *' + v48 + '* vendas'
    }

    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao consultar preço.'
  }
}

async function getProfile(username) {
  try {
    const slug = toSlug(username)
    const res = await axios.get('https://api.warframe.market/v2/user/' + slug, { headers, timeout: 10000 })
    const user = res.data && res.data.data ? res.data.data : null
    if (!user) return '❌ Jogador "' + username + '" não encontrado.'
    let sellCount = 0, buyCount = 0
    try {
      const ordersRes = await axios.get('https://api.warframe.market/v2/orders/user/' + slug, { headers, timeout: 10000 })
      const orders = ordersRes.data && ordersRes.data.data ? ordersRes.data.data : []
      for (const o of orders) {
        if (o.type === 'sell') sellCount++
        if (o.type === 'buy') buyCount++
      }
    } catch (e) {}
    let achievementsText = 'Nenhum'
    try {
      const achRes = await axios.get('https://api.warframe.market/v2/achievements/user/' + slug, { headers, timeout: 10000 })
      const achs = achRes.data && achRes.data.data ? achRes.data.data : []
      if (achs.length > 0) {
        achievementsText = achs.map((a) => (a.i18n && a.i18n.en && a.i18n.en.name) ? a.i18n.en.name : (a.slug || 'Achievement')).join(', ')
      }
    } catch (e) {}
    let statusEmoji = '⚫'
    if (user.status === 'online') statusEmoji = '🟢'
    if (user.status === 'ingame') statusEmoji = '🟡'
    let activityText = 'Nenhuma'
    if (user.activity) {
      const actType = user.activity.type || ''
      const actDetails = user.activity.details || ''
      if (actType && actType !== 'UNKNOWN' && actType !== 'unknown') {
        activityText = actType
        if (actDetails && actDetails !== 'unknown') activityText += ' — ' + actDetails
      } else if (actDetails && actDetails !== 'unknown') activityText = actDetails
    }
    let lastSeen = 'Desconhecido'
    if (user.lastSeen) {
      const d = new Date(user.lastSeen)
      lastSeen = d.toLocaleString('pt-BR')
      const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
      if (diffMin < 1) lastSeen += ' (agora)'
      else if (diffMin < 60) lastSeen += ' (há ' + diffMin + ' min)'
      else if (diffMin < 1440) lastSeen += ' (há ' + Math.floor(diffMin / 60) + ' h)'
      else lastSeen += ' (há ' + Math.floor(diffMin / 1440) + ' dias)'
    }
    let about = 'Nenhuma descrição'
    if (user.about) about = user.about.replace(/<[^>]+>/g, '').replace(/&hellip;/g, '...').replace(/&ldquo;|&rdquo;/g, '"').replace(/&amp;/g, '&').trim()
    const platform = (user.platform || 'pc').toUpperCase()
    const cross = user.crossplay ? 'Sim' : 'Não'
    const tier = user.tier ? user.tier.charAt(0).toUpperCase() + user.tier.slice(1) : 'Nenhum'
    let reply = statusEmoji + ' *' + user.ingameName + '*\n\n'
    reply += '📌 *Status:* ' + user.status + '\n'
    reply += '🎮 *Activity:* ' + activityText + '\n'
    reply += '💻 *Plataforma:* ' + platform + '\n'
    reply += '🔄 *Crossplay:* ' + cross + '\n'
    reply += '⭐ *Reputação:* ' + user.reputation + '\n'
    reply += '📈 *Mastery Rank:* ' + ((user.masteryRank != null) ? user.masteryRank : '?') + '\n'
    reply += '👑 *Tier:* ' + tier + '\n'
    reply += '🎭 *Role:* ' + (user.role || 'user') + '\n'
    reply += '🌐 *Locale:* ' + (user.locale || 'en') + '\n'
    reply += '🕒 *Last seen:* ' + lastSeen + '\n'
    reply += '📦 *Ordens:* ' + sellCount + ' venda | ' + buyCount + ' compra\n'
    reply += '🏅 *Achievements:* ' + achievementsText + '\n\n'
    reply += '📝 *Sobre:*\n' + about.slice(0, 400)
    if (about.length > 400) reply += '...'
    reply += '\n\n🔗 https://warframe.market/profile/' + (user.slug || slug)
    return reply
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar perfil de "' + username + '".'
  }
}

async function getSetPrice(setName) {
  try {
    const slug = toSlug(setName).replace(/_set$/, '')
    const setSlug = slug + '_set'
    let data = null
    try {
      const res = await axios.get('https://api.warframe.market/v2/item/' + setSlug + '/set', { headers, timeout: 10000 })
      data = res.data && res.data.data ? res.data.data : null
    } catch (e) {
      try {
        const res2 = await axios.get('https://api.warframe.market/v2/item/' + toSlug(setName) + '/set', { headers, timeout: 10000 })
        data = res2.data && res2.data.data ? res2.data.data : null
      } catch (e2) {}
    }
    if (!data) return '❌ Set "' + setName + '" não encontrado.\nEx: !set hildryn prime'
    const items = data.items || (Array.isArray(data) ? data : [data])
    if (!items || !items.length) return '❌ Nenhuma parte encontrada para esse set.'
    let reply = '🧩 *Set — ' + setName + '*\n\n'
    let totalMin = 0, hasAll = true, setItem = null
    for (const it of items) {
      const itemSlug = it.slug || ''
      const itemName = (it.i18n && it.i18n.en && it.i18n.en.name) ? it.i18n.en.name : itemSlug
      const isSetRoot = it.setRoot === true || (itemSlug && itemSlug.indexOf('_set') !== -1)
      const orders = await getTopOrders(itemSlug)
      const stats = calcStatsFromOrders(orders.sell)
      if (isSetRoot) { setItem = { name: itemName, stats }; continue }
      if (stats) { reply += '• *' + itemName + '*\n  Min: *' + stats.min + 'p* | Média: ' + stats.avg + 'p\n'; totalMin += stats.min }
      else { reply += '• *' + itemName + '*\n  Sem ordens online\n'; hasAll = false }
      await new Promise((r) => setTimeout(r, 250))
    }
    reply += '\n────────────\n'
    reply += (hasAll && totalMin > 0) ? '💰 *Soma das partes (min):* ' + totalMin + 'p\n' : '💰 *Soma das partes:* incompleta (faltam ordens)\n'
    if (setItem) {
      if (setItem.stats) {
        reply += '📦 *Set completo:* *' + setItem.stats.min + 'p* (média ' + setItem.stats.avg + 'p)\n'
        if (hasAll && totalMin > 0) {
          const diff = setItem.stats.min - totalMin
          if (diff > 0) reply += '📉 Mais barato montar: *partes* (economia de ' + diff + 'p no set)'
          else if (diff < 0) reply += '📈 Mais barato comprar: *set completo* (economia de ' + Math.abs(diff) + 'p)'
          else reply += '⚖️ Preço igual entre partes e set'
        }
      } else reply += '📦 *Set completo:* sem ordens online'
    }
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar set.'
  }
}

async function getRelic(relicName) {
  try {
    const parts = relicName.trim().toLowerCase().split(/\s+/)
    if (parts.length < 2) return '❌ Use: !relic lith a1   ou   !relic meso n11'
    const tier = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
    const name = parts[1].toUpperCase()
    const res = await axios.get('https://drops.warframestat.us/data/relics.json', { timeout: 15000 })
    const relics = Array.isArray(res.data) ? res.data : (res.data.relics || [])
    const byState = {}
    for (const r of relics) {
      if (r.tier === tier && r.relicName === name) byState[r.state] = r
    }
    if (!byState['Intact']) return '❌ Relíquia "' + tier + ' ' + name + '" não encontrada.'
    const relicSlug = tier.toLowerCase() + '_' + name.toLowerCase() + '_relic'
    const relicOrders = await getTopOrders(relicSlug)
    const relicStats = calcStatsFromOrders(relicOrders.sell)
    let reply = '📦 *' + tier + ' ' + name + ' Relic*\n'
    reply += relicStats ? 'Preço médio: *' + relicStats.avg + 'p* (min ' + relicStats.min + 'p)\n\n' : 'Preço: sem ordens online\n\n'
    const items = {}
    const states = ['Intact', 'Flawless', 'Radiant']
    for (const state of states) {
      const relic = byState[state]
      if (!relic || !relic.rewards) continue
      for (const reward of relic.rewards) {
        const key = reward.itemName
        if (!items[key]) items[key] = { name: reward.itemName, rarity: reward.rarity, chanceIntact: null, chances: {} }
        items[key].chances[state] = reward.chance
        if (state === 'Intact') { items[key].rarity = reward.rarity; items[key].chanceIntact = reward.chance }
      }
    }
    reply += '*Drops + Chances:*\n_(I = Intact | F = Flawless | R = Radiant)_\n🟠 Common | 🟡 Uncommon | 🔴 Rare\n\n'
    const list = Object.values(items)
    list.sort((a, b) => (a.chanceIntact != null ? a.chanceIntact : 99) - (b.chanceIntact != null ? b.chanceIntact : 99))
    for (const item of list) {
      let priceText = '—'
      if (item.name.toLowerCase().indexOf('forma') === -1) {
        const slug = toSlug(item.name)
        const orders = await getTopOrders(slug)
        const stats = calcStatsFromOrders(orders.sell)
        priceText = stats ? stats.min + 'p' : '?'
      }
      let emoji = '🟠'
      const ch = item.chanceIntact
      if (ch != null) { if (ch <= 5) emoji = '🔴'; else if (ch <= 15) emoji = '🟡' }
      const cI = item.chances['Intact'] != null ? item.chances['Intact'] + '%' : '-'
      const cF = item.chances['Flawless'] != null ? item.chances['Flawless'] + '%' : '-'
      const cR = item.chances['Radiant'] != null ? item.chances['Radiant'] + '%' : '-'
      reply += emoji + ' *' + item.name + '*\n   I:' + cI + '  F:' + cF + '  R:' + cR + '  → *' + priceText + '*\n'
    }
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar relíquia.'
  }
}

module.exports = {
  headers, WFM_HEADERS,
  getItemInfo, resolveItem, resolveItemSmart,
  getTopOrders, calcStatsFromOrders, cheapestSell,
  getAveragePrice, getProfile, getSetPrice, getRelic
}
