// src/core/adminState.js
// Estado global do painel admin + funções de status/help.
// Usa `require` tardio (dentro das funções) pra evitar dependência circular
// com os módulos de alertas/riven/wfm, que por sua vez podem precisar de admin.
const { formatUptime } = require('../utils/time')
const { loadAdminConfig } = require('./adminConfig')

const adminState = {
  alertsPaused: false,
  botMuted: false,
  lastCheckAt: null,
  lastCheckError: null,
  commandsToday: 0,
  startedAt: Date.now()
}

function adminHelpText() {
  return (
    '🔐 *PAINEL ADMIN*\n\n' +
    '*Identidade*\n' +
    '• `!meujid` — seu JID/LID\n' +
    '• `!lid <numero>` — tenta achar JID/LID pelo número\n\n' +
    '*Mute*\n' +
    '• `!mute` / `!unmute` — mute GLOBAL (não-admins)\n' +
    '• `!muteuser <num|jid>` — silencia 1 pessoa\n' +
    '• `!unmuteuser <num|jid>`\n' +
    '• `!mutelist`\n\n' +
    '*Riven sniper*\n' +
    '• `!rivensnipe on|off` — liga/desliga p/ não-admin\n' +
    '• `!rivenlimit <n>` — limite p/ usuários (padrão 10)\n' +
    '• `!vip <num|jid>` / `!unvip <num|jid>` / `!viplist`\n' +
    '• `!rivenall` / `!delrivenall`\n' +
    '• `!delrivenuser <num|jid>`\n\n' +
    '*Alertas preço*\n' +
    '• `!alertasall` / `!delalertaall`\n' +
    '• `!delalertauser <num|jid>`\n\n' +
    '*WFM (Market)*\n' +
    '• `!wfmhelp` — comandos de status/chat do Market\n\n' +
    '*Controle*\n' +
    '• `!pause` / `!resume`\n' +
    '• `!forcacheck` / `!highestnow`\n' +
    '• `!statusbot` / `!stats` / `!users`\n' +
    '• `!say [destino] <texto>` / `!bc <texto>`\n' +
    '• `!blockcmd <nome>` / `!unblockcmd <nome>` / `!blocklist`\n' +
    '• `!limparhist` [jid]\n' +
    '• `!eval <js>`\n' +
    '• `!admin` — este menu'
  )
}

async function adminStatusMessage() {
  const { loadAlerts } = require('../services/wfm/priceAlerts')
  const { loadRivenAlerts } = require('../services/riven/alerts')
  const { loadInvasionAlerts } = require('../services/worldstate/invasions')
  const { chatHistory } = require('../services/ai/groqClient')

  const mem = process.memoryUsage()
  const rss = (mem.rss / 1024 / 1024).toFixed(1)
  const heap = (mem.heapUsed / 1024 / 1024).toFixed(1)
  const alerts = loadAlerts()
  const rivens = loadRivenAlerts()
  const cfg = loadAdminConfig()
  let inv = { alerts: [] }
  try { inv = loadInvasionAlerts() } catch (e) {}

  let reply = '🤖 *STATUS DO BOT*\n\n'
  reply += '⏱ Uptime: *' + formatUptime(Date.now() - adminState.startedAt) + '*\n'
  reply += '🧠 RAM: *' + rss + ' MB* (heap ' + heap + ' MB)\n'
  reply += '💬 Históricos IA: *' + chatHistory.size + '*\n'
  reply += '🔔 Alertas preço: *' + alerts.alerts.length + '*\n'
  reply += '🔫 Alertas riven: *' + rivens.alerts.length + '*\n'
  if (inv && inv.alerts) reply += '⚔️ Alertas invasão: *' + inv.alerts.length + '*\n'
  reply += '📊 Cmds (sessão): *' + adminState.commandsToday + '*\n\n'
  reply += '⏸ Checks: *' + (adminState.alertsPaused ? 'PAUSADOS' : 'ativos') + '*\n'
  reply += '🔇 Mute global: *' + (adminState.botMuted ? 'SIM' : 'não') + '*\n'
  reply += '🚫 Mutados: *' + cfg.mutedUsers.length + '*\n'
  reply += '⭐ VIPs: *' + cfg.vipUsers.length + '*\n'
  reply += '🔫 Riven snipe (não-admin): *' + (cfg.rivenSnipeEnabled ? 'ON' : 'OFF') + '*\n'
  reply += '📏 Limite riven: *' + cfg.maxRivenAlerts + '* (VIP ' + cfg.maxRivenAlertsVip + ')\n'
  if (adminState.lastCheckAt) {
    reply += '🕐 Último check: *' + new Date(adminState.lastCheckAt).toLocaleString('pt-BR') + '*\n'
  }
  if (adminState.lastCheckError) {
    reply += '⚠️ Último erro: ' + String(adminState.lastCheckError).slice(0, 120) + '\n'
  }
  return reply.trim()
}

function collectKnownJids() {
  const { loadAlerts } = require('../services/wfm/priceAlerts')
  const { loadRivenAlerts } = require('../services/riven/alerts')
  const { loadInvasionAlerts } = require('../services/worldstate/invasions')
  const { chatHistory } = require('../services/ai/groqClient')

  const set = {}
  try { loadAlerts().alerts.forEach((a) => { if (a.userJid) set[a.userJid] = true }) } catch (e) {}
  try { loadRivenAlerts().alerts.forEach((a) => { if (a.userJid) set[a.userJid] = true }) } catch (e) {}
  try { loadInvasionAlerts().alerts.forEach((a) => { if (a.userJid) set[a.userJid] = true }) } catch (e) {}
  chatHistory.forEach((_v, k) => { set[k] = true })
  return Object.keys(set)
}

module.exports = { adminState, adminHelpText, adminStatusMessage, collectKnownJids }
