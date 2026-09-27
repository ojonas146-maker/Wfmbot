// src/services/wfm/builds.js
// lookup_builds — portado do warframe-mcp (mpeciakk/warframe-mcp,
// api/overframe.ts + tools/builds.ts): builds da comunidade via scraping do
// Overframe.gg (sem API oficial, sem auth).
//
// CORRIGIDO (comparado com o original em 27/09/2026):
//  - A v1 usava https://overframe.gg/items/<categoria>/ pra resolver
//    nome→id/slug (categorias 'warframe','weapon','pet','archwing','mech').
//    Esse endpoint/categorias não existem no projeto original — o certo é
//    https://overframe.gg/builds/<categoria>/ (categorias
//    'warframes','primary-weapons','secondary-weapons','melee-weapons',
//    'archwing','sentinels'), que já lista builds filtráveis por slug do
//    item, sem precisar resolver id antes.
//  - A v1 dizia que "o Overframe não expõe mods em texto, só ícones" — isso
//    é falso. A página de uma build carrega um bloco
//    <script id="__NEXT_DATA__" type="application/json"> com o JSON de
//    hidratação do Next.js, que inclui `guideMarkdown` (com links
//    [Nome do Mod](/items/arsenal/{modId}/...)) e `buildState.mods` (ids
//    dos mods equipados). Agora extraímos a lista de mods de verdade.
const axios = require('axios')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CATEGORIES = ['warframes', 'primary-weapons', 'secondary-weapons', 'melee-weapons', 'archwing', 'sentinels']
const CATALOG_TTL = 6 * 60 * 60 * 1000 // 6h — igual ao cache de builds do projeto original

const listCache = {} // categoria -> { at, builds: [{id, url, title, author, votes, forma}] }
const detailCache = {} // buildId -> { at, props }

async function fetchHtml(path) {
  const res = await axios.get('https://overframe.gg' + path, { timeout: 20000, headers: { 'User-Agent': UA, Accept: 'text/html' } })
  return String(res.data || '')
}

// Infere a categoria do Overframe a partir do nome do item (mesma heurística do original).
function inferCategory(name) {
  const t = String(name || '').toLowerCase()
  if (t.includes('prime') || t.includes('warframe') || t.includes('frame')) return 'warframes'
  return null // sem pista clara — tenta warframes primeiro e depois varre o resto, igual ao original
}

function normalizeToSlug(q) {
  return String(q || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function getItemSlugFromUrl(url) {
  const parts = String(url || '').split('/').filter(Boolean)
  // formato: build / {id} / {item-slug} / {title-slug}
  return parts.length >= 3 ? parts[2] : ''
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

async function getBuildList(category) {
  const now = Date.now()
  const cached = listCache[category]
  if (cached && (now - cached.at) < CATALOG_TTL) return cached.builds

  const html = await fetchHtml('/builds/' + category + '/')
  const builds = []
  const linkRe = /href="\/build\/(\d+)\/([^/]+)\/([^/]+)\/"[^>]*class="BuildSummaryFull_build[^"]*"/g
  const seen = new Set()
  let m
  while ((m = linkRe.exec(html))) {
    const id = parseInt(m[1], 10)
    if (seen.has(id)) continue
    seen.add(id)

    const after = html.substring(m.index, m.index + 2000)
    const titleMatch = after.match(/BuildSummaryFull_title[^"]*"[^>]*>([^<]+)</)
    const authorMatch = after.match(/BuildSummaryFull_blue[^"]*"[^>]*>[^<]+<\/span>[\s\S]*?BuildSummaryFull_blue[^"]*"[^>]*>([^<]+)</)
    const votesMatch = after.match(/BuildSummaryFull_buildVotes[\s\S]*?<dd>(\d+)<\/dd>/)
    const formaMatch = after.match(/(\d+)<!-- --> Forma/)

    builds.push({
      id,
      url: '/build/' + id + '/' + m[2] + '/' + m[3] + '/',
      itemSlug: m[2],
      title: titleMatch ? titleMatch[1] : m[3].replace(/-/g, ' '),
      author: authorMatch ? authorMatch[1] : 'unknown',
      votes: votesMatch ? parseInt(votesMatch[1], 10) : 0,
      forma: formaMatch ? parseInt(formaMatch[1], 10) : 0
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
    builds = builds.filter((b) => b.itemSlug.includes(slug) || slug.includes(b.itemSlug))
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

// Extrai nomes de mod do guideMarkdown: links no formato
// [Nome do Mod](/items/arsenal/{modId}/slug/). Se `equippedModIds` for
// passado, filtra só os mods realmente equipados no slot da build.
function extractModNames(guideMarkdown, equippedModIds) {
  const modRe = /\[\\?\[?([^\]]+?)\\?\]?\]\(\/items\/arsenal\/(\d+)\/[^)]+\)/g
  const mods = []
  const seen = new Set()
  let m
  while ((m = modRe.exec(String(guideMarkdown || '')))) {
    const name = m[1].replace(/\\/g, '').trim()
    const id = parseInt(m[2], 10)
    if (seen.has(id)) continue
    seen.add(id)
    if (equippedModIds && equippedModIds.size && !equippedModIds.has(id)) continue
    mods.push(name)
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
  if (stats.AVATAR_SPRINT_SPEED != null) surv.push('Sprint: ' + Number(stats.AVATAR_SPRINT_SPEED).toFixed(2))
  if (surv.length) lines.push('❤️ ' + surv.join(' | '))

  return lines
}

async function formatBuildDetail(props, rank) {
  const { data, item, guideMarkdown } = props
  const lines = []
  lines.push((rank) + '. *' + data.title + '*')
  lines.push('   👤 ' + data.author.username + ' | 👍 ' + data.score + ' votos | 🔧 ' + data.formas + ' Forma')
  if (item && item.name) lines.push('   🎯 ' + item.name + ' (Rank ' + data.item_rank + ')')

  const statLines = formatBuildStats(data.stats)
  if (statLines.length) lines.push('   ' + statLines.join('\n   '))

  const equippedModIds = new Set()
  if (props.buildState && Array.isArray(props.buildState.mods)) {
    for (const m of props.buildState.mods) if (m.modId > 0) equippedModIds.add(m.modId)
  }
  const mods = extractModNames(guideMarkdown, equippedModIds)
  if (mods.length) {
    lines.push('   🧩 Mods: ' + mods.join(', '))
  } else if (data.slots && data.slots.some((s) => s.mod > 0)) {
    lines.push('   🧩 ' + data.slots.filter((s) => s.mod > 0).length + ' mods equipados (nomes indisponíveis nesse parse — veja o link)')
  }

  lines.push('   🔗 https://overframe.gg' + data.url)
  return lines.join('\n')
}

async function lookupBuildsOne(name, opts) {
  opts = opts || {}
  const limit = Math.max(1, Math.min(opts.limit || 3, 5))
  try {
    let category = opts.category || inferCategory(name)
    let builds = category ? await getTopBuilds(category, name, limit) : []

    // Sem categoria clara (ou sem resultado): varre as outras, igual ao original.
    if (!builds.length) {
      const toTry = CATEGORIES.filter((c) => c !== category)
      for (const cat of toTry) {
        builds = await getTopBuilds(cat, name, limit)
        if (builds.length) { category = cat; break }
      }
    }

    if (!builds.length) {
      return '❌ *' + name + '*: nenhuma build encontrada no Overframe.gg.\n🔗 https://overframe.gg/builds/warframes/'
    }

    let block = '🛠️ *Top builds — ' + name + '* _(Overframe.gg, categoria: ' + category + ')_\n\n'

    const details = await Promise.all(builds.map((b) => getBuildDetail(b.id).catch(() => null)))
    for (let i = 0; i < builds.length; i++) {
      const detail = details[i]
      if (detail) {
        block += (await formatBuildDetail(detail, i + 1)) + '\n\n'
      } else {
        const b = builds[i]
        block += (i + 1) + '. *' + b.title + '*\n   👤 ' + b.author + ' | 👍 ' + b.votes + ' votos | 🔧 ' + b.forma + ' Forma\n   🔗 https://overframe.gg' + b.url + '\n\n'
      }
    }

    return block.trim()
  } catch (err) {
    console.error('lookupBuilds:', name, err.message)
    return '❌ Erro ao buscar builds de *' + name + '* no Overframe.gg.'
  }
}

async function lookupBuilds(itemNames, opts) {
  const names = Array.isArray(itemNames) ? itemNames : [itemNames]
  const blocks = []
  for (const n of names) blocks.push(await lookupBuildsOne(n, opts))
  return blocks.join('\n\n' + '─'.repeat(18) + '\n\n')
}

module.exports = { lookupBuilds, getTopBuilds, getBuildDetail }
