// src/services/worldstate/calendar.js
const axios = require('axios')
const { formatTimeLeft } = require('../../utils/time')

async function getCalendar() {
  try {
    const res = await axios.get('https://api.warframestat.us/pc/calendar', { timeout: 15000 })
    const data = res.data
    if (!data || !data.days) return '❌ Calendário de 1999 indisponível.'

    const left = data.expiry ? formatTimeLeft(new Date(data.expiry).getTime() - Date.now()) : '?'
    let reply = '📅 *Calendário 1999*\n'
    reply += '⏳ Season atual termina em: *' + left + '*\n\n'

    const days = data.days || []
    let shown = 0
    for (const day of days) {
      if (!day.events || !day.events.length) continue
      const date = day.date ? new Date(day.date).toLocaleDateString('pt-BR') : '?'
      reply += '*' + date + '*\n'
      for (const ev of day.events) {
        if (ev.type === 'To Do' && ev.challenge) {
          reply += '✅ *To Do:* ' + ev.challenge.title + '\n   ' + (ev.challenge.description || '') + '\n'
        } else if (ev.type === 'Big Prize!' && ev.reward) {
          reply += '🎁 *Prêmio:* ' + ev.reward + '\n'
        } else if (ev.type === 'Override' && ev.upgrade) {
          reply += '⚙️ *Override:* ' + ev.upgrade.title + '\n   ' + (ev.upgrade.description || '') + '\n'
        }
      }
      reply += '\n'
      shown++
      if (shown >= 8) break
    }

    if (!shown) reply += '_Nenhum evento listado no momento._'
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar o Calendário de 1999.'
  }
}

module.exports = { getCalendar }
