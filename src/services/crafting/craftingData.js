// src/services/crafting/craftingData.js
// Catálogo completo do warframestat.us (/items) cacheado em memória por 24h
// — mesma ideia de TTL usada no projeto warframe-mcp (mpeciakk) pra dados estáticos.
// É usado tanto pelo crafting_requirements/crafting_usage quanto pra robustecer
// a Ressurgência (nomes canônicos + status vaulted).
const axios = require('axios')

let fullCatalogCache = null
let fullCatalogAt = 0
const CATALOG_TTL = 24 * 60 * 60 * 1000 // 24h

let inFlight = null

async function getFullCatalog() {
  const now = Date.now()
  if (fullCatalogCache && (now - fullCatalogAt) < CATALOG_TTL) return fullCatalogCache
  if (inFlight) return inFlight // evita duas requisições simultâneas do JSON gigante

  inFlight = (async () => {
    try {
      const res = await axios.get('https://api.warframestat.us/items', { timeout: 60000 })
      fullCatalogCache = Array.isArray(res.data) ? res.data : []
      fullCatalogAt = Date.now()
      return fullCatalogCache
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

let uniqueNameIndexCache = null
async function getUniqueNameIndex() {
  if (uniqueNameIndexCache && fullCatalogCache) return uniqueNameIndexCache
  const catalog = await getFullCatalog()
  const idx = {}
  for (const it of catalog) {
    if (it.uniqueName) idx[it.uniqueName] = it
  }
  uniqueNameIndexCache = idx
  return idx
}

module.exports = { getFullCatalog, getUniqueNameIndex }
