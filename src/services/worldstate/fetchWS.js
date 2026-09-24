// src/services/worldstate/fetchWS.js
// Helper genérico pra api.warframestat.us/pc/<path>, com retry.
const axios = require('axios')
const { sleep } = require('../../utils/time')

async function fetchWS(path) {
  const urls = [
    'https://api.warframestat.us/pc/' + path,
    'https://api.warframestat.us/pc/' + path + '?language=en'
  ]
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of urls) {
      try {
        const res = await axios.get(url, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
        if (res.data != null) return res.data
      } catch (e) {
        lastErr = e
        const st = e.response && e.response.status
        console.error('fetchWS', path, url, st || e.message)
      }
    }
    if (attempt < 2) await sleep(1500)
  }
  const errMsg = (lastErr && lastErr.response && lastErr.response.status)
    ? ('HTTP ' + lastErr.response.status)
    : ((lastErr && lastErr.message) || 'fetchWS falhou: ' + path)
  throw new Error(errMsg)
}

module.exports = { fetchWS }
