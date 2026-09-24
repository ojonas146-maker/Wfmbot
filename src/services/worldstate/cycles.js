// src/services/worldstate/cycles.js
const { fetchWS } = require('./fetchWS')
const { formatTimeLeft } = require('../../utils/time')

async function getCycle(kind) {
  try {
    const pathMap = { cetus: 'cetusCycle', vallis: 'vallisCycle', deimos: 'cambionCycle' }
    const titles = { cetus: '🌿 Cetus (Planícies)', vallis: '❄️ Vallis (Orb Vallis)', deimos: '☣️ Deimos (Cambion)' }
    const data = await fetchWS(pathMap[kind])
    if (!data) return '❌ Ciclo indisponível.'
    const left = data.timeLeft || (data.expiry ? formatTimeLeft(new Date(data.expiry).getTime() - Date.now()) : '?')
    let state = data.state || '?'
    if (kind === 'cetus') state = data.isDay ? '☀️ Dia' : '🌙 Noite'
    if (kind === 'vallis') state = data.isWarm ? '🔥 Quente' : '❄️ Frio'
    if (kind === 'deimos') {
      if (/fass/i.test(state)) state = '🟠 Fass'
      else if (/vome/i.test(state)) state = '🔵 Vome'
    }
    return titles[kind] + '\nEstado: *' + state + '*\n⏳ Resta: *' + left + '*'
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar ciclo.'
  }
}

module.exports = { getCycle }
