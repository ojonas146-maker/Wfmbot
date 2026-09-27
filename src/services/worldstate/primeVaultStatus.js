// src/services/worldstate/primeVaultStatus.js
// prime_vault_status — portado do warframe-mcp (mpeciakk/warframe-mcp,
// tools/primeVault.ts). Verifica se um prime está vaulted, disponível na
// Varzia (Prime Resurgence) e/ou farmável agora via relíquias.
// Esta é a "versão robusta" que substitui a checagem manual/regex que o
// !ressurgencia antigo fazia sozinho — ver services/worldstate/resurgence.js.
const axios = require('axios')

let vaultTraderCache = null
let vaultTraderAt = 0
const VT_TTL = 5 * 60 * 1000 // 5 min — mesmo TTL de world state usado no resto do bot

async function getVaultTraderData() {
  const now = Date.now()
  if (vaultTraderCache && (now - vaultTraderAt) < VT_TTL) return vaultTraderCache
  const res = await axios.get('https://api.warframestat.us/pc/vaultTrader', { timeout: 15000 })
  vaultTraderCache = res.data
  vaultTraderAt = now
  return vaultTraderCache
}

async function findRelicsFor(primeName) {
  try {
    const res = await axios.get('https://api.warframestat.us/drops/search/' + encodeURIComponent(primeName), { timeout: 20000 })
    const data = Array.isArray(res.data) ? res.data : []
    return data.filter((d) => /relic/i.test(d.place || ''))
  } catch (e) {
    return []
  }
}

async function checkOne(name) {
  const clean = String(name || '').trim()
  if (!clean) return '❌ Nome inválido.'
  let out = '🔐 *' + clean + '*\n'

  const relics = await findRelicsFor(clean)
  if (relics.length) {
    out += '\n♻️ *Farmável via relíquias agora:*\n'
    const byRelic = {}
    for (const r of relics) {
      const place = r.place || '?'
      if (byRelic[place] === undefined) byRelic[place] = r.chance
    }
    const list = Object.entries(byRelic).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 6)
    for (const [place, chance] of list) out += '• ' + place + ' — ' + (chance != null ? chance + '%' : '?') + '\n'
  }

  let inVarzia = false
  let varziaWindow = ''
  try {
    const vt = await getVaultTraderData()
    const inv = (vt && vt.inventory) || []
    const q = clean.toLowerCase()
    const firstWord = q.split(' ')[0]
    inVarzia = inv.some((it) => String(it.item || '').toLowerCase().indexOf(firstWord) !== -1)
    if (inVarzia && vt.expiry) {
      const left = new Date(vt.expiry).getTime() - Date.now()
      if (left > 0) varziaWindow = ' (até ' + new Date(vt.expiry).toLocaleDateString('pt-BR') + ')'
    }
  } catch (e) {}

  out += '\n🛍️ *Varzia (Prime Resurgence):* ' + (inVarzia ? '✅ Disponível agora' + varziaWindow : '❌ Não está na rotação atual')

  if (!relics.length && !inVarzia) {
    out += '\n\n🔒 *Status: provavelmente VAULTED.* Sem relíquias ativas conhecidas e fora da Varzia — só volta numa rotação futura da Prime Resurgence.'
  } else if (relics.length) {
    out += '\n\n🟢 *Status:* Farmável normalmente (não vaulted).'
  } else {
    out += '\n\n🟡 *Status:* Vaulted, mas disponível AGORA via Varzia — aproveite a janela.'
  }

  return out.trim()
}

async function primeVaultStatus(names) {
  const list = Array.isArray(names) ? names : [names]
  const blocks = []
  for (const n of list) blocks.push(await checkOne(n))
  return blocks.join('\n\n' + '─'.repeat(18) + '\n\n')
}

module.exports = { primeVaultStatus, getVaultTraderData }
