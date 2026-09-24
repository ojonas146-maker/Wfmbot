// src/commands/price.js — !p, !set, !perfil, !relic, !alerta, !alertas, !delalerta
const { register } = require('./router')
const { getAveragePrice, getProfile, getSetPrice, getRelic } = require('../services/wfm/client')
const { createAlert, listAlerts, deleteAlert } = require('../services/wfm/priceAlerts')

register(/^!p\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🔍 Buscando *' + match[1].trim() + '*...' })
  await sock.sendMessage(from, { text: await getAveragePrice(match[1].trim()) })
})

register(/^!set\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🧩 Buscando set *' + match[1].trim() + '*...' })
  await sock.sendMessage(from, { text: await getSetPrice(match[1].trim()) })
})

register(/^!perfil\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '👤 Buscando perfil de *' + match[1].trim() + '*...' })
  await sock.sendMessage(from, { text: await getProfile(match[1].trim()) })
})

register(/^!relic\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '📦 Buscando relíquia *' + match[1].trim() + '*...' })
  await sock.sendMessage(from, { text: await getRelic(match[1].trim()) })
})

register(/^!alerta\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: await createAlert(from, match[1].trim()) })
})

register(/^!alertas$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: listAlerts(from) })
})

register(/^!delalerta\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: deleteAlert(from, match[1].trim()) })
})
