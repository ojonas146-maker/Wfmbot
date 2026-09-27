// src/services/wfm/builds.js
// lookup_builds — portado do warframe-mcp (mpeciakk/warframe-mcp,
// api/overframe.ts + tools/builds.ts): builds da comunidade via scraping do
// Overframe.gg (sem API oficial, sem auth).
//
// CORRIGIDO DE NOVO (27/09/2026, 2ª rodada): testei ao vivo contra o site
// real e achei 2 problemas na correção anterior:
//  1) As categorias/URLs (https://overframe.gg/builds/<categoria>/ com
//     'warframes','primary-weapons','secondary-weapons','melee-weapons',
//     'archwing','sentinels') ESTAVAM certas — confirmado navegando no site.
//  2) O regex que dependia dos nomes de classe CSS do original
//     (BuildSummaryFull_build, BuildSummaryFull_title...) é frágil: o
//     Overframe usa CSS Modules do Next.js, cujos nomes de classe são
//     hasheados e mudam a cada novo deploy do site — é bem provável que
//     essa era a causa do "!builds mirage prime" estar dando erro. Troquei
//     por um parsing que NÃO depende de nenhuma classe CSS: só do padrão de
//     link (/build/{id}/{item-slug}/{title-slug}/, estável) + do texto
//     visível ao lado ("guide by AUTOR - N Forma VotesV", confirmado ao
//     vivo no HTML atual do site). O título da build agora vem do próprio
//     slug da URL (sempre confiável) em vez de tentar casar uma classe CSS.
const axios = require('axios')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CATEGORIES = ['warframes', 'primary-weapons', 'secondary-weapons', 'melee-weapons', 'archwing', 'sentinels']
const CATALOG_TTL = 6 * 60 * 60 * 1000 // 6h

const listCache = {}
const detailCache = {}

async function fetchHtml(path) {
  const res = await axios.get('https://overframe.gg' + path, { timeout: 20000, headers: { 'User-Agent': UA, Accept: 'text/html' } })
  return String(res.data || '')
}

function inferCategory(name) {
  const t = String(name || '').toLowerCase()
  if (t.includes('prime') || t.includes('warframe') || t.includes('frame')) return 'warframes'
  return null
}

function normalizeToSlug(q) {
  return String(q || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function slugToTitle(slug) {
  return String(slug || '')
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

// Extrai __NEXT_DATA__ (JSON de hidratação Next.js) de uma página do Overframe.
function extractNextData(html) {
  const marker = '<script id="__NEXT_DATA__" type="application/json">'
  const start = String(html || '').indexOf(marker)
  if (start === -1) return null
  const jsonStart = start + marker.length
  const end = html.indexOf('</script>', jsonStart)
  if (end === -1) return null
  try {
    return JSON.parse(html.substring(jsonStart, end))
  } catch (e) {
    return null
  }
}

// Lista de builds de uma categoria. Não depende de classes CSS: só do
// padrão de link /build/{id}/{item-slug}/{title-slug}/ e do texto plano
// logo depois ("guide by AUTOR - N Forma VotesV").
async function getBuildList(category) {
  const now = Date.now()
  const cached = listCache[category]
  if (cached && (now - cached.at) < CATALOG_TTL) return cached.builds

  const html = await fetchHtml('/builds/' + category + '/')
  const builds = []
  const linkRe = /href="\/build\/(\d+)\/([a-z0-9-]+)\/([a-z0-9-]+)\/"/gi
  const seen = new Set()
  let m
  while ((m = linkRe.exec(html))) {
    const id = parseInt(m[1], 10)
    if (seen.has(id)) continue
    seen.add(id)

    const windowText = stripTags(html.substring(m.index, m.index + 1200))
    const gm = windowText.match(/guide by\s+([^-]+?)\s*-\s*(\d+)\s*Forma\s*Votes\s*(\d+)/i)

    builds.push({
      id,
      url: '/build/' + id + '/' + m[2] + '/' + m[3] + '/',
      itemSlug: m[2],
      title: slugToTitle(m[3]),
      author: gm ? gm[1].trim() : 'unknown',
      forma: gm ? parseInt(gm[2], 10) : 0,
      votes: gm ? parseInt(gm[3], 10) : 0
    })
  }

  builds.sort((a, b) => b.votes - a.votes)
  listCache[category] = { at: now, builds }
  return builds
}

async function getTopBuilds(category, itemName, limit) {
  let builds = await getBuildList(category)
  if (itemName) {
    const slug = normalizeToSlug(itemName)
    builds = builds.filter((b) => b.itemSlug === slug || b.itemSlug.includes(slug) || slug.includes(b.itemSlug))
  }
  return builds.slice(0, limit)
}

async function getBuildDetail(buildId) {
  const now = Date.now()
  const cached = detailCache[buildId]
  if (cached && (now - cached.at) < CATALOG_TTL) return cached.props

  const html = await fetchHtml('/build/' + buildId + '/')
  const nextData = extractNextData(html)
  const pageProps = nextData && nextData.props && nextData.props.pageProps
  if (!pageProps || !pageProps.data) return null

  detailCache[buildId] = { at: now, props: pageProps }
  return pageProps
}

// Nomes de mod do guideMarkdown: links [Nome](/items/arsenal/{id}/slug/)
// ou [[Nome]](/items/arsenal/{id}/slug/) (confirmado ao vivo nos dois formatos).
function extractModNames(guideMarkdown) {
  // Aceita link relativo (/items/arsenal/...) ou absoluto (https://overframe.gg/items/arsenal/...)
  const modRe = /\[{1,2}([^\]]+?)\]{1,2}\((?:https?:\/\/overframe\.gg)?\/items\/arsenal\/(\d+)\/[^)]+\)/g
  const mods = []
  const seen = new Set()
  let m
  while ((m = modRe.exec(String(guideMarkdown || '')))) {
    const id = parseInt(m[2], 10)
    if (seen.has(id)) continue
    seen.add(id)
    mods.push(m[1].trim())
    if (mods.length >= 12) break // guia costuma citar dezenas de mods (arsenal/sentinela); corta pros mais relevantes
  }
  return mods
}

function formatBuildStats(stats) {
  stats = stats || {}
  const lines = []
  const ability = []
  if (stats.AVATAR_ABILITY_STRENGTH != null) ability.push('Strength: ' + Math.round(stats.AVATAR_ABILITY_STRENGTH * 100) + '%')
  if (stats.AVATAR_ABILITY_DURATION != null) ability.push('Duration: ' + Math.round(stats.AVATAR_ABILITY_DURATION * 100) + '%')
  if (stats.AVATAR_ABILITY_RANGE != null) ability.push('Range: ' + Math.round(stats.AVATAR_ABILITY_RANGE * 100) + '%')
  if (stats.AVATAR_ABILITY_EFFICIENCY != null) ability.push('Efficiency: ' + Math.round(stats.AVATAR_ABILITY_EFFICIENCY * 100) + '%')
  if (ability.length) lines.push('⚡ ' + ability.join(' | '))

  const surv = []
  if (stats.AVATAR_HEALTH_MAX != null) surv.push('Health: ' + Math.round(stats.AVATAR_HEALTH_MAX))
  if (stats.AVATAR_SHIELD_MAX != null) surv.push('Shield: ' + Math.round(stats.AVATAR_SHIELD_MAX))
  if (stats.AVATAR_ARMOUR != null) surv.push('Armor: ' + Math.round(stats.AVATAR_ARMOUR))
  if (stats.AVATAR_POWER_MAX != null) surv.push('Energy: ' + Math.round(stats.AVATAR_POWER_MAX))
  if (surv.length) lines.push('❤️ ' + surv.join(' | '))

  return lines
}

async function formatBuildDetail(props, rank, fallback) {
  if (!props) {
    return rank + '. *' + fallback.title + '*\n   👤 ' + fallback.author + ' | 👍 ' + fallback.votes + ' votos | 🔧 ' + fallback.forma + ' Forma\n   🔗 https://overframe.gg' + fallback.url
  }

  const { data, item, guideMarkdown } = props
  const lines = []
  lines.push(rank + '. *' + (data.title || fallback.title) + '*')
  lines.push('   👤 ' + (data.author ? data.author.username : fallback.author) + ' | 👍 ' + (data.score != null ? data.score : fallback.votes) + ' votos | 🔧 ' + (data.formas != null ? data.formas : fallback.forma) + ' Forma')
  if (item && item.name) lines.push('   🎯 ' + item.name + (data.item_rank != null ? ' (Rank ' + data.item_rank + ')' : ''))

  const statLines = formatBuildStats(data.stats)
  if (statLines.length) lines.push('   ' + statLines.join('\n   '))

  const mods = extractModNames(guideMarkdown)
  if (mods.length) lines.push('   🧩 Mods citados no guia: ' + mods.join(', '))

  lines.push('   🔗 https://overframe.gg' + (data.url || fallback.url))
  return lines.join('\n')
}

async function lookupBuildsOne(name, opts) {
  opts = opts || {}
  const limit = Math.max(1, Math.min(opts.limit || 3, 5))
  try {
    let category = opts.category || inferCategory(name)
    let builds = category ? await getTopBuilds(category, name, limit) : []

    if (!builds.length) {
      const toTry = CATEGORIES.filter((c) => c !== category)
      for (const cat of toTry) {
        builds = await getTopBuilds(cat, name, limit)
        if (builds.length) { category = cat; break }
      }
    }

    if (!builds.length) {
      return '❌ *' + name + '*: nenhuma build encontrada no Overframe.gg entre as mais votadas.\n' +
        '_(o scraper só lê a lista de builds mais votadas de cada categoria — itens menos populares podem não aparecer)_\n' +
        '🔗 https://overframe.gg/builds/warframes/'
    }

    let block = '🛠️ *Top builds — ' + name + '* _(Overframe.gg, categoria: ' + category + ')_\n\n'

    const details = await Promise.all(builds.map((b) => getBuildDetail(b.id).catch(() => null)))
    const parts = []
    for (let i = 0; i < builds.length; i++) {
      parts.push(await formatBuildDetail(details[i], i + 1, builds[i]))
    }
    block += parts.join('\n\n')

    return block.trim()
  } catch (err) {
    console.error('lookupBuilds:', name, err.message)
    return '❌ Erro ao buscar builds de *' + name + '* no Overframe.gg. (' + err.message + ')'
  }
}

async function lookupBuilds(itemNames, opts) {
  const names = Array.isArray(itemNames) ? itemNames : [itemNames]
  const blocks = []
  for (const n of names) blocks.push(await lookupBuildsOne(n, opts))
  return blocks.join('\n\n' + '─'.repeat(18) + '\n\n')
}

module.exports = { lookupBuilds, getTopBuilds, getBuildDetail }
