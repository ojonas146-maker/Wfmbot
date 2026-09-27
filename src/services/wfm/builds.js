// src/services/wfm/builds.js
// lookup_builds — portado do warframe-mcp (mpeciakk/warframe-mcp,
// api/overframe.ts + tools/builds.ts): builds da comunidade via scraping do
// Overframe.gg (sem API oficial, sem auth).
//
// Estratégia (validada contra o HTML real do site em 27/09/2026):
//  1) Resolve nome → {id, slug} usando as páginas de categoria
//     https://overframe.gg/items/<warframe|weapon|pet|archwing|mech>/
//     (cacheadas 6h — mesmo TTL do projeto original pra builds do Overframe).
//  2) Busca https://overframe.gg/items/arsenal/<id>/<slug>/ (ordenado por
//     RATING por padrão = top votados) e extrai título/autor/forma/votos de
//     cada build listada.
//  3) Pra build #1 (mais votada), busca a página da build e extrai as stats
//     computadas (energy/health/shield/duration/efficiency/range/strength/
//     armor/EHP) — o Overframe não expõe a lista de mods em texto puro no
//     HTML (só ícones), então o mod-list fica só no link da build.
//
// Scraping de HTML é frágil por natureza: se o Overframe mudar o markup,
// as funções aqui devem falhar de forma graciosa (link direto de fallback)
// em vez de quebrar o comando.
const axios = require('axios')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CATEGORY_SLUGS = ['warframe', 'weapon', 'pet', 'archwing', 'mech']
const CATALOG_TTL = 6 * 60 * 60 * 1000 // 6h — igual ao cache de builds do projeto original

const catalogCache = {} // categoria -> { at, items: [{id, slug, name}] }

async function fetchHtml(url) {
  const res = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': UA, Accept: 'text/html' } })
  return String(res.data || '')
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim()
}

async function getCategoryCatalog(category) {
  const now = Date.now()
  const cached = catalogCache[category]
  if (cached && (now - cached.at) < CATALOG_TTL) return cached.items

  const html = await fetchHtml('https://overframe.gg/items/' + category + '/')
  const items = []
  const re = /<a[^>]+href="\/items\/arsenal\/(\d+)\/([a-z0-9-]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html))) {
    const name = stripTags(m[3])
    if (!name) continue
    items.push({ id: m[1], slug: m[2], name })
  }
  catalogCache[category] = { at: now, items }
  return items
}

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

async function resolveOverframeItem(name, category) {
  const target = normalize(name)
  if (!target) return null
  const cats = category ? [category] : CATEGORY_SLUGS
  for (const cat of cats) {
    try {
      const items = await getCategoryCatalog(cat)
      let best = items.find((it) => normalize(it.name) === target)
      if (!best) best = items.find((it) => normalize(it.name).indexOf(target) !== -1)
      if (!best) best = items.find((it) => target.indexOf(normalize(it.name)) !== -1)
      if (best) return { id: best.id, slug: best.slug, name: best.name, category: cat }
    } catch (e) {
      // tenta a próxima categoria
    }
  }
  return null
}

function parseBuildsListing(html, limit) {
  const out = []
  const anchorRe = /<a[^>]+href="(?:https:\/\/overframe\.gg)?(\/build\/\d+\/[a-z0-9-]+\/[a-z0-9-]+\/)"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = anchorRe.exec(html)) && out.length < limit) {
    const url = 'https://overframe.gg' + m[1]
    const text = stripTags(m[2])
    const gm = text.match(/guide by\s+(.+?)\s*-\s*(\d+)\s*Forma\s*Votes\s*(\d+)/i)
    if (!gm) continue
    const author = gm[1].trim()
    const forma = Number(gm[2])
    const votes = Number(gm[3])
    let title = text.split(/guide by/i)[0].trim()
    // o Overframe repete "Nome do Item" antes do título do guia — remove a duplicata
    const half = title.slice(0, Math.floor(title.length / 2))
    if (half && title === half + half) title = half
    out.push({ title: title || '(sem título)', author, forma, votes, url })
  }
  return out
}

async function getBuildStats(url) {
  try {
    const html = await fetchHtml(url)
    const statNames = ['ENERGY', 'HEALTH', 'SHIELD', 'SPRINT SPEED', 'DURATION', 'EFFICIENCY', 'RANGE', 'STRENGTH', 'ARMOR', 'Damage Reduction', 'EFFECTIVE HIT POINTS']
    const text = stripTags(html)
    const stats = {}
    for (const name of statNames) {
      const re = new RegExp(name.replace(/\s+/g, '\\s+') + '\\s+([\\d.,%]+)', 'i')
      const mm = text.match(re)
      if (mm) stats[name] = mm[1]
    }
    return stats
  } catch (e) {
    return null
  }
}

async function lookupBuildsOne(name, opts) {
  opts = opts || {}
  const limit = Math.max(1, Math.min(opts.limit || 3, 5))
  try {
    const resolved = await resolveOverframeItem(name, opts.category)
    if (!resolved) return '❌ *' + name + '*: não encontrado no Overframe.gg.\n🔗 https://overframe.gg/items/all/'

    const listUrl = 'https://overframe.gg/items/arsenal/' + resolved.id + '/' + resolved.slug + '/'
    const html = await fetchHtml(listUrl)
    const builds = parseBuildsListing(html, limit)

    if (!builds.length) return '⚠️ *' + resolved.name + '*: nenhuma build encontrada.\n🔗 ' + listUrl

    let block = '🛠️ *Top builds — ' + resolved.name + '* _(Overframe.gg, ordenado por votos)_\n\n'
    for (let i = 0; i < builds.length; i++) {
      const b = builds[i]
      block += (i + 1) + '. *' + b.title + '*\n'
      block += '   👤 ' + b.author + ' | 👍 ' + b.votes + ' votos | 🔧 ' + b.forma + ' Forma\n'
      block += '   🔗 ' + b.url + '\n'
    }

    const top = builds[0]
    const stats = await getBuildStats(top.url)
    if (stats && Object.keys(stats).length) {
      block += '\n📊 *Stats computadas da build #1* _(mods não são extraíveis do HTML — veja o link)_\n'
      for (const [k, v] of Object.entries(stats)) block += '• ' + k + ': ' + v + '\n'
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

module.exports = { lookupBuilds, resolveOverframeItem }
