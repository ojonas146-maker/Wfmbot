// src/services/farming/farmRouteOptimizer.js
// farm_route_optimizer — portado do warframe-mcp (mpeciakk/warframe-mcp,
// tools/farmOptimizer.ts). O projeto original usa uma tabela estática própria
// de recursos por planeta + bônus de dark sector; aqui usamos a tabela de
// drops AO VIVO do warframestat.us (mesma fonte do !drops), que tem a
// vantagem de já vir com % de chance atualizada e nunca fica desatualizada
// com hotfixes de drop rate.
const axios = require('axios')

async function getDropPlaces(resource) {
  try {
    const url = 'https://api.warframestat.us/drops/search/' + encodeURIComponent(resource)
    const res = await axios.get(url, { timeout: 20000 })
    const data = Array.isArray(res.data) ? res.data : []
    const q = resource.trim().toLowerCase()
    // Só interessa drop de missão/inimigo pra farm de recurso — relíquia é outro fluxo (!relic).
    return data.filter((d) => String(d.item || '').toLowerCase().indexOf(q) !== -1 && !/relic/i.test(d.place || ''))
  } catch (e) {
    return []
  }
}

async function farmRouteOptimizer(resources, opts) {
  opts = opts || {}
  const list = (Array.isArray(resources) ? resources : String(resources || '').split(','))
    .map((r) => String(r || '').trim())
    .filter(Boolean)

  if (!list.length) return '❌ Informe ao menos um recurso. Ex: `!farm plastids, orokin cells, polymer bundle`'

  const byResource = {}
  for (const r of list) byResource[r] = await getDropPlaces(r)

  // Agrupa por node (place), contando quantos dos recursos pedidos aparecem lá — overlap score.
  const nodeScore = {}
  for (const r of list) {
    for (const d of byResource[r]) {
      const place = d.place || '?'
      if (!nodeScore[place]) nodeScore[place] = { place, resources: {}, count: 0 }
      if (nodeScore[place].resources[r] === undefined) {
        nodeScore[place].resources[r] = d.chance != null ? d.chance : null
        nodeScore[place].count++
      }
    }
  }

  let nodes = Object.values(nodeScore)
  if (opts.preferMissionType) {
    const pref = String(opts.preferMissionType).toLowerCase()
    // prioriza (não filtra fora) nodes cujo nome sugere o tipo de missão preferido
    nodes = nodes.slice().sort((a, b) => {
      const aMatch = a.place.toLowerCase().indexOf(pref) !== -1 ? 1 : 0
      const bMatch = b.place.toLowerCase().indexOf(pref) !== -1 ? 1 : 0
      if (aMatch !== bMatch) return bMatch - aMatch
      return b.count - a.count
    })
  } else {
    nodes = nodes.slice().sort((a, b) => b.count - a.count)
  }

  const overlap = nodes.filter((n) => n.count >= 2)

  let reply = '🗺️ *Farm Route Optimizer*\n_Recursos: ' + list.join(', ') + '_\n\n'

  if (overlap.length) {
    reply += '🎯 *Nodes com overlap (2+ recursos no mesmo lugar):*\n'
    for (const n of overlap.slice(0, 10)) {
      reply += '• *' + n.place + '* (' + n.count + '/' + list.length + ' recursos)\n'
      for (const [r, chance] of Object.entries(n.resources)) {
        reply += '   ' + r + (chance != null ? ' — ' + chance + '%' : '') + '\n'
      }
    }
    reply += '\n'
  } else {
    reply += '⚠️ Nenhum node com overlap direto entre esses recursos.\n\n'
  }

  reply += '📋 *Melhor node individual por recurso:*\n'
  for (const r of list) {
    const places = (byResource[r] || []).slice().sort((a, b) => (b.chance || 0) - (a.chance || 0))
    if (!places.length) { reply += '• ' + r + ': _não encontrado nas tabelas de drop (confira o nome)_\n'; continue }
    const best = places[0]
    reply += '• ' + r + ': *' + best.place + '* (' + (best.chance != null ? best.chance + '%' : '?') + ')\n'
  }

  if (opts.preferMissionType) reply += '\n_Ordenado priorizando nodes de "' + opts.preferMissionType + '" quando possível._'

  return reply.trim()
}

module.exports = { farmRouteOptimizer }
