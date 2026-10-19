// src/commands/lich.js
// Snipers e consultas de Kuva Lich / Sisters of Parvos.
const { register } = require('./router')
const { getSenderAliases } = require('../core/adminAuth')
const {
  createLichAlert, listLichAlerts, deleteLichAlert, searchLichNow, lichHelpMessages
} = require('../services/lich/lichAlerts')

// evita martelar a API com !lich seguidos do mesmo usuário
const lastSearch = {}
const SEARCH_COOLDOWN_MS = 15 * 1000

register(/^!alertalich\s+(.+)/i, async ({ sock, from, senderJid, isAdmin, match, msg }) => {
  const ownerJid = senderJid || from
  await sock.sendMessage(from, { text: await createLichAlert(ownerJid, match[1].trim(), isAdmin, getSenderAliases(msg)) })
})

register(/^!alertalich$/i, async ({ sock, from }) => {
  const [guide] = lichHelpMessages()
  await sock.sendMessage(from, { text: guide })
})

register(/^!alertaslich$/i, async ({ sock, from, senderJid, msg }) => {
  await sock.sendMessage(from, { text: listLichAlerts(senderJid || from, getSenderAliases(msg)) })
})

register(/^!delalertalich\s+#?(.+)/i, async ({ sock, from, senderJid, match, msg }) => {
  await sock.sendMessage(from, { text: deleteLichAlert(senderJid || from, match[1].trim(), getSenderAliases(msg)) })
})

// !lich <filtros>: mostra agora os 3 mais baratos
register(/^!lich\s+(.+)/i, async ({ sock, from, senderJid, isAdmin, match }) => {
  const who = senderJid || from
  const now = Date.now()
  if (!isAdmin && lastSearch[who] && now - lastSearch[who] < SEARCH_COOLDOWN_MS) {
    await sock.sendMessage(from, { text: '⏳ Aguarde alguns segundos antes de consultar de novo.' })
    return
  }
  lastSearch[who] = now
  await sock.sendMessage(from, { text: '🔎 Consultando o mercado de lich/sister...' })
  await searchLichNow(sock, from, match[1].trim())
})

// guia + dicionário (armas, elementos, efêmeras)
register(/^!(?:lichajuda|lichstats|dicionariolich|helplich)$/i, async ({ sock, from }) => {
  for (const text of lichHelpMessages()) await sock.sendMessage(from, { text })
})
