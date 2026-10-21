// src/commands/npc.js
// !npc <vendedor> [MR] [filtros] — o que cada NPC/sindicato vende, preço em standing (R0 -> Max),
// dias de farm (cap diário = 16.000 + 500 x MR) e preço no warframe.market (cache do highest).
const { register } = require('./router')
const npc = require('../services/npc/npcCatalog')
const { getMarketPrices } = require('../services/npc/npcMarket')

const MAX_VENDORS = 6
const MAX_MARKET_ITEMS = 40
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

register(/^!(?:npc|npcs|vendedor|vendedores)(?:\s+(.+))?$/i, async ({ sock, from, match }) => {
  const raw = (match[1] || '').trim()
  if (!raw) {
    await sock.sendMessage(from, { text: npc.listVendorsMessage() })
    return
  }

  const o = npc.parseNpcArgs(raw)
  let vendors = npc.findVendors(o.query)
  if (!vendors.length) {
    await sock.sendMessage(from, { text: '❌ Não achei nenhum vendedor para "*' + (o.query || raw) + '*".\nVeja a lista com `!npc`.' })
    return
  }
  let extra = 0
  if (vendors.length > MAX_VENDORS) { extra = vendors.length - MAX_VENDORS; vendors = vendors.slice(0, MAX_VENDORS) }

  // preços: cache do highest (instantâneo) + poucos pedidos ao vivo para o que faltar
  let market = null
  let info = null
  if (o.market) {
    const items = []
    for (const v of vendors) {
      for (const it of npc.applyFilters(v.items, Object.assign({}, o, { sort: 'cost_desc' }), null)) {
        if (items.length < MAX_MARKET_ITEMS && !items.find((x) => x.name === it.name)) items.push(it)
      }
    }
    try {
      const res = await getMarketPrices(items)
      market = res.prices
      info = res
    } catch (e) {
      console.error('npc mercado:', e.message)
      market = null
    }
  }

  for (const v of vendors) {
    const msgs = npc.formatVendor(v, o, market, info)
    for (const text of msgs) {
      await sock.sendMessage(from, { text })
      if (msgs.length > 1) await sleep(400)
    }
  }
  if (extra) await sock.sendMessage(from, { text: '➕ Há mais ' + extra + ' vendedor(es) nessa busca. Use o nome de um deles para ver.' })
})
