// src/services/ai/rag.js
// RAG usado pelo !g: busca stats de arma, preço, wiki e estado do jogo
// e devolve blocos de texto pra injetar no prompt (via askAI opts.retrieveFacts).
const axios = require('axios')
const { clipText } = require('../../utils/text')
const { resolveItemSmart, getTopOrders, calcStatsFromOrders } = require('../wfm/client')
const { formatArbyMessage } = require('../worldstate/arbitration')
const { getResurgence } = require('../worldstate/resurgence')
const { getBaro } = require('../worldstate/baro')
const { formatIncursionsMessage } = require('../worldstate/arbitration')
const { formatOracleCycle } = require('../worldstate/oracleBounties')

async function retrieveWeaponStats(userMessage) {
  const q = String(userMessage || '')
  if (!/stats?\b|status\b|dano|damage|crit|cr[ií]tico|status chance|cad[eê]ncia|fire rate|precis[aã]o|accuracy|carregador|magazine|recarga|reload|multishot|disparo|ataque/i.test(q)) {
    return null
  }

  let weapon = q
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\b(quais?|qual|quem|os?|as?|de|do|da|dos|das|é|e|são|sao|está|esta|status|stats?|da arma|arma|me diz|me fala|fala|diz|mostra|mostrar|ver|quero|saber|warframe|por favor|porfavor|atual|atuais|agora|o|a)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (weapon.length < 2 || weapon.length > 60) return null

  try {
    const res = await axios.get('https://api.warframestat.us/items/search/' + encodeURIComponent(weapon), { timeout: 15000 })
    const list = Array.isArray(res.data) ? res.data : []
    if (!list.length) return null

    const lower = weapon.toLowerCase()
    let best = list.find((it) => (it.name || '').toLowerCase() === lower)
    if (!best) best = list.find((it) => /Rifle|Pistol|Shotgun|Melee|Archgun|Archmelee|Bow|Throwing|Kitgun|Primary|Secondary|Whip|Staff|Sword|Blade/i.test(it.type || ''))
    if (!best) best = list[0]
    if (!best) return null

    const lines = []
    lines.push('Arma: ' + (best.name || weapon))
    if (best.type) lines.push('Tipo: ' + best.type)
    if (best.category) lines.push('Categoria: ' + best.category)
    if (best.masteryReq != null) lines.push('Mastery Rank: ' + best.masteryReq)
    if (best.trigger) lines.push('Gatilho: ' + best.trigger)
    if (best.slot != null) lines.push('Slot: ' + best.slot)

    const stats = best.stats || {}
    const LABELS = {
      damage: 'Dano total', impact: 'Impact', puncture: 'Puncture', slash: 'Slash',
      heat: 'Heat', cold: 'Cold', electricity: 'Electricity', toxin: 'Toxin',
      viral: 'Viral', corrosive: 'Corrosive', radiation: 'Radiation', magnetic: 'Magnetic',
      gas: 'Gas', blast: 'Blast', critChance: 'Crit Chance (%)', critMultiplier: 'Crit Multiplier (x)',
      statusChance: 'Status Chance (%)', fireRate: 'Fire Rate (tiros/s)', chargeRate: 'Charge Rate (s)',
      magazineSize: 'Carregador', reloadTime: 'Recarga (s)', accuracy: 'Precisao', multishot: 'Multishot',
      punchThrough: 'Punch Through (m)', range: 'Alcance (m)', noise: 'Ruido', ammoType: 'Tipo de municao',
      disposition: 'Disposition (riven)'
    }

    let total = 0
    for (const [key, label] of Object.entries(LABELS)) {
      if (stats[key] == null) continue
      let val = stats[key]
      if (typeof val === 'number' && !Number.isInteger(val)) val = +val.toFixed(2)
      lines.push(label + ': ' + val)
      if (/damage|impact|puncture|slash|heat|cold|electricity|toxin|viral|corrosive|radiation|magnetic|gas|blast/i.test(key) && key !== 'damage') {
        total += Number(stats[key]) || 0
      }
    }
    if (total > 0 && !stats.damage) lines.push('Dano total (soma): ' + +total.toFixed(2))

    const secondary = best.attacks || best.secondary
    if (secondary && typeof secondary === 'object') {
      lines.push('')
      lines.push('Ataques secundarios:')
      for (const [atk, data] of Object.entries(secondary)) {
        if (!data || typeof data !== 'object') continue
        const parts = []
        if (data.name) parts.push(data.name)
        if (data.speed) parts.push('speed ' + data.speed)
        if (data.damage) parts.push('dmg ' + JSON.stringify(data.damage))
        if (parts.length) lines.push('- ' + atk + ': ' + parts.join(' | '))
      }
    }

    if (best.description) {
      lines.push('')
      lines.push('Descricao: ' + String(best.description).replace(/<[^>]+>/g, '').slice(0, 220))
    }
    if (best.wikiaUrl) lines.push('Wiki: ' + best.wikiaUrl)

    if (lines.length < 4) return null
    return '[STATS DA ARMA — FONTE CONFIRMADA]\n' + lines.join('\n')
  } catch (e) {
    console.error('retrieveWeaponStats:', e.message)
    return null
  }
}

function extractItemQuery(text) {
  let t = String(text || '')
  t = t.replace(/[?!.,;:]+/g, ' ')
  t = t.replace(/\b(pesquisa|pesquisar|busca|buscar|qual|quais|o|a|os|as|de|do|da|dos|das|um|uma|me|diz|fala|mostra|mostrar|preço|preco|plat|platinum|vale|pena|barato|caro|info|sobre|item|mod|arcane|set|r0|r10|r5|atual|agora|pra|para|por|favor)\b/gi, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  if (t.length < 3) return null
  return t.split(' ').slice(0, 8).join(' ')
}

async function retrieveWikiFacts(userMessage) {
  try {
    const query = String(userMessage || '').trim()
    if (!query) return null

    let search = query
      .replace(/[?!.,;:]+/g, ' ')
      .replace(/\b(qual|quais|quem|como|onde|quando|porque|por que|história|historia|sobre|me|diz|fala|explique|explica|mostrar|mostra|warframe|no|na|do|da|dos|das|o|a|os|as|um|uma|forma|maneira|jeito|pegar|conseguir|obter|consigo|posso|fazer|faz|para|pra|por|com|em|drop|chance|taxa|custo|quanto|quantas|montar|monta|comprar|compra|vendedor|loja|onde|farmar|farm|r5|rank|máximo|maximo)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (search.length < 3) search = query
    const originalSearch = query

    const searchUrl = 'https://wiki.warframe.com/api.php?' + new URLSearchParams({
      action: 'query', list: 'search', srsearch: search, srlimit: '5', format: 'json', origin: '*'
    })

    const searchResponse = await axios.get(searchUrl, { timeout: 15000 })
    let results = searchResponse.data && searchResponse.data.query && searchResponse.data.query.search

    if (!results || !results.length) {
      const fallbackUrl = 'https://wiki.warframe.com/api.php?' + new URLSearchParams({
        action: 'query', list: 'search', srsearch: originalSearch, srlimit: '5', format: 'json', origin: '*'
      })
      const fallbackResponse = await axios.get(fallbackUrl, { timeout: 15000 })
      results = fallbackResponse.data && fallbackResponse.data.query && fallbackResponse.data.query.search
    }

    if (!results || !results.length) return null

    const acquisitionQuestion = /\b(conseguir|obter|pegar|drop|chance|taxa|custo|quanto|quantas|montar|comprar|vendedor|loja|farmar|farm|r5|rank|máximo|maximo|como|onde|fazer|upar)\b/i.test(query)

    let pageTitle = results[0].title
    const normalizedQuery = query.toLowerCase()
    const exactResult = results.find((r) => {
      const title = String(r.title || '').toLowerCase()
      return normalizedQuery.includes(title) || title.includes(normalizedQuery)
    })
    if (exactResult) pageTitle = exactResult.title

    const pageUrl = 'https://wiki.warframe.com/api.php?' + new URLSearchParams({
      action: 'parse', page: pageTitle, prop: 'wikitext', format: 'json', origin: '*'
    })
    const pageResponse = await axios.get(pageUrl, { timeout: 15000 })
    const wikitext = pageResponse.data && pageResponse.data.parse && pageResponse.data.parse.wikitext && pageResponse.data.parse.wikitext['*']
    if (!wikitext) return null

    let text = String(wikitext)
      .replace(/\{\{[^{}]*\}\}/g, ' ')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\{\{[^]*?\}\}/g, ' ')
      .replace(/'''?/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) return null

    let extraFacts = ''
    if (acquisitionQuestion) {
      const extraSearchUrl = 'https://wiki.warframe.com/api.php?' + new URLSearchParams({
        action: 'query', list: 'search', srsearch: '"' + pageTitle + '"', srlimit: '5', format: 'json', origin: '*'
      })
      try {
        const extraResponse = await axios.get(extraSearchUrl, { timeout: 15000 })
        const extraResults = extraResponse.data && extraResponse.data.query && extraResponse.data.query.search
        if (extraResults && extraResults.length) extraFacts = extraResults.map((r) => r.title).filter(Boolean).join(', ')
      } catch (e) {}
    }

    text = clipText(text, acquisitionQuestion ? 8000 : 6000)

    let output = 'Fonte: WARFRAME Wiki\nPágina: ' + pageTitle + '\n'
    if (acquisitionQuestion) {
      output += 'Tipo de pergunta: obtenção/drop/custo/rank\n'
      if (extraFacts) output += 'Páginas relacionadas encontradas: ' + extraFacts + '\n'
    }
    output += 'Conteúdo:\n' + text
    return output
  } catch (e) {
    console.error('RAG wiki:', e.message)
    return null
  }
}

async function retrieveWarframeFacts(userMessage) {
  const q = String(userMessage || '').toLowerCase()
  const chunks = []

  try {
    const wsStats = await retrieveWeaponStats(userMessage)
    if (wsStats) chunks.push(wsStats)

    if (/preço|preco|plat|barato|caro|vale a pena|quanto|r0|r10|r5|mod|arcane|item|set\b/.test(q) || /primed |arcane |galvano|umbral|primed_/.test(q)) {
      const itemQ = extractItemQuery(userMessage)
      if (itemQ) {
        try {
          const resolved = await resolveItemSmart(itemQ)
          if (resolved) {
            const name = (resolved.item.i18n && resolved.item.i18n.en && resolved.item.i18n.en.name) || itemQ
            const maxRank = resolved.item.maxRank != null ? resolved.item.maxRank : 0
            const lines = ['Item: ' + name]
            if (maxRank > 0) {
              const o0 = await getTopOrders(resolved.slug, 0)
              const s0 = calcStatsFromOrders(o0.sell)
              const oM = await getTopOrders(resolved.slug, maxRank)
              const sM = calcStatsFromOrders(oM.sell)
              lines.push('R0 min: ' + (s0 ? s0.min + 'p' : '-'))
              lines.push('R' + maxRank + ' min: ' + (sM ? sM.min + 'p' : '-'))
            } else {
              const o = await getTopOrders(resolved.slug)
              const s = calcStatsFromOrders(o.sell)
              lines.push('Min sell: ' + (s ? s.min + 'p' : '-'))
              try {
                const setSlug = resolved.slug.endsWith('_set') ? resolved.slug : resolved.slug + '_set'
                const os = await getTopOrders(setSlug)
                const ss = calcStatsFromOrders(os.sell)
                if (ss) lines.push('Set min: ' + ss.min + 'p')
              } catch (e) {}
            }
            const desc = resolved.item.i18n && resolved.item.i18n.en && resolved.item.i18n.en.description
            if (desc) lines.push('Desc: ' + clipText(String(desc).replace(/\\n/g, ' '), 200))
            chunks.push(lines.join('\n'))
          } else {
            chunks.push('Item nao encontrado no Warframe Market para: ' + itemQ)
          }
        } catch (e) {
          console.error('RAG item:', e.message)
        }
      }
    }

    if (/arby|arbitra/.test(q)) {
      try { chunks.push(clipText(await formatArbyMessage(), 1200)) } catch (e) { console.error('RAG arby:', e.message) }
    }
    if (/ressurg|varzia|prime resurgence|rota(ç|c)(ã|a)o prime/.test(q)) {
      try { chunks.push(clipText(await getResurgence(), 1200)) } catch (e) { console.error('RAG ressurgencia:', e.message) }
    }
    if (/\bbaro\b|ki'?teer|void trader/.test(q)) {
      try { chunks.push(clipText(await getBaro(), 1200)) } catch (e) { console.error('RAG baro:', e.message) }
    }
    if (/incurs|steel path|caminho de a(ç|c)o/.test(q)) {
      try { chunks.push(clipText(await formatIncursionsMessage(), 1000)) } catch (e) { console.error('RAG incursao:', e.message) }
    }
    if (/zariman/.test(q)) {
      try { chunks.push(clipText(await formatOracleCycle('zariman'), 1000)) } catch (e) { console.error('RAG zariman:', e.message) }
    }
    if (/\blab\b|sanctum|entrati lab/.test(q)) {
      try { chunks.push(clipText(await formatOracleCycle('lab'), 1000)) } catch (e) { console.error('RAG lab:', e.message) }
    }
    if (/\bhex\b|1999|h[oö]llvania|hollvania/.test(q)) {
      try { chunks.push(clipText(await formatOracleCycle('hex'), 1000)) } catch (e) { console.error('RAG hex:', e.message) }
    }
  } catch (err) {
    console.error('RAG retrieve:', err.message)
  }

  try {
    const wiki = await retrieveWikiFacts(userMessage)
    if (wiki) chunks.push(clipText(wiki, 6500))
  } catch (e) {
    console.error('RAG wiki:', e.message)
  }

  if (!chunks.length) return null
  return chunks.join('\n\n---\n\n')
}

module.exports = { retrieveWeaponStats, retrieveWikiFacts, retrieveWarframeFacts, extractItemQuery }
