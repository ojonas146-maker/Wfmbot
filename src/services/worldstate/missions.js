// src/services/worldstate/missions.js
// Sortie, Archon Hunt, Archimedea, Eventos, Nightwave.
const { fetchWS } = require('./fetchWS')
const { formatTimeLeft } = require('../../utils/time')

async function getSortie() {
  try {
    const s = await fetchWS('sortie')
    if (!s) return '❌ Sortie indisponível.'
    const left = s.expiry ? formatTimeLeft(new Date(s.expiry).getTime() - Date.now()) : '?'
    let reply = '🎯 *Sortie*\n'
    reply += 'Boss: *' + (s.boss || '?') + '* | ' + (s.faction || '') + '\n'
    reply += '⏳ ' + left + '\n\n'
    const variants = s.variants || []
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]
      reply += (i + 1) + '. *' + (v.missionType || '?') + '*\n'
      reply += '   ' + (v.node || '?') + '\n'
      reply += '   ⚠️ ' + (v.modifier || '—') + '\n'
    }
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar sortie.'
  }
}

async function getArchon() {
  try {
    const s = await fetchWS('archonHunt')
    if (!s) return '❌ Archon Hunt indisponível.'
    const left = s.expiry ? formatTimeLeft(new Date(s.expiry).getTime() - Date.now()) : '?'
    let reply = '👑 *Archon Hunt*\n'
    reply += 'Boss: *' + (s.boss || '?') + '* | ' + (s.faction || '') + '\n'
    reply += '⏳ ' + left + '\n\n'
    const missions = s.missions || []
    for (let i = 0; i < missions.length; i++) {
      const m = missions[i]
      reply += (i + 1) + '. *' + (m.type || m.typeKey || '?') + '*\n'
      reply += '   ' + (m.node || '?') + '\n'
    }
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar Archon Hunt.'
  }
}

async function getArchimedea() {
  try {
    const list = await fetchWS('archimedeas')
    if (!list || !list.length) return '❌ Nenhuma Archimedea ativa.'
    let reply = '🧪 *Archimedea*\n\n'
    for (const a of list) {
      const left = a.expiry ? formatTimeLeft(new Date(a.expiry).getTime() - Date.now()) : '?'
      const tipo = (a.typeKey || a.type || 'Archimedea').replace(/_/g, ' ')
      reply += '*' + tipo + '*\n⏳ ' + left + '\n'
      const missions = a.missions || []
      for (let j = 0; j < missions.length; j++) {
        const m = missions[j]
        reply += (j + 1) + '. *' + (m.missionType || '?') + '* (' + (m.faction || '') + ')\n'
        if (m.deviation && m.deviation.name) reply += '   📌 ' + m.deviation.name + '\n'
        const risks = m.risks || []
        for (const r of risks) reply += '   ⚠️ ' + (r.name || r.key || '') + (r.isHard ? ' (Hard)' : '') + '\n'
      }
      reply += '\n'
    }
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar Archimedea.'
  }
}

async function getEvents() {
  try {
    const list = await fetchWS('events')
    if (!list || !list.length) return '📅 Nenhum evento especial ativo no momento.'
    let reply = '📅 *Eventos ativos*\n\n'
    let shown = 0
    for (const e of list) {
      const exp = e.expiry ? new Date(e.expiry).getTime() : 0
      if (exp && exp < Date.now()) continue
      const left = exp ? formatTimeLeft(exp - Date.now()) : '?'
      reply += '• *' + (e.description || e.tag || 'Evento') + '*\n'
      if (e.node) reply += '  📍 ' + e.node + '\n'
      if (e.faction) reply += '  🏷️ ' + e.faction + '\n'
      reply += '  ⏳ ' + left + '\n\n'
      shown++
      if (shown >= 10) break
    }
    if (!shown) return '📅 Nenhum evento especial ativo no momento.'
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar eventos.'
  }
}

async function getNightwave() {
  try {
    const nw = await fetchWS('nightwave')
    if (!nw) return '❌ Nightwave indisponível.'
    const left = nw.expiry ? formatTimeLeft(new Date(nw.expiry).getTime() - Date.now()) : '?'
    let reply = '📡 *Nightwave*\n'
    reply += 'Season: *' + (nw.season != null ? nw.season : '?') + '* | Phase: ' + (nw.phase != null ? nw.phase : '?') + '\n'
    reply += '⏳ Season: ' + left + '\n\n*Desafios ativos:*\n'
    const ch = nw.activeChallenges || []
    if (!ch.length) reply += '_Nenhum listado._'
    for (const c of ch) {
      const tag = c.isDaily ? '📅' : (c.isElite ? '💀' : '⭐')
      const cLeft = c.expiry ? formatTimeLeft(new Date(c.expiry).getTime() - Date.now()) : ''
      reply += tag + ' *' + (c.title || 'Desafio') + '*\n'
      reply += '   ' + (c.desc || '') + '\n'
      reply += '   🏅 ' + (c.reputation || '?') + ' rep'
      if (cLeft) reply += ' | ⏳ ' + cLeft
      reply += '\n'
    }
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar Nightwave.'
  }
}

module.exports = { getSortie, getArchon, getArchimedea, getEvents, getNightwave }
