// src/commands/riven.js — comandos de riven (sniper, grade, meta, mercado semanal, highest, !i)
const { register } = require('./router')
const { createRivenAlert, listRivenAlerts, deleteRivenAlert, getRivenGradeMessage, createWeekSnipers } = require('../services/riven/alerts')
const { getRivenMarketMessage, getTopRivensMessage } = require('../services/riven/weekly')
const { getMetaMessage } = require('../services/riven/metaCommands')
const { formatHighestMenu, formatHighestRanking } = require('../services/wfm/highest')
const { getItemInfoCommand } = require('../services/wfm/itemInfo')

register(/^!alertariven\s+(.+)/i, async ({ sock, from, senderJid, isAdmin, match }) => {
  const ownerJid = senderJid || from
  await sock.sendMessage(from, { text: createRivenAlert(ownerJid, match[1].trim(), isAdmin) })
})

register(/^!snipeweek(?:\s+(.*))?$/i, async ({ sock, from, senderJid, isAdmin, match }) => {
  const ownerJidW = senderJid || from
  await sock.sendMessage(from, { text: '📅 Montando snipers da semana...' })
  await sock.sendMessage(from, { text: await createWeekSnipers(ownerJidW, match[1] || '', isAdmin) })
})

register(/^!alertasriven$/i, async ({ sock, from, senderJid }) => {
  await sock.sendMessage(from, { text: listRivenAlerts(senderJid || from) })
})

register(/^!delalertariven\s+(.+)/i, async ({ sock, from, senderJid, match }) => {
  await sock.sendMessage(from, { text: deleteRivenAlert(senderJid || from, match[1].trim()) })
})

register(/^!riven(?:\s+(.+))?$/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🔫 Consultando mercado de riven...' })
  await sock.sendMessage(from, { text: await getRivenMarketMessage(match[1] || '') })
})

register(/^!grade\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '📐 Calculando grade...' })
  await sock.sendMessage(from, { text: await getRivenGradeMessage(match[1].trim()) })
})

register(/^!(meta|grol)\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: getMetaMessage(match[2].trim()) })
})
register(/^!(meta|grol)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: getMetaMessage('') })
})

register(/^!rivendb(?:\s+(pop|top|rolled|unrolled|\d+))*$/i, async ({ sock, from, text }) => {
  await sock.sendMessage(from, { text: '🏆 Consultando ranking semanal de rivens...' })

  const args = text.toLowerCase().split(/\s+/).slice(1)
  let limit = 10
  let rolledFilter = null
  let sortBy = 'price'

  for (const a of args) {
    if (/^\d+$/.test(a)) limit = parseInt(a, 10)
    else if (a === 'rolled') rolledFilter = true
    else if (a === 'unrolled') rolledFilter = false
    else if (a === 'pop' || a === 'popular') sortBy = 'pop'
    else if (a === 'price' || a === 'preco' || a === 'preço') sortBy = 'price'
  }

  await sock.sendMessage(from, { text: await getTopRivensMessage(limit, rolledFilter, sortBy) })
})

register(/^!highest(?:\s+(\d+))?(?:\s+(\d+))?$/i, async ({ sock, from, match }) => {
  if (!match[1]) {
    await sock.sendMessage(from, { text: formatHighestMenu() })
    return
  }
  const catNum = parseInt(match[1], 10)
  const page = match[2] ? parseInt(match[2], 10) : 1
  await sock.sendMessage(from, { text: '🏆 Consultando ranking...' })
  await sock.sendMessage(from, { text: formatHighestRanking(catNum, page) })
})

register(/^!i\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '📜 Buscando *' + match[1].trim() + '*...' })
  await sock.sendMessage(from, { text: await getItemInfoCommand(match[1].trim()) })
})
