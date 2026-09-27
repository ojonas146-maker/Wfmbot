// src/services/worldstate/synergy.js
// task_synergy_planner — portado do warframe-mcp (mpeciakk/warframe-mcp,
// tools/synergy.ts). Cruza os desafios ativos do Nightwave com fissuras,
// invasões e sortie atuais pra achar qual missão única resolve vários
// objetivos de uma vez.
const { fetchWS } = require('./fetchWS')

// Palavras-chave por tema de desafio → usadas pra bater com missionType/node/facção
// das atividades atuais. Heurística simples baseada no texto do desafio do Nightwave.
const CHALLENGE_KEYWORDS = {
  exterminate: ['exterminate'],
  survival: ['survival'],
  defense: ['defense'],
  capture: ['capture'],
  spy: ['spy'],
  sabotage: ['sabotage'],
  rescue: ['rescue'],
  excavation: ['excavation'],
  interception: ['interception'],
  disruption: ['disruption'],
  fissure: ['fissure', 'relic', 'void'],
  'steel path': ['steel path', 'steelpath'],
  grineer: ['grineer'],
  corpus: ['corpus'],
  infested: ['infest'],
  invasion: ['invas']
}

function inferKeywords(challengeText) {
  const t = String(challengeText || '').toLowerCase()
  const found = new Set()
  for (const words of Object.values(CHALLENGE_KEYWORDS)) {
    if (words.some((w) => t.indexOf(w) !== -1)) words.forEach((w) => found.add(w))
  }
  return [...found]
}

async function taskSynergyPlanner() {
  try {
    const [nw, fissures, invasions, sortie] = await Promise.all([
      fetchWS('nightwave').catch(() => null),
      fetchWS('fissures').catch(() => []),
      fetchWS('invasions').catch(() => []),
      fetchWS('sortie').catch(() => null)
    ])

    if (!nw || !nw.activeChallenges || !nw.activeChallenges.length) {
      return '📡 Nenhum desafio ativo do Nightwave no momento pra cruzar com fissuras/invasões/sortie.'
    }

    const pool = []
    for (const f of (fissures || [])) {
      pool.push({ src: 'Fissura', node: f.node, text: [f.missionType, f.tier, f.isHard ? 'steel path steelpath' : '', 'fissure relic void'].join(' ') })
    }
    for (const inv of (invasions || [])) {
      pool.push({ src: 'Invasão', node: inv.node, text: ['invasion invas', inv.attackingFaction, inv.defendingFaction].join(' ') })
    }
    if (sortie && Array.isArray(sortie.variants)) {
      for (const v of sortie.variants) pool.push({ src: 'Sortie', node: v.node, text: [v.missionType, 'sortie'].join(' ') })
    }

    let reply = '🧭 *Task Synergy Planner*\n_Nightwave × Fissuras/Invasões/Sortie_\n\n'
    let any = false

    for (const c of nw.activeChallenges) {
      const desc = (c.title || '') + ' ' + (c.desc || '')
      const keywords = inferKeywords(desc)
      if (!keywords.length) continue
      const matches = pool.filter((p) => keywords.some((k) => p.text.toLowerCase().indexOf(k) !== -1))
      if (!matches.length) continue
      any = true
      const tag = c.isDaily ? '📅' : (c.isElite ? '💀' : '⭐')
      reply += tag + ' *' + (c.title || 'Desafio') + '*\n   ' + (c.desc || '') + '\n'
      const seen = {}
      let shown = 0
      for (const m of matches) {
        const key = m.src + '|' + m.node
        if (seen[key]) continue
        seen[key] = true
        reply += '   ✅ [' + m.src + '] ' + (m.node || '?') + '\n'
        shown++
        if (shown >= 4) break
      }
      reply += '\n'
    }

    if (!any) reply += '_Nenhuma combinação clara agora — os desafios ativos não bateram com fissuras/invasões/sortie no momento._'
    return reply.trim()
  } catch (err) {
    console.error('taskSynergyPlanner:', err.message)
    return '❌ Erro ao cruzar Nightwave com o world state.'
  }
}

module.exports = { taskSynergyPlanner }
