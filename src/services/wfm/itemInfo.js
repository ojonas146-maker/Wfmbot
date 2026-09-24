// src/services/wfm/itemInfo.js
// Comando !i — ficha de item: primeiro tenta warframe.market (com preços),
// se não achar cai pra wiki (sem preços, mas com resumo).
const axios = require('axios')
const { POLARITY_SYMBOL } = require('../../config/constants')
const { resolveItem, getTopOrders, calcStatsFromOrders } = require('./client')

function cleanGameText(text) {
  if (!text) return ''
  let t = String(text)
  t = t.replace(/\\n/g, '\n').replace(/\r/g, '')

  const dmg = {
    DT_FIRE_COLOR: 'Heat', DT_FREEZE_COLOR: 'Cold', DT_ELECTRICITY_COLOR: 'Electricity',
    DT_POISON_COLOR: 'Toxin', DT_EXPLOSION_COLOR: 'Blast', DT_RADIATION_COLOR: 'Radiation',
    DT_GAS_COLOR: 'Gas', DT_MAGNETIC_COLOR: 'Magnetic', DT_VIRAL_COLOR: 'Viral',
    DT_CORROSIVE_COLOR: 'Corrosive', DT_IMPACT_COLOR: 'Impact', DT_PUNCTURE_COLOR: 'Puncture',
    DT_SLASH_COLOR: 'Slash', DT_SENTIENT_COLOR: 'Tau', DT_RADIANT_COLOR: 'Void'
  }
  for (const [tag, name] of Object.entries(dmg)) {
    const re = new RegExp('<' + tag + '>([^<]*)(?:</' + tag + '>|<' + tag + '>\\1)?', 'gi')
    t = t.replace(re, name)
    t = t.replace(new RegExp('<' + tag + '>', 'gi'), '')
    t = t.replace(new RegExp('</' + tag + '>', 'gi'), '')
  }

  t = t.replace(/<\/?[A-Z0-9_]+>/gi, '')
  t = t.replace(/\b(LOWER_IS_BETTER|HIGHER_IS_BETTER)\b/gi, '')
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  const uniq = []
  const seen = {}
  for (const line of lines) {
    const key = line.toLowerCase()
    if (seen[key]) continue
    seen[key] = true
    uniq.push(line)
  }
  return uniq.join('\n')
}

async function getWikiExtract(query) {
  try {
    const url = 'https://wiki.warframe.com/api.php?' + new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '1',
      prop: 'extracts', explaintext: '1', exsectionformat: 'plain', redirects: '1', format: 'json', origin: '*'
    })
    const res = await axios.get(url, { timeout: 15000 })
    const pages = res.data && res.data.query && res.data.query.pages
    if (!pages) return null
    const firstKey = Object.keys(pages)[0]
    if (!firstKey) return null
    const page = pages[firstKey]
    if (!page || !page.extract || page.extract.length < 40) return null
    return { title: page.title, extract: page.extract }
  } catch (e) {
    console.error('getWikiExtract:', e.message)
    return null
  }
}

async function getItemInfoCommand(query) {
  try {
    const resolved = await resolveItem(query)

    if (!resolved) {
      const wiki = await getWikiExtract(query)
      if (wiki) {
        let extract = String(wiki.extract).replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
        if (extract.length > 3200) extract = extract.slice(0, 3200).trim() + '...'
        const url = 'https://wiki.warframe.com/w/' + encodeURIComponent(wiki.title.replace(/ /g, '_'))
        return '📜 *' + wiki.title + '* _(Wiki)_\n\n' + extract + '\n\n🔗 ' + url
      }
      return '❌ Nada encontrado para *' + query + '*.\n\nTente:\n• Nome exato (ex: `kuva`, `helminth`, `acolyte`)\n• `!g <pergunta>` pra IA responder\n• `!drops <item>` se for farm'
    }

    const item = resolved.item
    const slug = resolved.slug
    const name = (item.i18n && item.i18n.en && item.i18n.en.name) ? item.i18n.en.name : query
    const desc = (item.i18n && item.i18n.en && item.i18n.en.description) ? item.i18n.en.description.replace(/\\n/g, '\n') : ''
    const maxRank = item.maxRank != null ? item.maxRank : 0
    const rarity = item.rarity ? String(item.rarity) : ''

    let polarity = null, baseDrain = null, fusionLimit = maxRank, compat = null, levelStats = null, wsType = null
    try {
      const wsRes = await axios.get('https://api.warframestat.us/items/search/' + encodeURIComponent(name), { timeout: 15000 })
      const list = Array.isArray(wsRes.data) ? wsRes.data : []
      let best = null
      const q = name.toLowerCase()
      for (const it of list) {
        if ((it.name || '').toLowerCase() === q) { best = it; break }
      }
      if (!best && list.length) best = list[0]
      if (best) {
        polarity = best.polarity || null
        baseDrain = best.baseDrain != null ? best.baseDrain : null
        fusionLimit = best.fusionLimit != null ? best.fusionLimit : maxRank
        compat = best.compatName || best.type || null
        levelStats = best.levelStats || null
        wsType = best.type || best.category || null
      }
    } catch (e) {}

    let price0 = null, priceMax = null
    try {
      if (maxRank > 0) {
        const o0 = await getTopOrders(slug, 0)
        const s0 = calcStatsFromOrders(o0.sell)
        if (s0) price0 = s0.min
        const oM = await getTopOrders(slug, maxRank)
        const sM = calcStatsFromOrders(oM.sell)
        if (sM) priceMax = sM.min
      } else {
        const o = await getTopOrders(slug)
        const s = calcStatsFromOrders(o.sell)
        if (s) price0 = s.min
      }
    } catch (e) {}

    let reply = '📜 *' + name + '*\n'
    if (wsType || rarity) {
      reply += (wsType || '') + (wsType && rarity ? ' | ' : '') + (rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : '') + '\n'
    }
    reply += '\n'

    if (polarity || baseDrain != null) {
      const polKey = polarity ? String(polarity).toLowerCase() : ''
      const polSym = POLARITY_SYMBOL[polKey] || (polarity || '')
      if (polarity) reply += 'Polaridade: *' + polSym + '* (' + polarity + ')\n'
      if (baseDrain != null) {
        const maxD = baseDrain + (fusionLimit || maxRank || 0)
        reply += 'Drain: *' + baseDrain + '* → *' + maxD + '*\n'
      }
      if (compat) reply += 'Compat: *' + compat + '*\n'
      reply += '\n'
    }

    reply += '💰 *Preços (ingame)*\n'
    if (maxRank > 0) {
      reply += '• R0: *' + (price0 != null ? price0 + 'p' : '—') + '*\n'
      reply += '• R' + maxRank + ': *' + (priceMax != null ? priceMax + 'p' : '—') + '*\n'
    } else {
      reply += '• Min: *' + (price0 != null ? price0 + 'p' : '—') + '*\n'
    }

    let effect = ''
    if (levelStats && levelStats.length) {
      const last = levelStats[levelStats.length - 1]
      const stats = (last && last.stats) ? last.stats : []
      effect = stats.filter(Boolean).join('\n')
    }
    if (!effect && desc) effect = desc
    if (effect) reply += '\n📌 *Efeito (max)*\n' + cleanGameText(effect) + '\n'

    return reply.trim()
  } catch (err) {
    console.error('Erro !i:', err.message)
    return '❌ Erro ao buscar info do item.'
  }
}

module.exports = { getItemInfoCommand, getWikiExtract, cleanGameText }
