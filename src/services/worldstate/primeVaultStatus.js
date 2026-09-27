// src/services/worldstate/primeVaultStatus.js
// prime_vault_status — portado do warframe-mcp (mpeciakk/warframe-mcp,
// tools/primeVault.ts). Verifica se um prime está vaulted, disponível na
// Varzia (Prime Resurgence) e/ou farmável agora via relíquias.
// Esta é a "versão robusta" que substitui a checagem manual/regex que o
// !ressurgencia antigo fazia sozinho — ver services/worldstate/resurgence.js.
//
// CORRIGIDO (comparado com o original em 27/09/2026): a v1 desta função
// INFERIA vaulted por "não achei relíquia + não tá na Varzia" — heurística
// frágil. O projeto original não infere nada: a própria API do
// warframestat.us já devolve um campo `vaulted: boolean` direto no item
// (via /warframes/search/ e /items/search/), vindo do manifesto da DE.
// Agora usamos esse campo como fonte primária de verdade, igual ao original,
// e só usamos drops/Varzia como informação complementar (onde farmar / preço).
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

// Busca o item oficial (com o campo `vaulted`) — tenta /warframes/search/ primeiro
// (igual ao original: prime de warframe é o caso mais comum) e cai pra
// /items/search/ (armas primes, companions primes etc.) se não achar.
async function findCanonicalItem(name) {
  const q = String(name || '').trim()
  if (!q) return null
  const lower = q.toLowerCase()

  async function search(path) {
    try {
      const res = await axios.get('https://api.warframestat.us/' + path + '/search/' + encodeURIComponent(q), { timeout: 20000 })
      const list = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : [])
      if (!list.length) return null
      return list.find((it) => (it.name || '').toLowerCase() === lower) ||
        list.find((it) => (it.name || '').toLowerCase().startsWith(lower)) ||
        list[0]
    } catch (e) {
      return null
    }
  }

  return (await search('warframes')) || (await search('items'))
}

// Relíquias ativas na tabela de drops ao vivo — só pra mostrar ONDE farmar,
// não pra decidir se está vaulted (isso agora vem do campo `vaulted`).
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

  const item = await findCanonicalItem(clean)
  const displayName = (item && item.name) || clean
  let out = '🔐 *' + displayName + '*\n'

  const relics = await findRelicsFor(displayName)
  if (relics.length) {
    out += '\n♻️ *Onde farmar (relíquias ao vivo):*\n'
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
  let vt = null
  try {
    vt = await getVaultTraderData()
    const inv = (vt && vt.inventory) || []
    const q = displayName.toLowerCase()
    const firstWord = q.split(' ')[0]
    inVarzia = inv.some((it) => String(it.item || '').toLowerCase().indexOf(firstWord) !== -1)
    if (inVarzia && vt.expiry) {
      const left = new Date(vt.expiry).getTime() - Date.now()
      if (left > 0) varziaWindow = ' (até ' + new Date(vt.expiry).toLocaleDateString('pt-BR') + ')'
    }
  } catch (e) {}

  out += '\n🛍️ *Varzia (Prime Resurgence):* ' + (inVarzia ? '✅ Disponível agora' + varziaWindow : '❌ Não está na rotação atual')

  // Fonte primária de verdade: o campo `vaulted` que a própria API devolve.
  // Só cai no heurístico antigo (relíquia ativa OU Varzia) se o item não
  // foi encontrado no catálogo oficial — ex: nome digitado errado.
  if (item && item.vaulted != null) {
    if (!item.vaulted) {
      out += '\n\n🟢 *Status: NÃO vaulted.* Farmável normalmente pelas relíquias listadas acima.'
    } else if (inVarzia) {
      out += '\n\n🟡 *Status: VAULTED*, mas disponível AGORA via Varzia — aproveite a janela.'
    } else {
      out += '\n\n🔒 *Status: VAULTED.* Fora da rotação de relíquias e fora da Varzia — só via troca com outros jogadores ou numa rotação futura da Prime Resurgence.'
    }
  } else {
    out += '\n\n⚠️ _Não achei "' + clean + '" no catálogo oficial (confira o nome) — status abaixo é estimado, não confirmado:_'
    if (!relics.length && !inVarzia) {
      out += '\n🔒 Sem relíquias ativas conhecidas e fora da Varzia → provavelmente vaulted.'
    } else if (relics.length) {
      out += '\n🟢 Tem relíquia ativa → provavelmente farmável.'
    } else {
      out += '\n🟡 Só disponível via Varzia agora.'
    }
  }

  // Valor em ducados das partes, quando disponível — informação extra do catálogo.
  if (item && Array.isArray(item.components) && item.components.some((c) => c.ducats)) {
    const parts = item.components.filter((c) => c.ducats).map((c) => c.name + ': ' + c.ducats + ' ducados')
    out += '\n\n💰 *Ducados:* ' + parts.join('  |  ')
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
