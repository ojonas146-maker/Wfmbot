// src/services/worldstate/drops.js
const axios = require('axios')

async function getDrops(query) {
  try {
    const q = query.trim()
    if (!q) return '❌ Use: !drops hildryn prime\n!drops neurodes\n!drops primed flow'
    const url = 'https://api.warframestat.us/drops/search/' + encodeURIComponent(q)
    const res = await axios.get(url, { timeout: 20000 })
    const data = res.data
    if (!data || !data.length) return '❌ Nenhum drop encontrado para "' + q + '".'

    let filtered = data.filter((d) => !/\(Exceptional\)|\(Flawless\)|\(Radiant\)/i.test(d.place || ''))
    if (!filtered.length) filtered = data

    let isRelicHeavy = 0
    for (let j = 0; j < Math.min(filtered.length, 20); j++) {
      if (/relic/i.test(filtered[j].place || '')) isRelicHeavy++
    }

    let reply = '📍 *Drops — ' + q + '*\n\n'

    if (isRelicHeavy >= 5) {
      const byPart = {}
      for (const row of filtered) {
        const item = row.item || '?'
        const place = row.place || '?'
        if (!byPart[item]) byPart[item] = []
        byPart[item].push({ place, chance: row.chance, rarity: row.rarity })
      }
      const parts = Object.keys(byPart)
      for (let p = 0; p < parts.length && p < 8; p++) {
        const part = parts[p]
        reply += '🧩 *' + part + '*\n'
        const rels = byPart[part]
        rels.sort((a, b) => (b.chance || 0) - (a.chance || 0))
        for (let r = 0; r < rels.length && r < 6; r++) {
          reply += '  • ' + rels[r].place + ' — ' + (rels[r].chance != null ? rels[r].chance + '%' : '?')
          if (rels[r].rarity) reply += ' (' + rels[r].rarity + ')'
          reply += '\n'
        }
        if (rels.length > 6) reply += '  _...+' + (rels.length - 6) + '_\n'
        reply += '\n'
      }
      reply += '💡 Use `!relic lith x1` para chances I/F/R + preços'
    } else {
      filtered.sort((a, b) => (b.chance || 0) - (a.chance || 0))
      const max = Math.min(filtered.length, 20)
      for (let n = 0; n < max; n++) {
        const d = filtered[n]
        reply += '• *' + (d.place || '?') + '*\n'
        reply += '  ' + (d.item || q) + ' — ' + (d.chance != null ? d.chance + '%' : '?')
        if (d.rarity) reply += ' (' + d.rarity + ')'
        reply += '\n'
      }
      if (filtered.length > max) reply += '\n_... e mais ' + (filtered.length - max) + ' locais_'
    }
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar drops.'
  }
}

module.exports = { getDrops }
