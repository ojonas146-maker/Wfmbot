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
    '🔐 *PAINEL ADMIN*\n' +
    '_`<obrigatório>` · `[opcional]`_\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🪪 *IDENTIDADE*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '• `!meujid` — mostra seu JID/LID atual\n' +
    '• `!lid <numero>` — tenta achar o JID/LID de um número\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🔇 *MUTE*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '• `!mute` / `!unmute` — muta/desmuta o bot pra TODO MUNDO (menos admin)\n' +
    '• `!muteuser <num|jid>` / `!unmuteuser <num|jid>` — muta só 1 pessoa\n' +
    '• `!mutelist` — lista quem está mutado\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🔫 *RIVEN SNIPER*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '• `!rivensnipe on|off` — liga/desliga o sniper pra não-admin\n' +
    '• `!rivenlimit <n>` — quantos alertas de riven cada um pode ter (padrão 10)\n' +
    '• `!vip <num|jid>` / `!unvip <num|jid>` / `!viplist` — VIP tem limite maior\n' +
    '• `!rivenall` — lista alertas de riven de todo mundo\n' +
    '• `!delrivenall` / `!delrivenuser <num|jid>` — apaga alertas de riven\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🔔 *ALERTAS DE PREÇO*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '• `!alertasall` — lista alertas de preço de todo mundo\n' +
    '• `!delalertaall` / `!delalertauser <num|jid>` — apaga alertas de preço\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🛒 *WFM (MARKET)*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '• `!wfmhelp` — comandos de status/chat do Market (`!online`, `!start`...)\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '⚙️ *CONTROLE GERAL*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '• `!pause` / `!resume` — pausa/retoma os checks automáticos\n' +
    '• `!forcacheck` — roda uma checagem de alertas na hora\n' +
    '• `!highestnow` — atualiza o ranking Highest agora (respeita cache)\n' +
    '• `!highestwipe` — apaga o cache do Highest e recatalonga do zero\n' +
    '• `!statusbot` — status técnico (uptime, RAM, contadores)\n' +
    '• `!stats` / `!users` — estatísticas de uso\n' +
    '• `!say [destino] <texto>` — manda uma mensagem como o bot\n' +
    '• `!bc <texto>` — broadcast pra todo mundo conhecido\n' +
    '• `!blockcmd <nome>` / `!unblockcmd <nome>` — bloqueia comando p/ não-admin\n' +
    '• `!blocklist` — lista comandos bloqueados\n' +
    '• `!limparhist [jid]` — limpa histórico de IA (de 1 pessoa ou geral)\n' +
    '• `!eval <js>` — roda código JS na hora ⚠️ (cuidado)\n' +
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
