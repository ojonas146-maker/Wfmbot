// src/services/enemy/findEnemySpawn.js
// find_enemy_spawn — portado do warframe-mcp (mpeciakk/warframe-mcp, tools/enemy.ts).
// Combina drops confirmados (o que o inimigo derruba, via tabela de drops) com
// ocorrências AO VIVO nas fissuras/invasões/sortie/archon atuais (o que a API
// pública não expõe é um mapa fixo inimigo→node, então cruzamos com o world
// state em tempo real, que é mais confiável que uma lista estática desatualizada).
const axios = require('axios')
const { fetchWS } = require('../worldstate/fetchWS')

async function getEnemyDrops(enemy) {
  try {
    const url = 'https://api.warframestat.us/drops/search/' + encodeURIComponent(enemy)
    const res = await axios.get(url, { timeout: 20000 })
    const data = Array.isArray(res.data) ? res.data : []
    const q = enemy.trim().toLowerCase()
    return data.filter((d) => String(d.place || '').toLowerCase().indexOf(q) !== -1)
  } catch (e) {
    return []
  }
}

async function findLiveEncounters(enemy) {
  const q = enemy.trim().toLowerCase()
  const hits = []
  const [fissures, invasions, sortie, archon] = await Promise.all([
    fetchWS('fissures').catch(() => []),
    fetchWS('invasions').catch(() => []),
    fetchWS('sortie').catch(() => null),
    fetchWS('archonHunt').catch(() => null)
  ])

  for (const f of (fissures || [])) {
    if (String(f.enemy || '').toLowerCase().indexOf(q) !== -1) {
      hits.push({ src: 'Fissura', node: f.node, extra: (f.tier || '') + ' ' + (f.missionType || '') })
    }
  }
  for (const inv of (invasions || [])) {
    const factions = (inv.attackingFaction || '') + ' ' + (inv.defendingFaction || '')
    if (factions.toLowerCase().indexOf(q) !== -1) {
      hits.push({ src: 'Invasão', node: inv.node, extra: (inv.attackingFaction || '') + ' vs ' + (inv.defendingFaction || '') })
    }
  }
  if (sortie && Array.isArray(sortie.variants)) {
    for (const v of sortie.variants) {
      if (String(v.node || '').toLowerCase().indexOf(q) !== -1) {
        hits.push({ src: 'Sortie', node: v.node, extra: v.missionType || '' })
      }
    }
  }
  if (archon && String(archon.boss || '').toLowerCase().indexOf(q) !== -1) {
    const node = (archon.missions && archon.missions[0] && archon.missions[0].node) || '?'
    hits.push({ src: 'Archon Hunt', node, extra: archon.boss })
  }

  return hits
}

async function findEnemySpawnOne(enemy, opts) {
  opts = opts || {}
  const name = String(enemy || '').trim()
  if (!name) return '❌ Nome de inimigo inválido.'

  let out = '👾 *' + name + '*\n\n'

  const drops = await getEnemyDrops(name)
  if (drops.length) {
    out += '*Drops confirmados (tabela de drops):*\n'
    const max = 10
    const sorted = drops.slice().sort((a, b) => (b.chance || 0) - (a.chance || 0))
    for (let i = 0; i < Math.min(sorted.length, max); i++) {
      const d = sorted[i]
      out += '• ' + (d.item || '?') + ' — ' + (d.chance != null ? d.chance + '%' : '?') + '\n'
    }
    if (sorted.length > max) out += '_... +' + (sorted.length - max) + ' drops_\n'
  } else {
    out += '_Sem entrada direta na tabela de drops pra esse nome — confira a grafia (ex: "Nox", "Corrupted Bombard", "Bursa")._\n'
  }

  const live = await findLiveEncounters(name)
  if (live.length) {
    out += '\n*📍 Onde encontrar agora (world state ao vivo):*\n'
    const seen = {}
    for (const h of live) {
      const key = h.src + '|' + h.node
      if (seen[key]) continue
      seen[key] = true
      out += '• [' + h.src + '] ' + (h.node || '?') + (h.extra ? ' — ' + h.extra : '') + '\n'
    }
  } else {
    out += '\n_Nenhuma ocorrência ativa agora nas fissuras/invasões/sortie/archon pra esse termo._'
  }

  if (opts.missionPreference) {
    out += '\n💡 Preferência de missão (' + opts.missionPreference + '): filtre manualmente na lista acima.'
  }
  if (opts.steelPath) {
    out += '\n⚔️ _Lembrete: no Steel Path esse inimigo escala bem mais forte (nível + armadura/escudo)._'
  }

  return out.trim()
}

async function findEnemySpawn(enemies, opts) {
  const list = Array.isArray(enemies) ? enemies : [enemies]
  const blocks = []
  for (const e of list) blocks.push(await findEnemySpawnOne(e, opts))
  return blocks.join('\n\n' + '─'.repeat(18) + '\n\n')
}

module.exports = { findEnemySpawn, findEnemySpawnOne }
