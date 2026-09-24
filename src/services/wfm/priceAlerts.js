// src/services/wfm/priceAlerts.js
const fs = require('fs')
const { ALERTS_FILE } = require('../../config/env')
const { toSlug } = require('../../utils/text')
const { resolveItem, getTopOrders, cheapestSell } = require('./client')

function loadAlerts() {
  try {
    if (!fs.existsSync(ALERTS_FILE)) return { nextId: 1, alerts: [] }
    return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'))
  } catch (e) {
    return { nextId: 1, alerts: [] }
  }
}

function saveAlerts(data) {
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(data, null, 2))
}

function conditionMet(operator, limit, currentPrice) {
  if (currentPrice == null) return false
  if (operator === '<=') return currentPrice <= limit
  if (operator === '>=') return currentPrice >= limit
  if (operator === '=') return currentPrice === limit
  return false
}

function parseAlertArgs(raw) {
  let text = raw.trim()
  let rank = null
  const rankMatch = text.match(/\brank\s+(\d+)\b/i)
  if (rankMatch) {
    rank = parseInt(rankMatch[1], 10)
    text = text.replace(/\brank\s+\d+\b/i, '').trim()
  }
  let m = text.match(/^(.+?)\s*(<=|>=|=)\s*(\d+)\s*$/i)
  if (m) return { itemName: m[1].trim(), operator: m[2], price: parseInt(m[3], 10), rank }
  m = text.match(/^(.+?)\s+(\d+)\s*$/)
  if (m) return { itemName: m[1].trim(), operator: '<=', price: parseInt(m[2], 10), rank }
  return null
}

async function createAlert(userJid, rawArgs) {
  const parsed = parseAlertArgs(rawArgs)
  if (!parsed) {
    return '❌ *Como usar o alerta:*\n\nFormato:\n!alerta <item> [rank X] <=40\n\nExemplos:\n• !alerta hildryn prime set <=40\n• !alerta primed flow rank 10 <=70\n• !alerta item 40\n\n<= máximo | >= mínimo | = exato\nrank X para mods/arcanos'
  }
  const resolved = await resolveItem(parsed.itemName)
  if (!resolved) return '❌ Item "' + parsed.itemName + '" não encontrado.'
  const displayName = (resolved.item.i18n && resolved.item.i18n.en && resolved.item.i18n.en.name) ? resolved.item.i18n.en.name : parsed.itemName
  const store = loadAlerts()
  const id = store.nextId++
  store.alerts.push({ id, userJid, itemName: displayName, slug: resolved.slug, operator: parsed.operator, price: parsed.price, rank: parsed.rank, triggered: false, createdAt: new Date().toISOString() })
  saveAlerts(store)
  const rankText = (parsed.rank !== null) ? ' rank ' + parsed.rank : ''
  return '🔔 *ALERTA CRIADO*\n\nItem: *' + displayName + '*' + rankText + '\nCondição: preço ' + parsed.operator + ' *' + parsed.price + 'p*\nFiltro: só *ingame*\nVerificação: 5 min\nID: *#' + id + '*'
}

function listAlerts(userJid) {
  const store = loadAlerts()
  const mine = store.alerts.filter((a) => a.userJid === userJid)
  if (!mine.length) return '🔔 Sem alertas.\nCrie: !alerta item <=40'
  let reply = '🔔 *SEUS ALERTAS*\n\n'
  for (const a of mine) {
    const icon = a.operator === '>=' ? '🔵' : '🟢'
    const rankText = (a.rank != null) ? ' rank ' + a.rank : ''
    reply += '#' + a.id + ' ' + icon + ' *' + a.itemName + '*' + rankText + ' ' + a.operator + ' ' + a.price + 'p\n'
  }
  return reply.trim()
}

function deleteAlert(userJid, arg) {
  const store = loadAlerts()
  if (/^all$/i.test(arg)) {
    const before = store.alerts.length
    store.alerts = store.alerts.filter((a) => a.userJid !== userJid)
    const removed = before - store.alerts.length
    saveAlerts(store)
    return removed ? '✅ ' + removed + ' alerta(s) removido(s).' : 'Você não tinha alertas.'
  }
  const id = parseInt(arg, 10)
  if (!id) return '❌ Use: !delalerta 17  ou  !delalerta all'
  const idx = store.alerts.findIndex((a) => a.id === id && a.userJid === userJid)
  if (idx === -1) return '❌ Alerta #' + id + ' não encontrado (ou não é seu).'
  store.alerts.splice(idx, 1)
  saveAlerts(store)
  return '✅ Alerta *#' + id + '* removido.'
}

async function checkAlerts(sock) {
  const store = loadAlerts()
  if (!store.alerts.length) return
  console.log('🔔 Verificando ' + store.alerts.length + ' alerta(s)...')
  let changed = false
  for (const a of store.alerts) {
    try {
      const orders = await getTopOrders(a.slug, a.rank != null ? a.rank : undefined)
      const best = cheapestSell(orders.sell)
      const current = best ? best.platinum : null
      const met = conditionMet(a.operator, a.price, current)
      if (met && !a.triggered) {
        a.triggered = true
        changed = true
        const seller = (best.user && (best.user.ingameName || best.user.ingame_name)) || 'Desconhecido'
        const rankText = (best.rank != null) ? String(best.rank) : '—'
        const msg = '🚨 *ALERTA DE PREÇO*\n\n🧩 *' + a.itemName + '*' +
          (a.rank != null ? ' (Rank ' + a.rank + ')' : '') +
          '\n\n💰 Preço: *' + current + 'p*\n🎯 Limite: ' + a.operator + ' ' + a.price + 'p\n\n👤 ' + seller +
          '\n📦 Rank: ' + rankText + '\n💻 PC | *ingame*\n\n🔗 https://warframe.market/profile/' + toSlug(seller)
        try { await sock.sendMessage(a.userJid, { text: msg }) } catch (e) { console.error(e.message) }
      } else if (!met && a.triggered) {
        a.triggered = false
        changed = true
      }
      await new Promise((r) => setTimeout(r, 400))
    } catch (e) {
      console.error('Erro alerta #' + a.id + ':', e.message)
    }
  }
  if (changed) saveAlerts(store)
}

module.exports = { loadAlerts, saveAlerts, parseAlertArgs, conditionMet, createAlert, listAlerts, deleteAlert, checkAlerts }
