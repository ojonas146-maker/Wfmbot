// src/services/worldstate/primeVaultStatus.js
//
// prime_vault_status
// Portado/adaptado da lógica do warframe-mcp (primeVault.ts).
//
// Fluxo:
// 1. Resolve o Prime pelo nome.
// 2. Usa o campo oficial `vaulted` do item para determinar o estado.
// 3. Verifica se o item está atualmente na Varzia / Prime Resurgence.
// 4. Lista relíquias encontradas como informação complementar.
//
// Mantém a API do módulo:
//   primeVaultStatus(names)
//   getVaultTraderData()
//
// Compatível com arquitetura modular do bot.

const axios = require('axios')

const API_BASE = 'https://api.warframestat.us/pc'

let vaultTraderCache = null
let vaultTraderAt = 0

const VT_TTL = 5 * 60 * 1000 // 5 minutos

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// -----------------------------------------------------------------------------
// Varzia / Prime Resurgence
// -----------------------------------------------------------------------------

async function getVaultTraderData() {
  const now = Date.now()

  if (
    vaultTraderCache &&
    (now - vaultTraderAt) < VT_TTL
  ) {
    return vaultTraderCache
  }

  const res = await axios.get(
    `${API_BASE}/vaultTrader`,
    { timeout: 15000 }
  )

  vaultTraderCache = res.data
  vaultTraderAt = now

  return vaultTraderCache
}

// -----------------------------------------------------------------------------
// Procurar item Prime
//
// O MCP trabalha com os dados do item e seu campo `vaulted`.
// Como o warframestat possui endpoints diferentes dependendo da versão,
// tentamos algumas fontes/formatos sem quebrar o módulo.
// -----------------------------------------------------------------------------

async function findPrimeItem(primeName) {
  const name = normalizeName(primeName)

  if (!name) return null

  // ---------------------------------------------------------------------------
  // Tentativa 1 — endpoint de items
  // ---------------------------------------------------------------------------

  try {
    const res = await axios.get(
      `${API_BASE}/items/search/${encodeURIComponent(name)}`,
      { timeout: 15000 }
    )

    const data = Array.isArray(res.data)
      ? res.data
      : []

    const exact = data.find((item) => {
      const itemName = normalizeName(item.name || item.item || '')
      return itemName.toLowerCase() === name.toLowerCase()
    })

    if (exact) return exact

    // fallback: procura pelo nome completo dentro do resultado
    const partial = data.find((item) => {
      const itemName = normalizeName(item.name || item.item || '')
      return itemName.toLowerCase().includes(name.toLowerCase())
    })

    if (partial) return partial
  } catch (e) {
    // Continua para os métodos alternativos.
  }

  // ---------------------------------------------------------------------------
  // Tentativa 2 — endpoint geral de items
  // ---------------------------------------------------------------------------

  try {
    const res = await axios.get(
      `${API_BASE}/items`,
      { timeout: 20000 }
    )

    const data = Array.isArray(res.data)
      ? res.data
      : []

    const exact = data.find((item) => {
      const itemName = normalizeName(item.name || item.item || '')
      return itemName.toLowerCase() === name.toLowerCase()
    })

    if (exact) return exact

    const partial = data.find((item) => {
      const itemName = normalizeName(item.name || item.item || '')
      return itemName.toLowerCase().includes(name.toLowerCase())
    })

    if (partial) return partial
  } catch (e) {
    // Continua.
  }

  return null
}

// -----------------------------------------------------------------------------
// Relíquias
// -----------------------------------------------------------------------------

async function findRelicsFor(primeName) {
  try {
    const res = await axios.get(
      `${API_BASE.replace('/pc', '')}/drops/search/${encodeURIComponent(primeName)}`,
      { timeout: 20000 }
    )

    const data = Array.isArray(res.data)
      ? res.data
      : []

    return data.filter((d) => {
      const place = String(d.place || '')
      return /relic/i.test(place)
    })
  } catch (e) {
    return []
  }
}

// -----------------------------------------------------------------------------
// Verificar Varzia
//
// IMPORTANTE:
// O MCP compara o nome completo do item.
// Não usamos somente a primeira palavra ("Ash", "Nova", etc.).
// -----------------------------------------------------------------------------

function findVarziaEntry(vaultTraderData, itemName) {
  const inv = (
    vaultTraderData &&
    Array.isArray(vaultTraderData.inventory)
  )
    ? vaultTraderData.inventory
    : []

  const target = normalizeName(itemName).toLowerCase()

  if (!target) return null

  return inv.find((entry) => {
    const entryName = String(
      entry.item ||
      entry.name ||
      ''
    ).toLowerCase()

    return (
      entryName === target ||
      entryName.includes(target) ||
      target.includes(entryName)
    )
  }) || null
}

// -----------------------------------------------------------------------------
// Extrair relíquias de possíveis estruturas do item
//
// O MCP obtém as informações de drops/componentes do próprio item.
// Mantemos isso como complemento porque o endpoint do warframestat pode
// apresentar estruturas diferentes dependendo da versão.
// -----------------------------------------------------------------------------

function extractRelicsFromItem(item) {
  const result = []

  if (!item) return result

  // components[].drops
  if (Array.isArray(item.components)) {
    for (const component of item.components) {
      if (!Array.isArray(component.drops)) continue

      for (const drop of component.drops) {
        const place = drop.place || drop.location || ''

        if (/relic/i.test(String(place))) {
          result.push({
            place,
            chance: drop.chance
          })
        }
      }
    }
  }

  // drops[]
  if (Array.isArray(item.drops)) {
    for (const drop of item.drops) {
      const place = drop.place || drop.location || ''

      if (/relic/i.test(String(place))) {
        result.push({
          place,
          chance: drop.chance
        })
      }
    }
  }

  return result
}

// -----------------------------------------------------------------------------
// Deduplicar relíquias
// -----------------------------------------------------------------------------

function formatRelics(relics) {
  const byRelic = {}

  for (const relic of relics) {
    const place = String(relic.place || '?')

    if (byRelic[place] === undefined) {
      byRelic[place] = relic.chance
    }
  }

  return Object.entries(byRelic)
    .sort((a, b) => {
      const ca = Number(a[1])
      const cb = Number(b[1])

      if (Number.isNaN(ca)) return 1
      if (Number.isNaN(cb)) return -1

      return cb - ca
    })
    .slice(0, 6)
}

// -----------------------------------------------------------------------------
// Verificação individual
// -----------------------------------------------------------------------------

async function checkOne(name) {
  const clean = normalizeName(name)

  if (!clean) {
    return '❌ Nome inválido.'
  }

  let out = `🔐 *${clean}*\n`

  // ---------------------------------------------------------------------------
  // 1. Resolver item
  // ---------------------------------------------------------------------------

  const item = await findPrimeItem(clean)

  if (!item) {
    return (
      `❌ Não encontrei o Prime *${clean}* na base de itens.\n\n` +
      `Verifique o nome. Exemplo: *Ash Prime*, *Mesa Prime*, *Nova Prime*.`
    )
  }

  const itemName = normalizeName(
    item.name ||
    item.item ||
    clean
  )

  // ---------------------------------------------------------------------------
  // 2. Status oficial de Vault
  //
  // Esta é a diferença principal em relação ao código anterior.
  // Não inferimos vaulted simplesmente pela ausência de relíquias.
  // ---------------------------------------------------------------------------

  const vaulted = item.vaulted === true

  // ---------------------------------------------------------------------------
  // 3. Varzia
  // ---------------------------------------------------------------------------

  let varziaEntry = null
  let varziaWindow = ''

  try {
    const vt = await getVaultTraderData()

    varziaEntry = findVarziaEntry(
      vt,
      itemName
    )

    if (varziaEntry && vt && vt.expiry) {
      const expiry = new Date(vt.expiry).getTime()

      if (expiry > Date.now()) {
        varziaWindow =
          ` (até ${new Date(expiry).toLocaleDateString('pt-BR')})`
      }
    }
  } catch (e) {
    // Varzia indisponível não deve impedir o restante da consulta.
  }

  // ---------------------------------------------------------------------------
  // 4. Relíquias
  // ---------------------------------------------------------------------------

  let relics = extractRelicsFromItem(item)

  // Se o item não trouxe drops diretamente, tenta o endpoint de drops.
  if (!relics.length) {
    relics = await findRelicsFor(itemName)
  }

  // ---------------------------------------------------------------------------
  // Informações de relíquias
  // ---------------------------------------------------------------------------

  if (relics.length) {
    out += '\n♻️ *Relíquias encontradas:*\n'

    const list = formatRelics(relics)

    for (const [place, chance] of list) {
      out +=
        `• ${place} — ` +
        `${chance != null ? `${chance}%` : '?'}\n`
    }
  }

  // ---------------------------------------------------------------------------
  // Varzia
  // ---------------------------------------------------------------------------

  out +=
    '\n🛍️ *Varzia (Prime Resurgence):* ' +
    (
      varziaEntry
        ? `✅ Disponível agora${varziaWindow}`
        : '❌ Não está na rotação atual'
    )

  // ---------------------------------------------------------------------------
  // Status final
  //
  // Mesma ideia do MCP:
  //
  // !vaulted  -> farmável normalmente
  // vaulted + Varzia -> Prime Resurgence
  // vaulted + !Varzia -> completamente vaulted
  // ---------------------------------------------------------------------------

  if (!vaulted) {
    out +=
      '\n\n🟢 *Status:* Farmável normalmente — *não vaulted*.'
  } else if (varziaEntry) {
    out +=
      '\n\n🟡 *Status:* Vaulted, mas disponível AGORA via Varzia.'
  } else {
    out +=
      '\n\n🔒 *Status:* Vaulted e fora da rotação atual da Varzia.'
  }

  return out.trim()
}

// -----------------------------------------------------------------------------
// API pública do módulo
// -----------------------------------------------------------------------------

async function primeVaultStatus(names) {
  const list = Array.isArray(names)
    ? names
    : [names]

  const blocks = []

  for (const name of list) {
    blocks.push(await checkOne(name))
  }

  return blocks.join(
    '\n\n' +
    '─'.repeat(18) +
    '\n\n'
  )
}

module.exports = {
  primeVaultStatus,
  getVaultTraderData
}
