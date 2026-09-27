// src/services/enemy/findEnemySpawn.js
// find_enemy_spawn — portado do warframe-mcp (mpeciakk/warframe-mcp, tools/enemy.ts).
//
// CORRIGIDO (comparado com o original em 27/09/2026): a v1 só cruzava
// drops/search com fissuras/invasões/sortie/archon AO VIVO (ideia própria,
// não existe no original). O original usa duas fontes estáticas:
//  1) drops/search — mas só conta como "confirmado" quando `place` tem cara
//     de node de missão real (contém "/" e "(", ex: "Draco (Ceres) — Survival"
//     ou "Planeta/Node (Tipo)"), pra não confundir com relíquia/loja.
//  2) https://api.warframestat.us/solNodes/{query} — endpoint dedicado que
//     devolve nós do mapa associados a facção/tipo/inimigo. A v1 nunca usava
//     esse endpoint. Agora ele é a fonte "provável" (LIKELY), igual ao
//     original, e o cruzamento com fissura/invasão/sortie/archon ao vivo foi
//     mantido como uma seção extra ("agora mesmo"), já que é informação real
//     e útil que o projeto original não tem.
const axios = require('axios')
const { fetchWS } = require('../worldstate/fetchWS')

async function getConfirmedDrops(enemy) {
  try {
    const url = 'https://api.warframestat.us/drops/search/' + encodeURIComponent(enemy)
    const res = await axios.get(url, { timeout: 20000 })
    const data = Array.isArray(res.data) ? res.data : []
    // Regex de "palavra inteira" pra não bater com substring solta (ex: "ox" dentro de "Fox")
    const escaped = enemy.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wordRe = new RegExp('(?:^|[\\s/,(-])' + escaped + '(?:[\\s/,)-]|$)', 'i')

    const confirmed = []
    for (const d of data) {
      if (/relic(\s*\(|$)/i.test(d.place || '')) continue
      // só conta como node de missão real: "Planeta/Node (Tipo)" ou "Node (Planeta) — Tipo"
      const place = d.place || ''
      if (place.includes('/') && place.includes('(') || (place.includes('(') && place.includes('—'))) {
        if (wordRe.test(place) || wordRe.test(d.item || '')) {
          if (!confirmed.some((c) => c.node === place)) confirmed.push({ node: place, item: d.item })
        }
      }
    }
    return confirmed
  } catch (e) {
    return []
  }
}

async function getSolNodes(enemy) {
  try {
    const url = 'https://api.warframestat.us/solNodes/' + encodeURIComponent(enemy)
    const res = await axios.get(url, { timeout: 20000 })
    const results = Array.isArray(res.data) ? res.data : []
    const likely = []
    for (const r of results) {
      for (const node of (r.nodes || [])) {
        if (!likely.some((l) => l.node === node.value)) {
          likely.push({ node: node.value, type: node.type, enemy: node.enemy })
        }
      }
    }
    return likely
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

  let out = '👾 *' + name + '*\n'
  if (opts.steelPath) out += '⚔️ _Steel Path: inimigo escala pra nível 100+._\n'

  const [confirmed, likely, live] = await Promise.all([
    getConfirmedDrops(name),
    getSolNodes(name),
    findLiveEncounters(name)
  ])

  let likelyFiltered = likely
  if (opts.missionPreference) {
    const pref = String(opts.missionPreference).toLowerCase()
    const f = likely.filter((l) => (l.type || l.node || '').toLowerCase().indexOf(pref) !== -1)
    if (f.length) likelyFiltered = f
  }

  if (!confirmed.length && !likelyFiltered.length && !live.length) {
    out += '\n_Nenhum spawn encontrado pra "' + name + '" — confira a grafia (ex: "Nox", "Corrupted Bombard", "Bursa")._'
    return out.trim()
  }

  if (confirmed.length) {
    out += '\n✅ *Confirmado (tabela de drops):*\n'
    for (const c of confirmed.slice(0, 10)) out += '• ' + c.node + (c.item ? ' — ' + c.item : '') + '\n'
  }

  if (likelyFiltered.length) {
    out += '\n📍 *Provável (nós de facção — solNodes):*\n'
    for (const l of likelyFiltered.slice(0, 10)) {
      const extra = [l.type, l.enemy].filter(Boolean).join(', ')
      out += '• ' + l.node + (extra ? ' — ' + extra : '') + '\n'
    }
  }

  if (live.length) {
    out += '\n🔴 *Ativo agora (world state ao vivo):*\n'
    const seen = {}
    for (const h of live) {
      const key = h.src + '|' + h.node
      if (seen[key]) continue
      seen[key] = true
      out += '• [' + h.src + '] ' + (h.node || '?') + (h.extra ? ' — ' + h.extra : '') + '\n'
    }
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
