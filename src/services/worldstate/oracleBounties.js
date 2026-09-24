// src/services/worldstate/oracleBounties.js
// Bounties do Zariman, Sanctum (Deimos/Lab) e Hex/1999, via oracle.browse.wf.
const axios = require('axios')
const { formatTimeLeft } = require('../../utils/time')
const { ensureArbyData, resolveNodeName } = require('./arbitration')

function shortPath(p) {
  if (!p) return '?'
  const parts = String(p).split('/')
  return parts[parts.length - 1]
    .replace(/Challenge$/i, '')
    .replace(/Bounty/gi, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
}

async function formatOracleCycle(kind) {
  try {
    const res = await axios.get('https://oracle.browse.wf/bounty-cycle', { timeout: 15000 })
    const data = res.data
    const left = data.expiry ? formatTimeLeft(data.expiry - Date.now()) : '?'
    const bounties = data.bounties || {}

    if (kind === 'zariman') {
      const list = bounties.ZarimanSyndicate || []
      let reply = '🌌 *Zariman — Ciclo de Bounties*\n'
      reply += 'Facção: *' + ((data.zarimanFaction || '').replace('FC_', '') || '?') + '*\n'
      reply += 'Rot: ' + (data.rot || '?') + ' | Vault: ' + (data.vaultRot || '?') + '\n'
      reply += '⏳ ' + left + '\n\n'
      await ensureArbyData()
      list.forEach((b, i) => {
        reply += (i + 1) + '. *' + shortPath(b.challenge) + '*\n   📍 ' + resolveNodeName(b.node, true) + '\n'
      })
      return reply.trim()
    }

    if (kind === 'lab') {
      const list = bounties.EntratiLabSyndicate || []
      let reply = '🧪 *Sanctum / Lab — Bounties*\n⏳ ' + left + '\n\n'
      await ensureArbyData()
      list.forEach((b, i) => {
        reply += (i + 1) + '. *' + shortPath(b.challenge) + '*\n   📍 ' + resolveNodeName(b.node, true) + '\n'
      })
      return reply.trim()
    }

    if (kind === 'hex') {
      const list = bounties.HexSyndicate || []
      let reply = '🏙️ *Hex / 1999 — Bounties*\n⏳ ' + left + '\n\n'
      await ensureArbyData()
      list.forEach((b, i) => {
        const ally = b.ally ? shortPath(b.ally).replace(/AllyAgent$/i, '').trim() : null
        reply += (i + 1) + '. *' + shortPath(b.challenge) + '*\n'
        reply += '   📍 ' + resolveNodeName(b.node, true)
        if (ally) reply += ' | Ally: *' + ally + '*'
        reply += '\n'
      })
      return reply.trim()
    }

    return '❌ Tipo inválido.'
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar bounties (Oracle).'
  }
}

async function formatLocationBounty(place) {
  try {
    const res = await axios.get('https://api.warframestat.us/pc/syndicateMissions', { timeout: 15000 })
    const data = Array.isArray(res.data) ? res.data : []

    const map = {
      cetus: { key: 'Ostrons', title: '🌿 Cetus / Ostron' },
      fortuna: { key: 'Solaris United', title: '❄️ Fortuna / Solaris' },
      deimos: { key: 'Entrati', title: '☣️ Deimos / Entrati' }
    }
    const cfg = map[place]
    if (!cfg) return '❌ Use: !bounty cetus | fortuna | deimos'

    const block = data.find((s) => s.syndicate === cfg.key)
    if (!block || !block.jobs || !block.jobs.length) return '❌ Sem bounties ativas para ' + place + ' no momento.'

    const left = block.expiry ? formatTimeLeft(new Date(block.expiry).getTime() - Date.now()) : '?'
    let reply = cfg.title + '\n⏳ Ciclo: ' + left + '\n\n'

    for (let i = 0; i < block.jobs.length; i++) {
      const j = block.jobs[i]
      const name = j.type || 'Bounty'
      const levels = Array.isArray(j.enemyLevels) ? j.enemyLevels.join('–') : '?'
      reply += (i + 1) + '. *' + name + '*\n'
      reply += '   📍 Nível ' + levels + '\n'
    }

    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar bounties de paisagem.'
  }
}

module.exports = { shortPath, formatOracleCycle, formatLocationBounty }
