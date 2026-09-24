// src/services/riven/auctionSearch.js
// Busca de leilões de riven no warframe.market, com backoff de 429 global
// (compartilhado entre todas as chamadas pra não martelar a API em cooldown).
const axios = require('axios')
const { RIVEN_AUCTIONS_URL } = require('../../config/env')
const { sleep } = require('../../utils/time')

let riven429Until = 0

async function searchRivenAuctions(weapon, positiveStats, opts) {
  opts = opts || {}

  const now = Date.now()
  if (now < riven429Until) {
    const waitLeft = riven429Until - now
    console.log('⏳ riven search em cooldown — aguardando ' + Math.round(waitLeft / 1000) + 's')
    await sleep(waitLeft)
  }

  try {
    const params = {
      type: 'riven',
      weapon_url_name: String(weapon || '').toLowerCase(),
      sort_by: opts.sortBy || 'price_asc'
    }
    if (positiveStats && positiveStats.length) {
      params.positive_stats = positiveStats.join(',')
    }

    const res = await axios.get(RIVEN_AUCTIONS_URL, {
      timeout: 20000,
      headers: {
        Platform: 'pc',
        Language: 'en',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://warframe.market',
        Referer: 'https://warframe.market/auctions',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      params
    })
    return (res.data && res.data.payload && res.data.payload.auctions) || []
  } catch (e) {
    const status = (e.response && e.response.status) || null
    const msg = e.message || ''

    if (status === 429 || /429|rate.?limit|too many/i.test(msg)) {
      const retry = e.response && e.response.headers && e.response.headers['retry-after']
      let waitMs = retry ? parseInt(retry, 10) * 1000 : 20000
      if (isNaN(waitMs) || waitMs < 10000) waitMs = 20000
      if (waitMs > 60000) waitMs = 60000
      riven429Until = Date.now() + waitMs
      console.log('⏳ 429 em riven search — cooldown ' + Math.round(waitMs / 1000) + 's')
    } else {
      console.error('Erro riven search:', status || msg)
    }
    return []
  }
}

async function searchRivenAuctionsBroad(weapon, positiveStats) {
  const seen = {}
  const out = []
  function add(list) {
    for (const a of list || []) {
      if (!a || !a.id || seen[a.id]) continue
      seen[a.id] = true
      out.push(a)
    }
  }

  if (Date.now() < riven429Until) {
    console.log('⏳ broad search pulado (cooldown 429 ativo)')
    return []
  }

  add(await searchRivenAuctions(weapon, positiveStats, { sortBy: 'price_asc' }))
  if (Date.now() < riven429Until) return out

  if (positiveStats && positiveStats.length >= 2) {
    await sleep(800)
    if (Date.now() < riven429Until) return out
    add(await searchRivenAuctions(weapon, [positiveStats[0]], { sortBy: 'price_asc' }))

    if (Date.now() < riven429Until) return out
    try {
      await sleep(800)
      if (Date.now() < riven429Until) return out
      add(await searchRivenAuctions(weapon, positiveStats, { sortBy: 'created' }))
    } catch (e) {}
  }
  return out
}

function isIn429Cooldown() {
  return Date.now() < riven429Until
}

module.exports = { searchRivenAuctions, searchRivenAuctionsBroad, isIn429Cooldown }
