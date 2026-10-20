// src/commands/npc.js
// !npc <vendedor> [MR] [filtros] — o que cada NPC/sindicato vende, preço R0 e Rank Max,
// dias de farm (cap diário de standing = 16.000 + 500 x MR) e comparação com o mercado.
const { register } = require('./router')
const npc = require('../services/npc/npcCatalog')
const { resolveItem, getTopOrders } = require('../services/wfm/client')

const MAX_VENDORS = 6
const MAX_MARKET_ITEMS = 18
const lastMarket = {}
const MARKET_COOLDOWN_MS = 30 * 1000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// menor preço de venda: prioriza ingame, depois online, depois qualquer um
function bestPrice(sell) {
  const ok = (sell || []).filter((o) => o && o.platinum > 0)
  if (!ok.length) return null
  const pick = (status) => ok.filter((o) => o.user && o.user.status === status).sort((a, b) => a.platinum - b.platinum)[0]
  const o = pick('ingame') || pick('online') || ok.sort((a, b) => a.platinum - b.platinum)[0]
  return o ? o.platinum : null
}

async function fetchMarket(items) {
  const out = {}
  for (const it of items) {
    try {
      const resolved = await resolveItem(it.name)
      if (!resolved) { out[it.name] = { r0: null, max: null }; continue }
      const ranked = it.maxRank != null && it.copiesForMax > 1
      const first = ranked ? await getTopOrders(resolved.slug, 0) : await getTopOrders(resolved.slug)
      const entry = { r0: bestPrice(first.sell), max: null }
      if (ranked) {
        await sleep(250)
        const mx = await getTopOrders(resolved.slug, it.maxRank)
        entry.max = bestPrice(mx.sell)
      }
      out[it.name] = entry
    } catch (e) {
      out[it.name] = { r0: null, max: null }
    }
    await sleep(250)
  }
  return out
}

register(/^!(?:npc|npcs|vendedor|vendedores)(?:\s+(.+))?$/i, async ({ sock, from, senderJid, isAdmin, match }) => {
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

  let market = null
  if (o.market) {
    const who = senderJid || from
    const now = Date.now()
    if (!isAdmin && lastMarket[who] && now - lastMarket[who] < MARKET_COOLDOWN_MS) {
      await sock.sendMessage(from, { text: '⏳ Aguarde alguns segundos antes de consultar o mercado de novo.' })
      return
    }
    lastMarket[who] = now
    const toFetch = []
    for (const v of vendors) for (const it of npc.applyFilters(v.items, o)) if (toFetch.length < MAX_MARKET_ITEMS && !toFetch.find((x) => x.name === it.name)) toFetch.push(it)
    await sock.sendMessage(from, { text: '💎 Consultando o mercado (' + toFetch.length + ' itens, leva alguns segundos)...' })
    market = await fetchMarket(toFetch)
  }

  for (const v of vendors) {
    const msgs = npc.formatVendor(v, o, market)
    for (const text of msgs) {
      await sock.sendMessage(from, { text })
      if (msgs.length > 1) await sleep(400)
    }
  }
  const tail = []
  if (extra) tail.push('➕ Há mais ' + extra + ' vendedor(es) nessa busca. Use o nome de um deles para ver.')
  if (market) tail.push('💎 Preços do mercado: menor oferta online/ingame, só dos ' + MAX_MARKET_ITEMS + ' primeiros itens. Use filtros (arcane, mod) para focar.')
  if (tail.length) await sock.sendMessage(from, { text: tail.join('\n') })
})
