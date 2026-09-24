// index.js — bootstrap do bot. Toda a lógica de domínio vive em src/;
// este arquivo só levanta o socket do WhatsApp e liga os comandos.
require('dotenv').config()
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')

const env = require('./src/config/env')
const { isAdmin, getSenderJid, isUserMuted, canUseRivenSnipe } = require('./src/core/adminAuth')
const { loadAdminConfig } = require('./src/core/adminConfig')
const { adminState } = require('./src/core/adminState')
const { ensureArbyData } = require('./src/services/worldstate/arbitration')
const { setGlobalSock, initWfmSockets, sendToWfmMarket } = require('./src/services/wfm/statusChat')
const { runHighestUpdater } = require('./src/services/wfm/highest')
const { runAllChecks } = require('./src/jobs/scheduler')
const { route } = require('./src/commands/router')

// Registra todos os comandos (cada require só tem efeito colateral de chamar
// router.register(...) várias vezes — ver src/commands/router.js).
require('./src/commands/help')
require('./src/commands/ai')
require('./src/commands/price')
require('./src/commands/riven')
require('./src/commands/worldstate')
require('./src/commands/admin')

let globalSock = null

async function startBot() {
  try {
    await ensureArbyData()
    console.log('✅ Dados de Arbitragem/Incursões prontos.')
  } catch (e) {
    console.error('Aviso dados locais:', e.message)
  }

  const auth = await useMultiFileAuthState(env.AUTH_DIR)
  const sock = makeWASocket({ auth: auth.state, logger: pino({ level: 'silent' }) })
  globalSock = sock
  setGlobalSock(sock)
  sock.ev.on('creds.update', auth.saveCreds)

  sock.ev.on('connection.update', async (update) => {
    if (update.qr && !sock.authState.creds.registered) {
      const phoneNumber = env.BOT_PHONE
      const code = await sock.requestPairingCode(phoneNumber)
      console.log('\nCÓDIGO DE PAREAMENTO:', code, '\n')
    }

    if (update.connection === 'open') {
      console.log('✅ Bot conectado!')

      if (!global.wfmWsInit) {
        global.wfmWsInit = true
        initWfmSockets()
      }

      if (!global.alertInterval) {
        global.alertInterval = setInterval(() => {
          if (globalSock) {
            runAllChecks(globalSock).catch((e) => console.error('runAllChecks:', e.message))
          }
        }, env.CHECK_INTERVAL_MS)

        // Primeira passagem em 30s (sem steal, pra não sobrecarregar logo no boot)
        setTimeout(() => {
          if (!globalSock) return
          const { checkAlerts } = require('./src/services/wfm/priceAlerts')
          const { checkInvasionAlerts } = require('./src/services/worldstate/invasions')
          const { checkRivenAlerts } = require('./src/services/riven/alerts')
          checkAlerts(globalSock).catch(() => {})
          setTimeout(() => { if (globalSock) checkInvasionAlerts(globalSock).catch(() => {}) }, 2000)
          setTimeout(() => { if (globalSock) checkRivenAlerts(globalSock).catch(() => {}) }, 4000)
        }, 30000)

        // Steal detector: primeira passagem após 3 min
        setTimeout(() => {
          if (globalSock) {
            const { checkRivenSteals } = require('./src/services/riven/steal')
            checkRivenSteals(globalSock).catch((e) => console.error('steal first:', e.message))
          }
        }, 180000)
      }

      // Atualizador do Highest em segundo plano
      setTimeout(() => {
        runHighestUpdater().catch((e) => console.error('Highest updater:', e.message))
      }, 60000)
    }

    if (update.connection === 'close') {
      const code = update.lastDisconnect && update.lastDisconnect.error && update.lastDisconnect.error.output && update.lastDisconnect.error.output.statusCode
      if (code !== DisconnectReason.loggedOut) startBot()
    }
  })

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return
    let text = (msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '').trim()
    const from = msg.key.remoteJid
    if (msg.key.fromMe) return
    if (text.startsWith('/')) text = '!' + text.slice(1)

    const senderJid = getSenderJid(msg)
    const isAdm = isAdmin(msg)

    // mute por usuário
    if (!isAdm && isUserMuted(senderJid)) return

    // mute global
    if (adminState.botMuted && !isAdm && !msg.key.fromMe) return

    // bloqueio de comandos específicos (não-admin)
    if (!isAdm && text.charAt(0) === '!') {
      const cfgBlock = loadAdminConfig()
      const cmdName = text.slice(1).split(/\s+/)[0].toLowerCase()
      if ((cfgBlock.blockedCommands || []).indexOf(cmdName) !== -1) {
        await sock.sendMessage(from, { text: '❌ Comando desativado pelo admin.' })
        return
      }
    }

    // trava snipe riven se desligado
    if (!isAdm && /^!(alertariven|snipeweek|alertasriven|delalertariven)\b/i.test(text)) {
      if (!canUseRivenSnipe(senderJid, false)) {
        await sock.sendMessage(from, { text: '❌ Snipe de riven desativado pelo admin.' })
        return
      }
    }

    if (isAdm) adminState.commandsToday++

    // resposta citando notificação do WFM (admin, texto livre sem "!")
    if (isAdm && text.charAt(0) !== '!') {
      const wfmQuoted = msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo && msg.message.extendedTextMessage.contextInfo.quotedMessage
      if (wfmQuoted) {
        const wfmQText = wfmQuoted.conversation || (wfmQuoted.extendedTextMessage && wfmQuoted.extendedTextMessage.text) || ''
        const wfmChatIdMatch = wfmQText.match(/im\/chats\/([a-f0-9]{24})/i) || wfmQText.match(/chat_id:([a-f0-9]{24})/i)
        if (wfmChatIdMatch) {
          const wfmChatId = wfmChatIdMatch[1]
          await sock.sendMessage(from, { text: '⏳ Enviando resposta para o Warframe.market...' })
          const wfmSendResult = await sendToWfmMarket(wfmChatId, text)
          if (wfmSendResult.success) {
            await sock.sendMessage(from, { text: '✅ Resposta enviada ao comprador no Market!' })
          } else {
            await sock.sendMessage(from, { text: '❌ Erro ao enviar resposta: ' + wfmSendResult.error })
          }
          return
        }
        if (/Nova mensagem WFM/.test(wfmQText)) {
          await sock.sendMessage(from, { text: '⚠️ Não achei o chat_id nessa notificação. Cite a mensagem inteira do bot.' })
          return
        }
      }
    }

    if (!text.startsWith('!')) return // texto livre sem ser resposta de WFM: ignora

    const handled = await route(text, { sock, from, senderJid, isAdmin: isAdm, msg })
    // comando desconhecido: silêncio (comportamento igual ao original, que
    // simplesmente não tinha nenhum "else" no fim da cadeia de ifs)
    void handled
  })
}

startBot()
