// src/services/worldstate/invasions.js
const fs = require('fs')
const axios = require('axios')
const { INVASION_ALERTS_FILE, INVASIONS_URL } = require('../../config/env')
const { formatTimeLeft } = require('../../utils/time')

function loadInvasionAlerts() {
  try {
    if (!fs.existsSync(INVASION_ALERTS_FILE)) return { nextId: 1, alerts: [] }
    return JSON.parse(fs.readFileSync(INVASION_ALERTS_FILE, 'utf8'))
  } catch (e) {
    return { nextId: 1, alerts: [] }
  }
}
function saveInvasionAlerts(data) {
  fs.writeFileSync(INVASION_ALERTS_FILE, JSON.stringify(data, null, 2))
}

function normalizeInvasionReward(text) {
  const value = String(text || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const rewards = {
    catalyst: { key: 'orokin catalyst', name: 'Orokin Catalyst' },
    'orokin catalyst': { key: 'orokin catalyst', name: 'Orokin Catalyst' },
    reactor: { key: 'orokin reactor', name: 'Orokin Reactor' },
    'orokin reactor': { key: 'orokin reactor', name: 'Orokin Reactor' },
    forma: { key: 'forma', name: 'Forma' },
    fieldron: { key: 'fieldron', name: 'Fieldron' },
    detonite: { key: 'detonite', name: 'Detonite Injector' },
    'detonite injector': { key: 'detonite', name: 'Detonite Injector' },
    mutagen: { key: 'mutagen', name: 'Mutagen Mass' },
    'mutagen mass': { key: 'mutagen', name: 'Mutagen Mass' },
    mutalist: { key: 'mutalist', name: 'Mutalist Alad V Nav Coordinate' },
    'nav coordinate': { key: 'mutalist', name: 'Mutalist Alad V Nav Coordinate' }
  }
  return rewards[value] || null
}

function makeProgressBar(percent) {
  const total = 10
  let filled = Math.round((percent / 100) * total)
  if (filled < 0) filled = 0
  if (filled > total) filled = total
  return '█'.repeat(filled) + '░'.repeat(total - filled)
}

function formatRewardSide(side) {
  if (!side || !side.reward) return []
  const reward = side.reward
  const out = []
  for (const it of reward.countedItems || []) {
    const name = it.type || it.key || 'Item'
    const count = it.count != null ? it.count : 1
    out.push(count > 1 ? name + ' x' + count : name)
  }
  for (const it of reward.items || []) if (it) out.push(String(it))
  if (reward.credits) out.push(Number(reward.credits).toLocaleString('pt-BR') + ' credits')
  return out
}

function getAllInvasionRewardNames(inv) {
  const names = []
  for (const n of formatRewardSide(inv.attacker)) names.push(n)
  for (const n of formatRewardSide(inv.defender)) names.push(n)
  for (const t of inv.rewardTypes || []) names.push(String(t))
  return names
}

function formatInvasion(inv) {
  const attacker = (inv.attacker && (inv.attacker.faction || inv.attacker.factionKey)) || 'Atacante'
  const defender = (inv.defender && (inv.defender.faction || inv.defender.factionKey)) || 'Defensor'
  const node = inv.node || inv.nodeKey || 'Local desconhecido'

  let reply = '⚔️ *INVASÃO ATIVA*\n\n' + '🔴 *' + attacker + '* vs *' + defender + '*\n' + '📍 ' + node + '\n'

  const completion = inv.completion != null ? Number(inv.completion) : null
  const count = inv.count != null ? Number(inv.count) : null
  const goal = inv.requiredRuns != null ? Number(inv.requiredRuns) : null

  if (completion != null && !isNaN(completion)) {
    const pct = Math.max(0, Math.min(100, Math.round(completion)))
    reply += '📊 ' + pct + '%\n' + makeProgressBar(pct) + '\n'
  } else if (count != null && goal != null && goal > 0) {
    const pct2 = Math.max(0, Math.min(100, Math.round((Math.abs(count) / goal) * 100)))
    reply += '📊 ' + Math.abs(count).toLocaleString('pt-BR') + ' / ' + goal.toLocaleString('pt-BR') + '\n' + makeProgressBar(pct2) + ' ' + pct2 + '%\n'
  }

  const attRewards = formatRewardSide(inv.attacker)
  const defRewards = formatRewardSide(inv.defender)

  if (attRewards.length) {
    reply += '\n🎁 *' + attacker + ':*\n'
    for (const r of attRewards) reply += '• ' + r + '\n'
  }
  if (defRewards.length) {
    reply += '\n🎁 *' + defender + ':*\n'
    for (const r of defRewards) reply += '• ' + r + '\n'
  }
  if (!attRewards.length && !defRewards.length) reply += '\n_Sem recompensa listada (ex.: lado Infestado)._\n'

  return reply.trim()
}

async function getActiveInvasions() {
  const urls = [INVASIONS_URL, 'https://api.warframestat.us/pc/invasions?language=en']
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const u of urls) {
      try {
        const res = await axios.get(u, { timeout: 25000, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } })
        const list = Array.isArray(res.data) ? res.data : []
        return {
          ok: true,
          list: list.filter((inv) => {
            if (!inv) return false
            if (inv.completed === true) return false
            if (inv.completion != null && Number(inv.completion) >= 100) return false
            return true
          })
        }
      } catch (e) {
        lastErr = e
        console.error('Erro ao buscar invasões (' + u + '):', e.message)
      }
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200))
  }
  return { ok: false, list: [], error: lastErr ? lastErr.message : 'API indisponível' }
}

async function getInvasionsMessage() {
  const result = await getActiveInvasions()
  if (!result.ok) return '❌ Erro ao buscar invasões. (API lenta/offline — tente de novo)\n_' + String(result.error || '').slice(0, 80) + '_'
  const invasions = result.list
  if (!invasions.length) return '⚔️ *INVASÕES ATIVAS*\n\nNenhuma invasão ativa no momento.'

  let reply = '⚔️ *INVASÕES ATIVAS*\n\n'
  for (const inv of invasions) reply += formatInvasion(inv) + '\n\n────────────\n\n'
  return reply.trim()
}

function getInvasionId(inv) {
  return inv.id || inv._id || (String(inv.node || '') + '|' + String(inv.activation || ''))
}

function invasionContainsReward(inv, rewardKey) {
  const key = String(rewardKey || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const names = getAllInvasionRewardNames(inv)
  for (const n0 of names) {
    const n = String(n0).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (n.indexOf(key) !== -1) return true
  }
  return false
}

function toggleInvasionAlert(userJid, rawReward) {
  const reward = normalizeInvasionReward(rawReward)
  if (!reward) {
    return '❌ Recompensa não reconhecida.\n\nUse:\n• catalyst\n• reactor\n• forma\n• fieldron\n• detonite\n• mutagen\n• mutalist'
  }

  const store = loadInvasionAlerts()
  const existingIndex = store.alerts.findIndex((a) => a.userJid === userJid && a.rewardKey === reward.key)

  if (existingIndex !== -1) {
    store.alerts.splice(existingIndex, 1)
    saveInvasionAlerts(store)
    return '🔕 *ALERTA DESATIVADO*\n\n🎁 ' + reward.name
  }

  const id = store.nextId++
  store.alerts.push({ id, userJid, rewardKey: reward.key, rewardName: reward.name, createdAt: new Date().toISOString(), notified: [] })
  saveInvasionAlerts(store)

  return '🔔 *ALERTA ATIVADO*\n\n🎁 *' + reward.name + '*\n\nO bot avisará quando esse item aparecer em uma invasão ativa.'
}

function listInvasionAlerts(userJid) {
  const store = loadInvasionAlerts()
  const mine = store.alerts.filter((a) => a.userJid === userJid)
  if (!mine.length) return '🔔 *ALERTAS DE INVASÃO*\n\nNenhum alerta ativo.\n\nAtive com:\n!alertainvasao catalyst'
  let reply = '🔔 *SEUS ALERTAS DE INVASÃO*\n\n'
  for (const a of mine) reply += '🟢 #' + a.id + ' *' + a.rewardName + '*\n'
  return reply.trim()
}

function deleteInvasionAlert(userJid, arg) {
  const store = loadInvasionAlerts()
  if (/^all$/i.test(arg)) {
    const before = store.alerts.length
    store.alerts = store.alerts.filter((a) => a.userJid !== userJid)
    const removed = before - store.alerts.length
    saveInvasionAlerts(store)
    return removed ? '🔕 ' + removed + ' alerta(s) de invasão removido(s).' : 'Você não tinha alertas de invasão.'
  }
  const id = parseInt(arg, 10)
  if (!id) return '❌ Use: !delalertainvasao 1  ou  !delalertainvasao all'
  const index = store.alerts.findIndex((a) => a.id === id && a.userJid === userJid)
  if (index === -1) return '❌ Alerta de invasão #' + id + ' não encontrado.'
  store.alerts.splice(index, 1)
  saveInvasionAlerts(store)
  return '🔕 Alerta de invasão *#' + id + '* removido.'
}

async function checkInvasionAlerts(sock) {
  const store = loadInvasionAlerts()
  if (!store.alerts.length) return

  const invResult = await getActiveInvasions()
  const invasions = (invResult && invResult.list) ? invResult.list : []
  if (!invasions.length) return

  let changed = false
  for (const alert of store.alerts) {
    if (!Array.isArray(alert.notified)) alert.notified = []
    for (const inv of invasions) {
      if (!invasionContainsReward(inv, alert.rewardKey)) continue
      const invasionId = getInvasionId(inv)
      if (alert.notified.indexOf(invasionId) !== -1) continue

      const msg = '🚨 *ALERTA DE INVASÃO*\n\n🎁 *' + alert.rewardName + '*\n\n' + formatInvasion(inv)
      try {
        await sock.sendMessage(alert.userJid, { text: msg })
        alert.notified.push(invasionId)
        if (alert.notified.length > 20) alert.notified = alert.notified.slice(-20)
        changed = true
      } catch (e) {
        console.error('Erro ao enviar alerta de invasão:', e.message)
      }
    }
  }
  if (changed) saveInvasionAlerts(store)
}

module.exports = {
  loadInvasionAlerts, saveInvasionAlerts, normalizeInvasionReward, makeProgressBar,
  formatRewardSide, getAllInvasionRewardNames, formatInvasion, getActiveInvasions,
  getInvasionsMessage, getInvasionId, invasionContainsReward, toggleInvasionAlert,
  listInvasionAlerts, deleteInvasionAlert, checkInvasionAlerts
}
