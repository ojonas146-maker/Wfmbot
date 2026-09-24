// src/services/worldstate/acrithis.js
const axios = require('axios')

async function getAcrithisMessage() {
  try {
    const now = Date.now()
    const utc = new Date()
    const nextDaily = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate() + 1, 0, 0, 0)
    const day = utc.getUTCDay()
    const daysUntilMon = (8 - day) % 7 || 7
    const nextWeekly = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate() + daysUntilMon, 0, 0, 0)

    const PRICE = {
      'Orokin Reactor': 20, 'Orokin Catalyst': 20, 'Exilus Warframe Adapter': 20,
      'Exilus Weapon Adapter': 20, 'Primary Arcane Adapter': 25, 'Secondary Arcane Adapter': 25,
      Forma: 10, 'Melee Riven Mod': 15, 'Pistol Riven Mod': 15, 'Rifle Riven Mod': 15,
      'Kitgun Riven Mod': 15, 'Zaw Riven Mod': 15, 'Shotgun Riven Mod': 15,
      'Companion Weapon Riven Mod': 20, '5000 Kuva': 10
    }

    const pageUrl = 'https://wiki.warframe.com/api.php?' + new URLSearchParams({
      action: 'parse', page: 'Acrithis/Current_Offerings', prop: 'wikitext', format: 'json', origin: '*'
    })

    const res = await axios.get(pageUrl, { timeout: 15000 })
    const wikitext = res.data && res.data.parse && res.data.parse.wikitext && res.data.parse.wikitext['*']
    if (!wikitext) return '❌ Não foi possível ler a rotação da Acrithis.'

    const items = []
    for (let i = 1; i <= 5; i++) {
      const m = wikitext.match(new RegExp('AcrithisItem' + i + '\\|([^}\\|]+)'))
      if (m) items.push(m[1].trim())
    }

    const observed = (wikitext.match(/AcrithisObserved\|([^}]+)/) || [])[1] || '?'

    let reply = '📜 *Acrithis — Inventário*\n'
    reply += 'Weekly: *' + formatTimeLeft(nextWeekly - now) + '*\n'
    reply += 'Daily: *' + formatTimeLeft(nextDaily - now) + '*\n\n'

    reply += '*Weekly Item* _(Pathos Clamp)_\n'
    if (!items.length) {
      reply += '_Sem dados da wiki_\n'
    } else {
      for (const it of items) {
        const cost = PRICE[it]
        const label = it === 'Forma' ? 'Forma Blueprint' : it === '5000 Kuva' ? 'x5000 Kuva' : it
        reply += '• ' + label
        if (cost != null) reply += ' — *' + cost + ' Pathos*'
        reply += '\n'
      }
    }

    reply += '\n_Wiki atualizada em: ' + observed.trim() + '_\n'
    reply += '_Daily (arcanes/deco) não tem API pública estável._'

    return reply.trim()
  } catch (e) {
    console.error('acrithis:', e.message)
    return '❌ Erro ao buscar Acrithis.'
  }
}

function formatTimeLeft(ms) {
  if (ms <= 0) return 'agora'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  if (days > 0) return days + 'd ' + hours + 'h'
  if (hours > 0) return hours + 'h ' + mins + 'min'
  return mins + 'min'
}

module.exports = { getAcrithisMessage }
