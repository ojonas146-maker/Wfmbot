// src/services/npc/npcCatalog.js
// Catálogo de vendedores (NPCs/sindicatos) do Warframe: o que cada um vende, preço no
// Rank 0 e no Rank Max, e quantos dias de farm de standing isso leva (cap diário por MR).
// Dados: data/syndicates_catalog.json

const fs = require('fs')
const path = require('path')

const CATALOG_FILE = path.join(__dirname, '..', '..', '..', 'data', 'syndicates_catalog.json')

// ---------------------------------------------------------------- utilidades

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function fmt(n) {
  return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Cap diário de standing por sindicato: 16.000 + 500 x Mastery Rank. */
function dailyCap(mr) {
  return 16000 + 500 * Number(mr)
}

function fmtDays(total, cap) {
  const d = Math.max(1, Math.ceil(total / cap))
  return d + (d === 1 ? ' dia' : ' dias')
}

const CURRENCY_LABEL = { standing: 'standing', tags: 'tags', fergolyte: 'fergolyte', luaThraxPlasm: 'Lua Thrax Plasm' }

// ---------------------------------------------------------------- carregamento / índice

let _cat = null
function loadCatalog() {
  if (_cat) return _cat
  const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'))
  const vendors = []

  for (const key of Object.keys(raw.factionSyndicates || {})) {
    const s = raw.factionSyndicates[key]
    vendors.push({
      id: 'faction:' + key,
      kind: 'faction',
      name: s.name,
      syndicate: s.name,
      area: 'Sindicato (Relay)',
      areaKey: 'faction',
      currency: 'standing',
      requiredRank: s.requiredRank,
      aliasExtra: [s.prefix, key],
      items: (s.items || []).map((it) => ({ name: it.name, type: it.type, cost: it.cost, currency: it.currency || 'standing', maxRank: null, copiesForMax: 1 }))
    })
  }

  for (const areaKey of Object.keys(raw.openWorld || {})) {
    const area = raw.openWorld[areaKey]
    for (const vKey of Object.keys(area.vendors || {})) {
      const v = area.vendors[vKey]
      vendors.push({
        id: areaKey + ':' + vKey,
        kind: 'npc',
        name: v.name,
        syndicate: v.syndicate,
        area: area.location,
        areaKey,
        currency: v.currency,
        aliasExtra: [vKey],
        items: (v.items || []).map((it) => ({
          name: it.name,
          type: it.type,
          cost: it.cost,
          currency: it.currency || (v.currency === 'mixed' ? 'standing' : v.currency),
          tags: it.tags || null,
          maxRank: it.maxRank == null ? null : it.maxRank,
          copiesForMax: it.copiesForMax || 1
        }))
      })
    }
  }

  // apelidos por vendedor: nome inteiro, cada pedaço do nome, sindicato, aliases extras
  for (const v of vendors) {
    const names = new Set()
    const parts = String(v.name).split(/[\/()]/).map((x) => x.trim()).filter(Boolean)
    for (const p of parts) names.add(p)
    names.add(v.name)
    for (const p of parts) for (const w of p.split(/\s+/)) if (norm(w).length >= 4) names.add(w)
    for (const a of v.aliasExtra || []) names.add(a)
    v.aliases = new Set([...names].map(norm).filter(Boolean))
    v.synKey = norm(v.syndicate)
    v.areaN = norm(v.area)
  }

  // sinônimos de região / sindicato para facilitar a busca
  const AREA_WORDS = {
    cetus: ['cetus', 'earth', 'terra', 'plainsofeidolon', 'planicies'],
    fortuna: ['fortuna', 'venus', 'orbvallis', 'vallis'],
    deimos: ['deimos', 'necralisk', 'cambionrift'],
    zariman: ['zariman', 'chrysalith', 'holdfast', 'holdfasts'],
    hex: ['hex', 'hollvania', 'thehex'],
    simaris: ['simaris', 'relay'],
    conclave: ['conclave', 'teshin']
  }
  _cat = { vendors, AREA_WORDS }
  return _cat
}

// ---------------------------------------------------------------- busca

/**
 * Acha vendedores para o texto digitado.
 * Prioridade: apelido exato -> apelido que contém o texto -> sindicato -> região.
 */
function findVendors(query) {
  const { vendors, AREA_WORDS } = loadCatalog()
  const q = norm(query)
  if (!q) return []

  let hits = vendors.filter((v) => v.aliases.has(q))
  if (hits.length) return hits

  hits = vendors.filter((v) => v.synKey === q)
  if (hits.length) return hits

  for (const areaKey of Object.keys(AREA_WORDS)) {
    if (AREA_WORDS[areaKey].includes(q)) {
      const inArea = vendors.filter((v) => v.areaKey === areaKey)
      if (inArea.length) return inArea
    }
  }

  if (q.length >= 3) {
    hits = vendors.filter((v) => [...v.aliases].some((a) => a.includes(q) || (q.length >= 4 && q.includes(a) && a.length >= 4)))
    if (hits.length) return hits
    hits = vendors.filter((v) => v.synKey.includes(q))
    if (hits.length) return hits
  }
  return []
}

function exactVendors(text) {
  const { vendors } = loadCatalog()
  const q = norm(text)
  if (!q) return []
  return vendors.filter((v) => v.aliases.has(q) || v.synKey === q)
}

// ---------------------------------------------------------------- interpretação do comando

const TYPE_WORDS = {
  arcane: 'arcane', arcanes: 'arcane', arcano: 'arcane', arcanos: 'arcane',
  mod: 'mod', mods: 'mod',
  riven: 'riven', rivens: 'riven',
  core: 'transmuteCore', cores: 'transmuteCore', transmute: 'transmuteCore',
  arma: 'weapon', armas: 'weapon', weapon: 'weapon', weapons: 'weapon'
}
const CURRENCY_WORDS = { standing: 'standing', tags: 'tags', tag: 'tags', fergolyte: 'fergolyte', plasm: 'luaThraxPlasm', lua: 'luaThraxPlasm', thrax: 'luaThraxPlasm' }
const SORT_WORDS = { caro: 'desc', caros: 'desc', dias: 'desc', demorado: 'desc', barato: 'asc', baratos: 'asc', nome: 'name', alfabetica: 'name' }

/**
 * @returns {{ query, mr, typeFilter, currencyFilter, sort, market }}
 * "little duck 25 arcane caro mercado"
 */
function parseNpcArgs(raw) {
  const tokens = String(raw || '').trim().split(/\s+/).filter(Boolean)
  const o = { query: '', mr: null, typeFilter: null, currencyFilter: null, sort: 'desc', market: false }
  const rest = []
  for (const t of tokens) {
    const k = norm(t)
    let m
    if (TYPE_WORDS[k]) { o.typeFilter = TYPE_WORDS[k]; continue }
    if (CURRENCY_WORDS[k]) { o.currencyFilter = CURRENCY_WORDS[k]; continue }
    if (SORT_WORDS[k]) { o.sort = SORT_WORDS[k]; continue }
    if (k === 'mercado' || k === 'market' || k === 'preco' || k === 'precos') { o.market = true; continue }
    if ((m = k.match(/^mr(\d{1,2})$/))) { o.mr = Number(m[1]); continue }
    rest.push(t)
  }

  // "bird 3" é um nome; "little duck 25" tem MR no fim. Só vale o texto inteiro se for um
  // apelido EXATO (senão o número no fim é a Mastery Rank).
  const whole = rest.join(' ')
  if (exactVendors(whole).length) {
    o.query = whole
    return o
  }
  const last = rest[rest.length - 1]
  if (last && /^\d{1,2}$/.test(last) && Number(last) <= 40) {
    o.mr = Number(last)
    o.query = rest.slice(0, -1).join(' ')
  } else {
    o.query = whole
  }
  return o
}

// ---------------------------------------------------------------- cálculo / formatação

function tagsText(tags) {
  return Object.keys(tags).map((k) => tags[k] + 'x ' + k.replace(/ Tag$/i, '')).join(' + ')
}

function itemTotals(it) {
  const ranked = it.maxRank != null && it.copiesForMax > 1
  return {
    ranked,
    r0: it.cost,
    max: it.cost != null ? it.cost * it.copiesForMax : null
  }
}

function applyFilters(items, o) {
  let list = items.slice()
  if (o.typeFilter) {
    if (o.typeFilter === 'weapon') list = list.filter((i) => ['primary', 'secondary', 'melee'].includes(i.type))
    else list = list.filter((i) => i.type === o.typeFilter)
  }
  if (o.currencyFilter) list = list.filter((i) => i.currency === o.currencyFilter)

  const key = (i) => {
    const t = itemTotals(i)
    return t.max != null ? t.max : (t.r0 != null ? t.r0 : -1)
  }
  if (o.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
  else if (o.sort === 'asc') list.sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name))
  else list.sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name))
  return list
}

const TYPE_TITLE = { arcane: '🔮 Arcanes', mod: '🧩 Mods', riven: '🎲 Rivens', transmuteCore: '⚗️ Transmute Cores', primary: '🔫 Armas primárias', secondary: '🔫 Armas secundárias', melee: '🗡️ Armas corpo a corpo' }
const TYPE_ORDER = ['arcane', 'mod', 'riven', 'transmuteCore', 'primary', 'secondary', 'melee']

function itemLines(it, mr, market) {
  const cur = CURRENCY_LABEL[it.currency] || it.currency
  const t = itemTotals(it)
  const cap = mr != null ? dailyCap(mr) : null
  const lines = []

  if (it.cost == null && it.tags) {
    lines.push('• *' + it.name + '* — ' + tagsText(it.tags))
  } else if (t.ranked) {
    const suf = it.currency === 'standing' ? '' : ' ' + cur
    lines.push('• *' + it.name + '* — R0: ' + fmt(t.r0) + suf + ' · Max (R' + it.maxRank + ', ' + it.copiesForMax + 'x): ' + fmt(t.max) + suf)
  } else {
    lines.push('• *' + it.name + '* — ' + fmt(it.cost) + ' ' + cur)
  }

  if (cap && it.currency === 'standing' && it.cost != null) {
    lines.push(t.ranked
      ? '   ⏱ R0: ' + fmtDays(t.r0, cap) + ' · Max: ' + fmtDays(t.max, cap)
      : '   ⏱ ' + fmtDays(t.r0, cap))
  }

  if (market && market[it.name]) {
    const m = market[it.name]
    const parts = []
    if (m.r0 != null) parts.push((t.ranked ? 'R0 ' : '') + '~' + m.r0 + 'p')
    if (t.ranked && m.max != null) parts.push('Max ~' + m.max + 'p')
    if (parts.length) lines.push('   💎 mercado: ' + parts.join(' · '))
    else lines.push('   💎 mercado: sem ofertas online')
  }
  return lines
}

/** Divide um texto longo em mensagens de até `limit` caracteres, quebrando em linhas. */
function chunkLines(lines, limit) {
  const out = []
  let cur = ''
  for (const ln of lines) {
    if ((cur + '\n' + ln).length > limit && cur) { out.push(cur); cur = ln } else cur = cur ? cur + '\n' + ln : ln
  }
  if (cur) out.push(cur)
  return out
}

/** Mensagens (texto) de um vendedor, já com filtros/ordenação/MR. */
function formatVendor(v, o, market) {
  const items = applyFilters(v.items, o)
  const head = []
  head.push('🏪 *' + v.name + '* — ' + v.syndicate + (v.area ? ' (' + v.area + ')' : ''))
  const curs = [...new Set(v.items.map((i) => CURRENCY_LABEL[i.currency] || i.currency))]
  head.push('Moeda: ' + curs.join(' / ') + (v.requiredRank ? ' · exige rank ' + v.requiredRank + ' no sindicato' : ''))
  if (o.mr != null) {
    head.push('📆 MR ' + o.mr + ' → cap diário: *' + fmt(dailyCap(o.mr)) + ' standing/dia* (por sindicato, reseta 00:00 UTC)')
  }
  const fl = []
  if (o.typeFilter) fl.push(o.typeFilter)
  if (o.currencyFilter) fl.push(o.currencyFilter)
  if (fl.length) head.push('Filtro: ' + fl.join(' + '))

  if (!items.length) {
    return [head.join('\n') + '\n\n_Nenhum item com esses filtros._']
  }

  const body = []
  const types = TYPE_ORDER.filter((t) => items.some((i) => i.type === t)).concat([...new Set(items.map((i) => i.type))].filter((t) => !TYPE_ORDER.includes(t)))
  for (const type of types) {
    const group = items.filter((i) => i.type === type)
    body.push('')
    body.push('*' + (TYPE_TITLE[type] || type) + '* (' + group.length + ')')
    for (const it of group) for (const ln of itemLines(it, o.mr, market)) body.push(ln)
  }

  const note = []
  if (o.mr != null) note.push('_Dias = standing necessário ÷ cap diário, sem contar o que você já tem._')
  const msgs = chunkLines(head.concat(body).concat(note.length ? [''].concat(note) : []), 3400)
  return msgs
}

/** Lista de vendedores disponíveis (quando o comando vem sem argumento). */
function listVendorsMessage() {
  const { vendors } = loadCatalog()
  const byArea = {}
  for (const v of vendors) {
    const k = v.area
    if (!byArea[k]) byArea[k] = []
    byArea[k].push(v)
  }
  let t = '🏪 *Vendedores disponíveis*\n_Use:_ `!npc <nome> [MR] [filtros]`\n'
  for (const area of Object.keys(byArea)) {
    t += '\n*' + area + '*\n'
    for (const v of byArea[area]) t += '• ' + v.name + ' — ' + v.syndicate + ' (' + v.items.length + ')\n'
  }
  t += '\n*Exemplos*\n' +
    '• `!npc little duck` — tudo que ele vende, com R0 e Max\n' +
    '• `!npc little duck 25` — + dias de farm para MR 25\n' +
    '• `!npc little duck 25 arcane barato` — só arcanes, do mais barato\n' +
    '• `!npc teasonai tags` — só o que se paga com tags\n' +
    '• `!npc fortuna` — todos os vendedores de Fortuna\n' +
    '• `!npc little duck mercado` — compara com o preço no warframe.market\n\n' +
    '*Filtros:* arcane · mod · riven · core · arma · standing · tags · fergolyte · plasm\n' +
    '*Ordem:* caro (padrão) · barato · nome'
  return t.trim()
}

module.exports = {
  loadCatalog, findVendors, parseNpcArgs, formatVendor, listVendorsMessage,
  applyFilters, dailyCap, fmtDays, fmt, norm
}
