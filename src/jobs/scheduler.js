// src/jobs/scheduler.js
// Orquestra os checks periódicos (alertas de preço, invasão, riven, steal),
// respeitando o pause do admin e serializando as chamadas (não roda em paralelo).
const { sleep } = require('../utils/time')
const { adminState } = require('../core/adminState')
const { checkAlerts } = require('../services/wfm/priceAlerts')
const { checkInvasionAlerts } = require('../services/worldstate/invasions')
const { checkRivenAlerts } = require('../services/riven/alerts')
const { checkRivenSteals } = require('../services/riven/steal')

async function runAllChecks(sock) {
  if (adminState.alertsPaused) {
    console.log('⏸ Checks pausados pelo admin — pulando')
    return
  }
  try {
    adminState.lastCheckAt = Date.now()
    adminState.lastCheckError = null

    try { await checkAlerts(sock) } catch (e) { console.error('checkAlerts:', e.message) }
    await sleep(2000)

    try { await checkInvasionAlerts(sock) } catch (e) { console.error('checkInvasionAlerts:', e.message) }
    await sleep(2000)

    try { await checkRivenAlerts(sock) } catch (e) { console.error('checkRivenAlerts:', e.message) }
    await sleep(2000)

    try { await checkRivenSteals(sock) } catch (e) { console.error('checkRivenSteals:', e.message) }
  } catch (e) {
    adminState.lastCheckError = e.message
    console.error('runAllChecks:', e.message)
  }
}

module.exports = { runAllChecks }
