// src/services/crafting/crafting.js
// crafting_requirements + crafting_usage — portado da lógica do warframe-mcp
// (mpeciakk/warframe-mcp, tools/crafting.ts), adaptado pro warframestat.us
// no lugar do scraping da Wiki (mesma ideia: receita completa + "o que usa isso?").
const axios = require('axios')
const { getFullCatalog } = require('./craftingData')

function fmtCredits(n) {
  return Number(n || 0).toLocaleString('pt-BR')
}

function fmtBuildTime(sec) {
  sec = Number(sec || 0)
  if (!sec) return '?'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return h + 'h ' + m + 'min'
  if (m > 0) return m + 'min ' + s + 's'
  return s + 's'
}

async function findItemExact(name) {
  const q = String(name || '').trim().toLowerCase()
  if (!q) return null
  try {
    const res = await axios.get('https://api.warframestat.us/items/search/' + encodeURIComponent(name), { timeout: 20000 })
    const list = Array.isArray(res.data) ? res.data : []
    if (!list.length) return null
    let best = list.find((it) => (it.name || '').toLowerCase() === q)
    if (!best) best = list.find((it) => (it.name || '').toLowerCase().indexOf(q) !== -1)
    return best || list[0]
  } catch (e) {
    return null
  }
}

// ---------- crafting_requirements: "o que preciso pra construir X?" ----------

async function craftingRequirementsOne(name) {
  const item = await findItemExact(name)
  if (!item) return '❌ *' + name + '*: item não encontrado (confira o nome/grafia).'

  const comps = item.components || []
  let out = '🛠️ *Receita — ' + (item.name || name) + '*\n'
  if (item.masteryReq != null) out += 'MR necessário: ' + item.masteryReq + '\n'

  if (!comps.length) {
    out += '\n_Sem receita de blueprint registrada — provavelmente é item base, dropa pronto, ou não é craftável._'
    return out.trim()
  }

  out += '\n*Componentes:*\n'
  for (const c of comps) {
    const count = c.itemCount || 1
    out += '• ' + (c.name || '?') + (count > 1 ? ' x' + count : '') + '\n'
    // sub-receita: se o próprio componente também tiver components (ex: partes que
    // por sua vez precisam de outro blueprint), mostra um nível a mais.
    if (c.components && c.components.length) {
      for (const sub of c.components) {
        out += '   ↳ ' + (sub.name || '?') + (sub.itemCount > 1 ? ' x' + sub.itemCount : '') + '\n'
      }
    }
  }

  if (item.buildPrice != null) out += '\n💰 Credits: ' + fmtCredits(item.buildPrice) + '\n'
  if (item.buildTime != null) out += '⏱️ Tempo de build: ' + fmtBuildTime(item.buildTime) + '\n'
  if (item.skipBuildTimePrice != null) out += '💎 Rush instantâneo: ' + item.skipBuildTimePrice + 'p\n'
  if (item.buildQuantity && item.buildQuantity > 1) out += '📦 Rende: ' + item.buildQuantity + 'x por craft\n'
  if (item.consumeOnBuild) out += '⚠️ Blueprint consumido ao craftar (não é reutilizável)\n'

  return out.trim()
}

async function craftingRequirements(itemNames) {
  const names = Array.isArray(itemNames) ? itemNames : [itemNames]
  const blocks = []
  for (const n of names) blocks.push(await craftingRequirementsOne(n))
  return blocks.join('\n\n' + '─'.repeat(18) + '\n\n')
}

// ---------- crafting_usage: "pra que serve isso? é seguro vender?" ----------

async function craftingUsageOne(name) {
  const q = String(name || '').trim().toLowerCase()
  if (!q) return '❌ Nome inválido.'
  try {
    const catalog = await getFullCatalog()
    const users = []
    for (const it of catalog) {
      const comps = it.components || []
      for (const c of comps) {
        if (String(c.name || '').toLowerCase() === q) {
          users.push({ name: it.name, count: c.itemCount || 1, type: it.type || it.category || '' })
          break
        }
      }
    }

    if (!users.length) {
      return '📦 *' + name + '*\n\n_Não aparece em nenhuma receita conhecida no catálogo atual — provavelmente seguro pra vender/usar como quiser._'
    }

    users.sort((a, b) => a.name.localeCompare(b.name))
    let out = '📦 *' + name + '* — usado na receita de ' + users.length + ' item(ns):\n\n'
    const max = 30
    for (let i = 0; i < Math.min(users.length, max); i++) {
      const u = users[i]
      out += '• ' + u.name + (u.count > 1 ? ' (x' + u.count + ')' : '') + (u.type ? ' — ' + u.type : '') + '\n'
    }
    if (users.length > max) out += '\n_... e mais ' + (users.length - max) + ' itens_\n'
    out += '\n⚠️ Se apareceu aqui, *cheque antes de vender* — pode estar craftando algo que você quer.'
    return out.trim()
  } catch (err) {
    console.error('craftingUsage:', err.message)
    return '❌ Erro ao consultar uso de *' + name + '*.'
  }
}

async function craftingUsage(itemNames) {
  const names = Array.isArray(itemNames) ? itemNames : [itemNames]
  const blocks = []
  for (const n of names) blocks.push(await craftingUsageOne(n))
  return blocks.join('\n\n' + '─'.repeat(18) + '\n\n')
}

module.exports = { craftingRequirements, craftingUsage, findItemExact }
