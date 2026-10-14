// src/commands/riven.js — comandos de riven (sniper, grade, meta, mercado semanal, highest, !i)
const { register } = require('./router')
const { createRivenAlert, listRivenAlerts, deleteRivenAlert, getRivenGradeMessage, getRivenGradeImage, createWeekSnipers } = require('../services/riven/alerts')
const { getSenderAliases } = require('../core/adminAuth')
const { getRivenStatsMessages } = require('../services/riven/statDictionary')
const { getRivenMarketMessage, getTopRivensMessage } = require('../services/riven/weekly')
const { getMetaMessage } = require('../services/riven/metaCommands')
const { formatHighestMenu, formatHighestRanking } = require('../services/wfm/highest')
const { getItemInfoCommand } = require('../services/wfm/itemInfo')

register(/^!alertariven\s+(.+)/i, async ({ sock, from, senderJid, isAdmin, match, msg }) => {
  const ownerJid = senderJid || from
  await sock.sendMessage(from, { text: createRivenAlert(ownerJid, match[1].trim(), isAdmin, getSenderAliases(msg)) })
})

register(/^!snipeweek(?:\s+(.*))?$/i, async ({ sock, from, senderJid, isAdmin, match }) => {
  const ownerJidW = senderJid || from
  await sock.sendMessage(from, { text: '📅 Montando snipers da semana...' })
  await sock.sendMessage(from, { text: await createWeekSnipers(ownerJidW, match[1] || '', isAdmin) })
})

register(/^!alertasriven$/i, async ({ sock, from, senderJid, msg }) => {
  await sock.sendMessage(from, { text: listRivenAlerts(senderJid || from, getSenderAliases(msg)) })
})

register(/^!delalertariven\s+#?(.+)/i, async ({ sock, from, senderJid, match, msg }) => {
  await sock.sendMessage(from, { text: deleteRivenAlert(senderJid || from, match[1].trim(), getSenderAliases(msg)) })
})

register(/^!riven(?:\s+(.+))?$/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🔫 Consultando mercado de riven...' })
  await sock.sendMessage(from, { text: await getRivenMarketMessage(match[1] || '') })
})

// /grade com imagem: legenda "/grade" no print do riven, ou resposta a uma imagem com "/grade".
// Rank diferente de 8: "/grade r5". Fica ANTES de !grade <link> para ter prioridade.
register(/^!grade(?:\s+(?:r|rank)\s*(\d{1,2}))?\s*$/i, async ({ sock, from, msg, match }) => {
  const { gradeRivenFromMessage } = require('../services/riven/rivenImage')
  const hasImage = !!(msg && msg.message && (msg.message.imageMessage ||
    (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo &&
      msg.message.extendedTextMessage.contextInfo.quotedMessage &&
      msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage)))
  if (hasImage) await sock.sendMessage(from, { text: '📐 Lendo o riven...' })
  const res = await gradeRivenFromMessage(sock, msg, { rank: match[1] != null ? Number(match[1]) : null })
  if (res.error) {
    await sock.sendMessage(from, { text: res.error })
    return
  }
  await sock.sendMessage(from, { image: res.png }, { quoted: msg })
})

// /grade <link|id> -> cartão em imagem. Para o texto completo: "/grade <link> texto"
register(/^!grade\s+(.+)/i, async ({ sock, from, msg, match }) => {
  const arg = match[1].trim()
  const wantText = /\s+(texto|text|full|completo)$/i.test(arg)
  const link = arg.replace(/\s+(texto|text|full|completo)$/i, '').trim()
  await sock.sendMessage(from, { text: '📐 Calculando grade...' })
  if (!wantText) {
    const card = await getRivenGradeImage(link)
    if (card && card.png) {
      await sock.sendMessage(from, { image: card.png, caption: card.caption }, { quoted: msg })
      if (card.whisper) await sock.sendMessage(from, { text: card.whisper })
      return
    }
  }
  await sock.sendMessage(from, { text: await getRivenGradeMessage(link) })
})

// Dicionário de stats / como montar o !alertariven. "!rivenstats weakpoint" procura um stat.
register(/^!(?:rivenstats|statsriven|dicionario|dicstats)(?:\s+(.+))?$/i, async ({ sock, from, match }) => {
  const parts = getRivenStatsMessages(match[1] || '')
  for (const text of parts) await sock.sendMessage(from, { text })
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
