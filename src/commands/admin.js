// src/commands/admin.js — painel administrativo completo (todos os comandos
// que exigem `isAdmin`). Cada registro usa `adminOnly: true`, que o router já
// intercepta e responde "❌ Só admin." automaticamente se necessário.
const { register } = require('./router')
const {
  isAdmin, getSenderJid, configHasUser, isVip, normalizeTargetJid,
  addToConfigList, removeFromConfigList, canUseRivenSnipe
} = require('../core/adminAuth')
const { loadAdminConfig, saveAdminConfig } = require('../core/adminConfig')
const { adminState, adminHelpText, adminStatusMessage, collectKnownJids } = require('../core/adminState')
const { loadRivenAlerts, saveRivenAlerts } = require('../services/riven/alerts')
const { loadAlerts, saveAlerts } = require('../services/wfm/priceAlerts')
const {
  wfmState, startWfmMonitor, stopWfmMonitor, wfmHelpText, setWfmStatus,
  rememberWfmDesiredStatus, stopWfmStatusRefresh, notifyWfmMessage, sendToWfmMarket
} = require('../services/wfm/statusChat')
const { runHighestUpdater } = require('../services/wfm/highest')
const { chatHistory } = require('../services/ai/groqClient')
const { jidToNumber } = require('../utils/text')

async function resolveLidFromNumber(sock, phone) {
  const num = String(phone || '').replace(/\D/g, '')
  if (!num) return null
  const tries = [num, num + '@s.whatsapp.net']
  if (!num.startsWith('55') && num.length <= 11) tries.push('55' + num)
  for (const t of tries) {
    try {
      const res = await sock.onWhatsApp(t)
      if (Array.isArray(res) && res.length && res[0]) {
        const r = res[0]
        if (r.exists === false) continue
        return { jid: r.jid || null, lid: r.lid || null, exists: r.exists !== false }
      }
    } catch (e) {}
  }
  return null
}

// ---------------------------------------------------------------- identidade
register(/^!meujid$/i, async ({ sock, from, msg }) => {
  const sender = getSenderJid(msg)
  await sock.sendMessage(from, {
    text: 'from: `' + from + '`\n' + 'sender: `' + sender + '`\n' + 'num: `' + jidToNumber(sender) + '`\n' + 'admin? *' + (isAdmin(msg) ? 'SIM' : 'NÃO') + '*'
  })
})

register(/^!lid\s+(\+?\d[\d\s\-()]+)$/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🔍 Consultando WhatsApp...' })
  try {
    const info = await resolveLidFromNumber(sock, match[1])
    if (!info) { await sock.sendMessage(from, { text: '❌ Não encontrei JID/LID para esse número.' }); return }
    await sock.sendMessage(from, {
      text: '📇 *Resultado*\nJID: `' + (info.jid || '—') + '`\nLID: `' + (info.lid || '—') + '`\nExists: *' + (info.exists ? 'sim' : 'não') + '*'
    })
  } catch (e) {
    await sock.sendMessage(from, { text: '❌ ' + e.message })
  }
}, { adminOnly: true })

// ---------------------------------------------------------------- painel/status
register(/^!(admin|admins|painel)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: adminHelpText() })
}, { adminOnly: true })

register(/^!(statusbot|botstatus)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: await adminStatusMessage() })
}, { adminOnly: true })

register(/^!stats$/i, async ({ sock, from }) => {
  const a = loadAlerts().alerts.length
  const r = loadRivenAlerts().alerts.length
  const jids = collectKnownJids()
  const cfgS = loadAdminConfig()
  await sock.sendMessage(from, {
    text: '📊 *Stats*\n' +
      'Usuários conhecidos: *' + jids.length + '*\n' +
      'Alertas preço: *' + a + '*\n' +
      'Alertas riven: *' + r + '*\n' +
      'IA ativas: *' + chatHistory.size + '*\n' +
      'Mutados: *' + cfgS.mutedUsers.length + '* | VIP: *' + cfgS.vipUsers.length + '*\n' +
      'Riven snipe: *' + (cfgS.rivenSnipeEnabled ? 'ON' : 'OFF') + '* (limite ' + cfgS.maxRivenAlerts + ')\n' +
      'Cmds sessão: *' + adminState.commandsToday + '*'
  })
}, { adminOnly: true })

register(/^!pause$/i, async ({ sock, from }) => {
  adminState.alertsPaused = true
  await sock.sendMessage(from, { text: '⏸ Checks de alerta *pausados*.' })
}, { adminOnly: true })

register(/^!resume$/i, async ({ sock, from }) => {
  adminState.alertsPaused = false
  await sock.sendMessage(from, { text: '▶️ Checks de alerta *reativados*.' })
}, { adminOnly: true })

register(/^!mute$/i, async ({ sock, from }) => {
  adminState.botMuted = true
  await sock.sendMessage(from, { text: '🔇 Bot *mutado* (só admin responde).' })
}, { adminOnly: true })

register(/^!unmute$/i, async ({ sock, from }) => {
  adminState.botMuted = false
  await sock.sendMessage(from, { text: '🔊 Bot *desmutado*.' })
}, { adminOnly: true })

// ---------------------------------------------------------------- WFM status & chat
register(/^!wfmhelp$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: wfmHelpText() })
}, { adminOnly: true })

register(/^!start$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: startWfmMonitor(from) })
}, { adminOnly: true })

register(/^!stop$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: stopWfmMonitor() })
}, { adminOnly: true })

register(/^!status$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, {
    text: '📊 *Status WFM*\n' +
      '• WFM WS (status): ' + (wfmState.wsConnected ? '✅' : '❌') + '\n' +
      '• WFM WS (chat): ' + (wfmState.chatWsConnected ? '✅' : '❌') + '\n' +
      '• Conta WFM: ' + (wfmState.ingameName || '(—)') + '\n' +
      '• Último status: ' + (wfmState.lastStatus || '(—)') + '\n' +
      '• Reaplicar status na reconexão: ' + (wfmState.desiredStatus ? '🔁 ON (' + wfmState.desiredStatus + ')' : '🔓 OFF') + '\n' +
      '• Escuta: ' + (wfmState.monitorActive ? '🟢 ATIVA' : '⚫ parada') + '\n' +
      '• Destino: ' + (wfmState.notifyJid || '(não definido — mande !start)') + '\n' +
      '• Msgs: ' + wfmState.messagesForwarded + '\n' +
      '• Última checagem: ' + (wfmState.lastCheck ? new Date(wfmState.lastCheck).toLocaleTimeString('pt-BR') : '—')
  })
}, { adminOnly: true })

register(/^!online$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await setWfmStatus('online') }) }, { adminOnly: true })
register(/^!ingame$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await setWfmStatus('ingame') }) }, { adminOnly: true })
register(/^!offline$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await setWfmStatus('invisible') }) }, { adminOnly: true })

register(/^!statusauto\s+(on|off)$/i, async ({ sock, from, match }) => {
  const wfmAutoArg = match[1].toLowerCase()
  if (wfmAutoArg === 'off') {
    stopWfmStatusRefresh()
    await sock.sendMessage(from, { text: '🔓 Controle automático *desligado*. Se o WS cair e reconectar, o bot não vai mais reaplicar status por cima — pode mudar manualmente no site/in-game sem o bot brigar.' })
  } else {
    if (!wfmState.lastStatus && !wfmState.desiredStatus) {
      await sock.sendMessage(from, { text: '⚠️ Nenhum status memorizado ainda. Use !online, !ingame ou !offline primeiro.' })
    } else {
      rememberWfmDesiredStatus(wfmState.desiredStatus || wfmState.lastStatus)
      await sock.sendMessage(from, { text: '🔁 Controle automático religado para *' + wfmState.desiredStatus + '*.' })
    }
  }
}, { adminOnly: true })

register(/^!ws$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🛰️ *Último frame WS:*\n```\n' + (wfmState.lastWsMessage ? wfmState.lastWsMessage.slice(0, 500) : '(nenhum)') + '\n```' })
}, { adminOnly: true })

register(/^!wfmtest$/i, async ({ sock, from }) => {
  if (!wfmState.notifyJid) wfmState.notifyJid = from
  await notifyWfmMessage({
    name: 'CyberRoot (teste)', reputation: 128, platform: 'pc', crossplay: true, status: 'online',
    text: 'Mensagem de teste do bot 🚀', timeIso: new Date().toISOString(), chatId: '0'.repeat(24)
  })
  await sock.sendMessage(from, { text: '✅ Teste enviado. (responder a ele vai falhar: chat_id fictício)' })
}, { adminOnly: true })

register(/^!wfmdebug$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, {
    text: '🔍 *Debug WFM*\n' +
      '• from: `' + from + '`\n' +
      '• notifyJid: `' + (wfmState.notifyJid || '(—)') + '`\n' +
      '• WS readyState: `' + (wfmState.ws ? wfmState.ws.readyState : 'null') + '`\n' +
      '• WS connected: ' + (wfmState.wsConnected ? 'on' : 'off') + '\n' +
      '• Chat WS readyState: `' + (wfmState.chatWs ? wfmState.chatWs.readyState : 'null') + '`\n' +
      '• Monitor: ' + (wfmState.monitorActive ? 'on' : 'off')
  })
}, { adminOnly: true })

// ---------------------------------------------------------------- mute/vip
register(/^!muteuser\s+(\S+)/i, async ({ sock, from, match }) => {
  const r1 = addToConfigList('mutedUsers', match[1].trim())
  await sock.sendMessage(from, { text: (r1.ok ? '🔇 ' : '❌ ') + r1.msg })
}, { adminOnly: true })

register(/^!unmuteuser\s+(\S+)/i, async ({ sock, from, match }) => {
  const r2 = removeFromConfigList('mutedUsers', match[1].trim())
  await sock.sendMessage(from, { text: (r2.ok ? '🔊 ' : '❌ ') + r2.msg })
}, { adminOnly: true })

register(/^!mutelist$/i, async ({ sock, from }) => {
  const mu = loadAdminConfig().mutedUsers
  await sock.sendMessage(from, {
    text: mu.length ? '🔇 *Mutados (' + mu.length + ')*\n' + mu.map((x, i) => (i + 1) + '. `' + x + '`').join('\n') : 'Ninguém mutado individualmente.'
  })
}, { adminOnly: true })

register(/^!vip\s+(\S+)/i, async ({ sock, from, match }) => {
  const rv = addToConfigList('vipUsers', match[1].trim())
  await sock.sendMessage(from, { text: (rv.ok ? '⭐ ' : '❌ ') + rv.msg })
}, { adminOnly: true })

register(/^!unvip\s+(\S+)/i, async ({ sock, from, match }) => {
  const ru = removeFromConfigList('vipUsers', match[1].trim())
  await sock.sendMessage(from, { text: (ru.ok ? '✅ ' : '❌ ') + ru.msg })
}, { adminOnly: true })

register(/^!viplist$/i, async ({ sock, from }) => {
  const vu = loadAdminConfig().vipUsers
  await sock.sendMessage(from, {
    text: vu.length ? '⭐ *VIPs (' + vu.length + ')*\n' + vu.map((x, i) => (i + 1) + '. `' + x + '`').join('\n') : 'Nenhum VIP.'
  })
}, { adminOnly: true })

// ---------------------------------------------------------------- riven sniper (config global)
register(/^!rivensnipe\s+(on|off|ligar|desligar|1|0)$/i, async ({ sock, from, match }) => {
  const cfgR = loadAdminConfig()
  const on = /^(on|ligar|1)$/i.test(match[1])
  cfgR.rivenSnipeEnabled = on
  saveAdminConfig(cfgR)
  await sock.sendMessage(from, { text: on ? '✅ Snipe de riven *ligado* para usuários.' : '🚫 Snipe de riven *desligado* para não-admins.' })
}, { adminOnly: true })

register(/^!rivenlimit\s+(\d+)$/i, async ({ sock, from, match }) => {
  const nLim = Math.max(1, Math.min(100, parseInt(match[1], 10)))
  const cfgL = loadAdminConfig()
  cfgL.maxRivenAlerts = nLim
  saveAdminConfig(cfgL)
  await sock.sendMessage(from, { text: '📏 Limite de snipes riven p/ usuário: *' + nLim + '*' })
}, { adminOnly: true })

register(/^!delrivenuser\s+(\S+)/i, async ({ sock, from, match }) => {
  const targetR = match[1].trim()
  const storeR = loadRivenAlerts()
  const beforeR = storeR.alerts.length
  storeR.alerts = storeR.alerts.filter((a) => !configHasUser([a.userJid], targetR))
  const remR = beforeR - storeR.alerts.length
  saveRivenAlerts(storeR)
  await sock.sendMessage(from, { text: remR ? '🗑️ Removidos *' + remR + '* snipes de `' + targetR + '`.' : 'Nada encontrado.' })
}, { adminOnly: true })

register(/^!delalertauser\s+(\S+)/i, async ({ sock, from, match }) => {
  const targetA = match[1].trim()
  const storeA = loadAlerts()
  const beforeA = storeA.alerts.length
  storeA.alerts = storeA.alerts.filter((a) => !configHasUser([a.userJid], targetA))
  const remA = beforeA - storeA.alerts.length
  saveAlerts(storeA)
  await sock.sendMessage(from, { text: remA ? '🗑️ Removidos *' + remA + '* alertas de `' + targetA + '`.' : 'Nada encontrado.' })
}, { adminOnly: true })

// ---------------------------------------------------------------- bloqueio de comandos
register(/^!blockcmd\s+(\w+)/i, async ({ sock, from, match }) => {
  const cfgB = loadAdminConfig()
  const c = match[1].toLowerCase()
  if (cfgB.blockedCommands.indexOf(c) === -1) cfgB.blockedCommands.push(c)
  saveAdminConfig(cfgB)
  await sock.sendMessage(from, { text: '🚫 Comando `!' + c + '` bloqueado p/ não-admins.' })
}, { adminOnly: true })

register(/^!unblockcmd\s+(\w+)/i, async ({ sock, from, match }) => {
  const cfgU = loadAdminConfig()
  const c2 = match[1].toLowerCase()
  cfgU.blockedCommands = (cfgU.blockedCommands || []).filter((x) => x !== c2)
  saveAdminConfig(cfgU)
  await sock.sendMessage(from, { text: '✅ Comando `!' + c2 + '` liberado.' })
}, { adminOnly: true })

register(/^!blocklist$/i, async ({ sock, from }) => {
  const bl = loadAdminConfig().blockedCommands || []
  await sock.sendMessage(from, { text: bl.length ? '🚫 Bloqueados: ' + bl.map((x) => '!' + x).join(', ') : 'Nenhum comando bloqueado.' })
}, { adminOnly: true })

// ---------------------------------------------------------------- moderação de mensagens
register(/^!(del|apagar|delete)$/i, async ({ sock, from, msg }) => {
  const ctx = msg.message && msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo
  const quotedId = ctx && ctx.stanzaId
  if (!quotedId) { await sock.sendMessage(from, { text: '❌ Responda a uma mensagem do *bot* com `!del`.' }); return }
  try {
    await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: true, id: quotedId, participant: (ctx && ctx.participant) || undefined } })
  } catch (e) {
    console.error('admin del:', e.message)
    await sock.sendMessage(from, { text: '❌ Falha ao apagar: ' + e.message })
  }
}, { adminOnly: true })

// ---------------------------------------------------------------- controle/checks
register(/^!forcacheck$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '⏳ Rodando checks...' })
  const { runAllChecks } = require('../jobs/scheduler')
  const wasPaused = adminState.alertsPaused
  adminState.alertsPaused = false
  try {
    await runAllChecks(sock)
    await sock.sendMessage(from, { text: '✅ Checks OK.' })
  } catch (e) {
    await sock.sendMessage(from, { text: '❌ ' + e.message })
  }
  adminState.alertsPaused = wasPaused
}, { adminOnly: true })

register(/^!highestnow$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🏆 Iniciando Highest updater...' })
  runHighestUpdater()
    .then(() => sock.sendMessage(from, { text: '✅ Highest updater terminou.' }).catch(() => {}))
    .catch((e) => sock.sendMessage(from, { text: '❌ Highest: ' + e.message }).catch(() => {}))
}, { adminOnly: true })

register(/^!limparhist(?:\s+(.+))?$/i, async ({ sock, from, match }) => {
  const target = match[1] ? normalizeTargetJid(match[1].trim()) : null
  if (target) {
    const had = chatHistory.has(target)
    chatHistory.delete(target)
    await sock.sendMessage(from, { text: had ? '🧹 Histórico IA de `' + target + '` limpo.' : 'Nada para limpar nesse JID.' })
  } else {
    const n = chatHistory.size
    chatHistory.clear()
    await sock.sendMessage(from, { text: '🧹 Histórico IA limpo (*' + n + '* conversas).' })
  }
}, { adminOnly: true })

// ---------------------------------------------------------------- listagens/wipe em massa
register(/^!alertasall$/i, async ({ sock, from }) => {
  const store = loadAlerts()
  if (!store.alerts.length) { await sock.sendMessage(from, { text: 'Nenhum alerta de preço.' }); return }
  const lines = store.alerts.slice(0, 40).map((a) => '#' + a.id + ' ' + (a.itemName || a.slug) + ' ' + a.operator + a.price + 'p → `' + a.userJid + '`')
  const more = store.alerts.length > 40 ? '\n_...+' + (store.alerts.length - 40) + '_' : ''
  await sock.sendMessage(from, { text: '🔔 *Alertas preço (' + store.alerts.length + ')*\n\n' + lines.join('\n') + more })
}, { adminOnly: true })

register(/^!rivenall$/i, async ({ sock, from }) => {
  const rs = loadRivenAlerts()
  if (!rs.alerts.length) { await sock.sendMessage(from, { text: 'Nenhum alerta riven.' }); return }
  const linesR = rs.alerts.slice(0, 40).map((a) => '#' + a.id + ' *' + a.weapon + '*' + (a.maxPrice != null ? ' ≤' + a.maxPrice + 'p' : '') + ' → `' + a.userJid + '`')
  const moreR = rs.alerts.length > 40 ? '\n_...+' + (rs.alerts.length - 40) + '_' : ''
  await sock.sendMessage(from, { text: '🔫 *Alertas riven (' + rs.alerts.length + ')*\n\n' + linesR.join('\n') + moreR })
}, { adminOnly: true })

register(/^!delalertaall$/i, async ({ sock, from }) => {
  const st = loadAlerts()
  const removed = st.alerts.length
  st.alerts = []
  saveAlerts(st)
  await sock.sendMessage(from, { text: '🗑️ Removidos *' + removed + '* alertas de preço.' })
}, { adminOnly: true })

register(/^!delrivenall$/i, async ({ sock, from }) => {
  const rst = loadRivenAlerts()
  const removedR = rst.alerts.length
  rst.alerts = []
  saveRivenAlerts(rst)
  await sock.sendMessage(from, { text: '🗑️ Removidos *' + removedR + '* alertas riven.' })
}, { adminOnly: true })

register(/^!users$/i, async ({ sock, from }) => {
  const list = collectKnownJids()
  if (!list.length) { await sock.sendMessage(from, { text: 'Nenhum JID conhecido.' }); return }
  const chunk = list.slice(0, 50).map((j, i) => (i + 1) + '. `' + j + '`').join('\n')
  const extra = list.length > 50 ? '\n_...+' + (list.length - 50) + '_' : ''
  await sock.sendMessage(from, { text: '👥 *Usuários (' + list.length + ')*\n\n' + chunk + extra })
}, { adminOnly: true })

// ---------------------------------------------------------------- mensageria em massa
register(/^!say\s+(.+)/is, async ({ sock, from, match }) => {
  const rest = match[1].trim()
  const parts = rest.split(/\s+/)
  const maybeJid = normalizeTargetJid(parts[0])
  let dest, body
  if (maybeJid && parts.length >= 2) { dest = maybeJid; body = parts.slice(1).join(' ') }
  else { dest = from; body = rest }
  if (!body) { await sock.sendMessage(from, { text: '❌ Uso: `!say <texto>` ou `!say <numero> <texto>`' }); return }
  try {
    await sock.sendMessage(dest, { text: body })
    if (dest !== from) await sock.sendMessage(from, { text: '✅ Enviado para `' + dest + '`.' })
  } catch (e) {
    await sock.sendMessage(from, { text: '❌ ' + e.message })
  }
}, { adminOnly: true })

register(/^!bc\s+(.+)/is, async ({ sock, from, match }) => {
  const bodyBc = match[1].trim()
  const targets = collectKnownJids().filter((j) => j.indexOf('@g.us') === -1)
  if (!targets.length) { await sock.sendMessage(from, { text: 'Nenhum destinatário.' }); return }
  await sock.sendMessage(from, { text: '📢 Enviando para *' + targets.length + '* usuários...' })
  let ok = 0, fail = 0
  for (const t of targets) {
    try { await sock.sendMessage(t, { text: bodyBc }); ok++ } catch (e) { fail++ }
    await new Promise((r) => setTimeout(r, 400))
  }
  await sock.sendMessage(from, { text: '📢 BC finalizado: *' + ok + '* ok, *' + fail + '* falha.' })
}, { adminOnly: true })

// ---------------------------------------------------------------- eval (⚠️ ver README-MODULARIZACAO.md)
register(/^!eval\s+([\s\S]+)/i, async ({ sock, from, match }) => {
  try {
    // eslint-disable-next-line no-eval
    const result = await Promise.resolve(eval(match[1]))
    let out = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    if (out == null) out = String(result)
    await sock.sendMessage(from, { text: '```\n' + String(out).slice(0, 3000) + '\n```' })
  } catch (e) {
    await sock.sendMessage(from, { text: '❌ Eval: ' + e.message })
  }
}, { adminOnly: true })

module.exports = { resolveLidFromNumber, sendToWfmMarket }
