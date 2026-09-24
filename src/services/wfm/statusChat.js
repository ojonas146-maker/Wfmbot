// src/services/wfm/statusChat.js
// Status (online/ingame/invisible) e chat em tempo real do warframe.market
// via WebSocket, usado pelos comandos admin !online/!ingame/!offline/!start/!stop.
const axios = require('axios')
const WebSocket = require('ws')
const env = require('../../config/env')
const { WFM_HEADERS } = require('./client')

const WFM_WS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  Origin: 'https://warframe.market'
}

function cleanWfmJwt() {
  return (env.WFM_JWT || '').replace(/^JWT\s+/i, '').replace(/^Bearer\s+/i, '').trim()
}

const wfmBackoff = {}
function wfmNextBackoff(key) {
  wfmBackoff[key] = Math.min((wfmBackoff[key] || 2500) * 2, 60000)
  return wfmBackoff[key]
}
function wfmResetBackoff(key) { wfmBackoff[key] = 0 }

const wfmState = {
  desiredStatus: null,
  monitorActive: false,
  pollTimer: null,
  knownMessageIds: new Set(),
  firstRunDone: false,
  messagesForwarded: 0,
  lastCheck: null,
  notifyJid: null,
  ws: null,
  wsConnected: false,
  chatWs: null,
  chatWsConnected: false,
  pendingSend: null,
  chatPeers: new Map(),
  userId: null,
  ingameName: null,
  lastWsMessage: null,
  lastStatus: null
}

const WFM_MAX_KNOWN_IDS = 5000
function wfmRememberMessageId(id) {
  wfmState.knownMessageIds.add(id)
  if (wfmState.knownMessageIds.size > WFM_MAX_KNOWN_IDS) {
    const excess = wfmState.knownMessageIds.size - WFM_MAX_KNOWN_IDS
    let i = 0
    for (const old of wfmState.knownMessageIds) {
      wfmState.knownMessageIds.delete(old)
      if (++i >= excess) break
    }
  }
}

function wfmStripHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

function wfmFormatTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch (e) { return iso }
}

// ---- WebSocket v2 oficial: status ----
function connectWfmStatusWs() {
  if (!env.WFM_JWT) return
  try {
    const url = 'wss://ws.warframe.market/socket?platform=pc'
    wfmState.ws = new WebSocket(url, ['wfm'], { headers: WFM_WS_HEADERS })

    wfmState.ws.on('open', () => {
      wfmResetBackoff('ws')
      console.log('[WFM] 🔌 WS status conectado. Autenticando...')
      wfmState.ws.send(JSON.stringify({ route: '@wfm|cmd/auth/signIn', payload: { token: cleanWfmJwt() } }))
    })

    wfmState.ws.on('message', (raw) => {
      const text = raw.toString()
      wfmState.lastWsMessage = text
      let msg
      try { msg = JSON.parse(text) } catch (e) { return }

      if (msg.route === '@wfm|cmd/auth/signIn:ok') {
        wfmState.wsConnected = true
        console.log('[WFM] 🔐 WS status autenticado.')
        if (wfmState.desiredStatus) {
          setTimeout(() => setStatusWs(wfmState.desiredStatus), 1000)
        }
      }
      if (msg.route === '@wfm|event/status/set') {
        wfmState.lastStatus = msg.payload && msg.payload.status
        console.log('[WFM] 🟢 Status no servidor: ' + wfmState.lastStatus)
      }
      if (!wfmState.ingameName && msg.payload) {
        wfmState.ingameName =
          (msg.payload.user && msg.payload.user.ingame_name) ||
          msg.payload.ingame_name ||
          (msg.payload.user && msg.payload.user.ingameName) ||
          null
      }
    })

    wfmState.ws.on('close', (code) => {
      wfmState.wsConnected = false
      const wait = wfmNextBackoff('ws')
      console.log('[WFM] 🔌 WS status desconectado (' + code + '). Reconectando em ' + (wait / 1000) + 's...')
      setTimeout(connectWfmStatusWs, wait)
    })

    wfmState.ws.on('error', (e) => console.error('[WFM] WS status erro: ' + e.message))
  } catch (e) {
    console.error('[WFM] WS status connect: ' + e.message)
  }
}

// ---- WebSocket v1: chat ----
function connectWfmChatWs() {
  if (!env.WFM_JWT) return
  try {
    wfmState.chatWs = new WebSocket('wss://warframe.market/socket?platform=pc', {
      headers: { 'User-Agent': WFM_WS_HEADERS['User-Agent'], Origin: 'https://warframe.market', Cookie: 'JWT=' + cleanWfmJwt() }
    })

    wfmState.chatWs.on('open', () => {
      wfmState.chatWsConnected = true
      wfmResetBackoff('chatWs')
      console.log('[WFM] 💬 WS chat conectado.')
    })

    wfmState.chatWs.on('message', (raw) => {
      const text = raw.toString()
      let msg
      try { msg = JSON.parse(text) } catch (e) { return }
      const type = msg.type || ''
      if (type === '@WS/MESSAGE/ONLINE_COUNT') return

      if (type === '@WS/ERROR') {
        console.error('[WFM] WS chat erro: ' + msg.payload)
        if (String(msg.payload).indexOf('unauthorized') !== -1) {
          wfmState.chatWsConnected = false
          console.error('[WFM] JWT do socket de chat rejeitado (expirado?).')
        }
        if (wfmState.pendingSend) wfmState.pendingSend.finish({ success: false, error: String(msg.payload) })
        return
      }

      if (type === '@WS/chats/MESSAGE_SENT') {
        const cm = (msg.payload && msg.payload.message) || msg.payload || {}
        if (!wfmState.userId && cm.message_from) wfmState.userId = cm.message_from
        if (wfmState.pendingSend) wfmState.pendingSend.finish({ success: true })
        return
      }

      if (type === '@WS/chats/NEW_MESSAGE') {
        handleIncomingWfmChat(msg.payload || {})
      }
    })

    wfmState.chatWs.on('close', (code) => {
      wfmState.chatWsConnected = false
      if (wfmState.pendingSend) wfmState.pendingSend.finish({ success: false, error: 'WS de chat caiu durante o envio.' })
      const wait = wfmNextBackoff('chatWs')
      console.log('[WFM] 💬 WS chat desconectado (' + code + '). Reconectando em ' + (wait / 1000) + 's...')
      setTimeout(connectWfmChatWs, wait)
    })

    wfmState.chatWs.on('error', (e) => console.error('[WFM] WS chat erro: ' + e.message))
  } catch (e) {
    console.error('[WFM] WS chat connect: ' + e.message)
  }
}

function setStatusWs(status) {
  if (!wfmState.ws || wfmState.ws.readyState !== 1) return '⚠️ WS não está conectado.'
  if (!wfmState.wsConnected) return '⚠️ WS ainda não autenticou. Aguarde alguns segundos.'

  const validStatus = ['online', 'ingame', 'invisible']
  if (validStatus.indexOf(status) === -1) return '⚠️ Status inválido. Use: ' + validStatus.join(', ')

  try {
    wfmState.ws.send(JSON.stringify({ route: '@wfm|cmd/status/set', payload: { status } }))
    wfmState.lastStatus = status
    return '✅ Comando de status (*' + status + '*) enviado via WebSocket. Fica valendo enquanto o bot estiver online.'
  } catch (e) {
    return '❌ Falha ao enviar comando pelo WebSocket.'
  }
}

function rememberWfmDesiredStatus(status) { wfmState.desiredStatus = status }
function stopWfmStatusRefresh() { wfmState.desiredStatus = null }

async function setWfmStatus(status) {
  const result = setStatusWs(status)
  rememberWfmDesiredStatus(status)
  return result
}

// ---- REST: buscar chats ----
async function fetchWfmChats() {
  try {
    const res = await axios.get('https://api.warframe.market/v1/im/chats', {
      headers: Object.assign({}, WFM_HEADERS, { Authorization: 'JWT ' + cleanWfmJwt() }),
      timeout: 15000
    })
    return (res.data && res.data.payload && res.data.payload.chats) || []
  } catch (err) {
    const status = err.response && err.response.status
    if ([401, 403, 404].indexOf(status) !== -1) {
      console.error('[WFM] ' + status + '. JWT pode ter expirado.')
      return null
    }
    const silent = ['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']
    if (silent.indexOf(err.code) !== -1) return []
    console.error('[WFM] Erro fetch chats: ' + err.message)
    return []
  }
}

// ---- enviar resposta via WS ----
function sendToWfmMarket(chatId, textMessage) {
  return new Promise((resolve) => {
    if (!wfmState.chatWs || wfmState.chatWs.readyState !== 1) {
      return resolve({ success: false, error: 'WS de chat (v1) não está conectado.' })
    }
    let done = false
    let timer
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      wfmState.pendingSend = null
      resolve(result)
    }
    timer = setTimeout(() => finish({ success: false, error: 'Sem confirmação do servidor em 10s.' }), 10000)
    wfmState.pendingSend = { chatId, finish }
    wfmState.chatWs.send(JSON.stringify({ type: '@WS/chats/SEND_MESSAGE', payload: { chat_id: chatId, message: textMessage } }), (err) => {
      if (err) finish({ success: false, error: err.message })
    })
  })
}

async function handleIncomingWfmChat(cm) {
  if (!cm || !cm.id) return
  if (!wfmState.monitorActive || !wfmState.notifyJid) return
  if (wfmState.knownMessageIds.has(cm.id)) return
  wfmRememberMessageId(cm.id)
  if (wfmState.userId && cm.message_from === wfmState.userId) return

  const info = wfmState.chatPeers.get(cm.chat_id) || {}
  wfmState.messagesForwarded++

  await notifyWfmMessage({
    name: info.name || 'Desconhecido',
    reputation: info.reputation != null ? info.reputation : 0,
    platform: info.platform || 'pc',
    crossplay: info.crossplay,
    status: info.status || 'online',
    text: cm.raw_message || wfmStripHtml(cm.message) || '(sem texto)',
    timeIso: cm.send_date || new Date().toISOString(),
    chatId: cm.chat_id
  })
}

let globalSockRef = null
function setGlobalSock(sock) { globalSockRef = sock }

async function checkNewWfmMessages() {
  if (!globalSockRef || !wfmState.notifyJid) return

  const chats = await fetchWfmChats()
  if (chats === null) {
    console.log('[WFM] Monitor pausado (JWT inválido).')
    stopWfmMonitor()
    return
  }

  wfmState.lastCheck = Date.now()
  const isFirstRun = !wfmState.firstRunDone

  for (const chat of chats) {
    const otherName = chat.chat_name || 'Desconhecido'
    const otherUser = (chat.chat_with || []).find((u) => u.ingame_name === otherName) || (chat.chat_with || [])[0]
    const otherId = otherUser && otherUser.id
    const messages = Array.isArray(chat.messages) ? chat.messages : []

    wfmState.chatPeers.set(chat.id, {
      name: otherName,
      reputation: (otherUser && otherUser.reputation != null) ? otherUser.reputation : 0,
      platform: (otherUser && otherUser.platform) || 'pc',
      crossplay: otherUser && otherUser.crossplay,
      status: (otherUser && otherUser.status) || 'offline'
    })

    for (const msgc of messages) {
      if (!msgc.id || wfmState.knownMessageIds.has(msgc.id)) continue
      wfmRememberMessageId(msgc.id)
      if (isFirstRun) continue
      if (otherId && msgc.message_from !== otherId) continue

      const mtext = msgc.raw_message || wfmStripHtml(msgc.message) || '(sem texto)'
      const mtime = msgc.send_date || ''
      wfmState.messagesForwarded++

      await notifyWfmMessage({
        name: otherName,
        reputation: (otherUser && otherUser.reputation != null) ? otherUser.reputation : 0,
        platform: (otherUser && otherUser.platform) || 'pc',
        crossplay: otherUser && otherUser.crossplay,
        status: (otherUser && otherUser.status) || 'offline',
        text: mtext, timeIso: mtime, chatId: chat.id
      })
    }
  }

  wfmState.firstRunDone = true
}

async function notifyWfmMessage(info) {
  if (!globalSockRef || !wfmState.notifyJid) return

  const time = wfmFormatTime(info.timeIso)
  const body =
    '💬 *Nova mensagem WFM*\n' +
    '👤 ' + info.name + ' (rep ⭐ ' + info.reputation + ')\n' +
    '🎮 ' + String(info.platform).toUpperCase() + ' · Crossplay ' + (info.crossplay ? '✓' : '✗') + '\n' +
    '📡 Status: ' + info.status + '\n' +
    '🕐 ' + time + '\n\n' +
    '📝 ' + info.text + '\n\n' +
    '---\n' +
    '_Responda esta mensagem para responder no market._\n' +
    '🔗 https://warframe.market/im/chats/' + info.chatId

  try {
    await globalSockRef.sendMessage(wfmState.notifyJid, { text: body })
  } catch (e) {
    console.error('[WFM] Falha ao enviar notificação: ' + e.message)
  }
}

function startWfmMonitor(jid) {
  if (!jid) return '❌ Sem chat definido.'
  if (!env.WFM_JWT) return '❌ WFM_JWT não configurado nas variáveis de ambiente.'
  wfmState.notifyJid = jid
  wfmState.monitorActive = true
  wfmState.knownMessageIds = new Set()
  wfmState.firstRunDone = false
  wfmState.messagesForwarded = 0

  if (wfmState.pollTimer) clearInterval(wfmState.pollTimer)
  checkNewWfmMessages().catch((e) => console.error('[WFM] check inicial:', e.message))
  wfmState.pollTimer = setInterval(() => {
    checkNewWfmMessages().catch((e) => console.error('[WFM] poll:', e.message))
  }, env.WFM_POLL_INTERVAL_MS)
  return '✅ Monitor *ligado*. Vou te avisar aqui quando chegar mensagem no market.'
}

function stopWfmMonitor() {
  if (!wfmState.monitorActive) return 'Monitor já está desligado.'
  wfmState.monitorActive = false
  if (wfmState.pollTimer) {
    clearInterval(wfmState.pollTimer)
    wfmState.pollTimer = null
  }
  return '⏹️ Monitor *desligado*. (' + wfmState.messagesForwarded + ' msgs encaminhadas)'
}

function wfmHelpText() {
  return (
    '🤖 *WFM — Status & Chat* (admin)\n\n' +
    '*Escuta:*\n' +
    '• *!start* — liga a escuta (tempo real + poll 30s)\n' +
    '• *!stop* — desliga a escuta\n' +
    '• *!status* — status do bot WFM\n\n' +
    '*Status WFM:*\n' +
    '• *!online* / *!ingame* / *!offline* — fica valendo pra sempre\n' +
    '  enquanto o bot estiver conectado (sem duration = sem expirar)\n' +
    '• *!statusauto off* — para de reaplicar o status se o WS reconectar;\n' +
    '  use se for mudar manualmente no site/in-game\n' +
    '• *!statusauto on* — volta a reaplicar o último status na reconexão\n\n' +
    '*Responder no Market:*\n' +
    '• Responda (cite) a notificação do bot com sua resposta.\n\n' +
    '*Outros:*\n' +
    '• *!ws* — última msg do WS\n' +
    '• *!wfmtest* — notificação de teste\n' +
    '• *!wfmdebug* — info técnica'
  )
}

function initWfmSockets() {
  if (env.WFM_JWT) {
    connectWfmStatusWs()
    connectWfmChatWs()
  } else {
    console.log('[WFM] ⚠️ WFM_JWT não configurado — status/chat do Market desativados.')
  }
}

module.exports = {
  wfmState, setGlobalSock, initWfmSockets,
  setWfmStatus, rememberWfmDesiredStatus, stopWfmStatusRefresh,
  fetchWfmChats, sendToWfmMarket, checkNewWfmMessages, notifyWfmMessage,
  startWfmMonitor, stopWfmMonitor, wfmHelpText, wfmStripHtml, wfmFormatTime
}
