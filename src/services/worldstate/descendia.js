// src/services/worldstate/descendia.js
const axios = require('axios')
const { DESCENDIA_TYPES, DESCENDIA_CHALLENGES } = require('../../config/constants')
const { formatBR, formatBRDate } = require('../../utils/time')

function parseWFDate(obj) {
  try {
    if (!obj) return null
    if (typeof obj === 'number') return obj
    if (obj.$date && obj.$date.$numberLong) return Number(obj.$date.$numberLong)
    if (obj.$numberLong) return Number(obj.$numberLong)
    return null
  } catch (e) {
    return null
  }
}

function findDescents(obj, depth) {
  if (depth > 8 || !obj || typeof obj !== 'object') return null
  if (Array.isArray(obj.Descents)) return obj.Descents
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const f = findDescents(item, depth + 1)
      if (f) return f
    }
  } else {
    for (const k of Object.keys(obj)) {
      if (k === 'Descents' && Array.isArray(obj[k])) return obj[k]
      const f = findDescents(obj[k], depth + 1)
      if (f) return f
    }
  }
  return null
}

async function fetchOfficialWorldState() {
  const urls = ['https://api.warframe.com/cdn/worldState.php', 'https://content.warframe.com/dynamic/worldState.php']
  let lastErr = null
  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        timeout: 25000,
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/plain,*/*' },
        transformResponse: [(data) => {
          if (typeof data === 'object') return data
          try { return JSON.parse(data) } catch (e) { return data }
        }]
      })
      if (res.data && typeof res.data === 'object') return res.data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('WorldState indisponível')
}

function getDescendiaFromWS(worldState) {
  const descents = findDescents(worldState, 0)
  if (!Array.isArray(descents) || !descents.length) return null
  return { atual: descents[0], proximas: descents.slice(1, 5), all: descents.slice(0, 5) }
}

function descendiaToken(raw) {
  let s = String(raw == null ? '' : raw).trim()
  if (!s) return ''
  if (s.indexOf('/') !== -1) {
    const parts = s.split('/').filter(Boolean)
    s = parts[parts.length - 1] || s
  }
  s = s.replace(/^DT_/, '')
  return s
}

function descendiaLookupKeys(raw) {
  const token = descendiaToken(raw)
  if (!token) return []
  const spaced = token.replace(/_/g, ' ')
  const pretty = spaced.replace(/([a-z])([A-Z])/g, '$1 $2')
  const compact = token.replace(/[_\s]/g, '')
  const keys = [
    raw, token, spaced, pretty, token.toUpperCase(), spaced.toUpperCase(), pretty.toUpperCase(),
    compact, compact.toUpperCase(), compact.toLowerCase()
  ]
  const seen = {}
  const out = []
  for (const k of keys) {
    if (k != null && k !== '' && !seen[k]) { seen[k] = true; out.push(k) }
  }
  return out
}

function mapDescendia(dict, raw) {
  const keys = descendiaLookupKeys(raw)
  for (const k of keys) if (dict[k]) return dict[k]
  const t = descendiaToken(raw)
  if (!t) return '—'
  return t.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
}

function friendlyType(type) { return mapDescendia(DESCENDIA_TYPES, type) }
function friendlyChallenge(ch) {
  if (ch == null || ch === '') return '—'
  return mapDescendia(DESCENDIA_CHALLENGES, ch)
}

function formatDescentDetail(title, descent) {
  const start = parseWFDate(descent.Activation)
  const end = parseWFDate(descent.Expiry)
  let t = title + '\n'
  t += '📅 ' + formatBR(start) + ' → ' + formatBR(end) + '\n\n'

  const challenges = (descent.Challenges || []).slice().sort((a, b) => (a.Index || 0) - (b.Index || 0))
  if (!challenges.length) {
    t += '_No challenges listed._\n'
    return t
  }

  for (let i = 0; i < challenges.length; i++) {
    const c = challenges[i]
    const idx = String(i + 1).padStart(2, '0')
    const typeName = friendlyType(c.Type)
    const mod = friendlyChallenge(c.Challenge)
    const isFrame = /^(Wisp|Harrow|Devil)$/i.test(mod) || /^(Wisp|Harrow|Devil)$/i.test(typeName)

    if (isFrame) {
      const name = /^(Wisp|Harrow|Devil)$/i.test(mod) ? mod : typeName
      t += idx + '. *' + name + '*\n'
    } else if (!c.Challenge || mod === '—') {
      t += idx + '. *' + typeName + '*\n'
    } else {
      t += idx + '. *' + typeName + '* - ' + mod + '\n'
    }
  }
  return t
}

function formatDescentSummaryLine(label, descent) {
  const start = parseWFDate(descent.Activation)
  const end = parseWFDate(descent.Expiry)
  return label + '  ' + formatBRDate(start) + ' → ' + formatBRDate(end)
}

async function handleDescendiaCommand(arg) {
  const ws = await fetchOfficialWorldState()
  const data = getDescendiaFromWS(ws)
  if (!data) return { texts: ['❌ Descendia não encontrada no WorldState oficial.'] }

  const mode = (arg || '').trim().toLowerCase()

  if (mode === 'all') {
    const texts = []
    texts.push(formatDescentDetail('🔥 *DESCENDIA — ROTAÇÃO ATUAL*', data.atual).trim())
    data.proximas.forEach((d, i) => texts.push(formatDescentDetail('🔜 *DESCENDIA — +' + (i + 1) + '*', d).trim()))
    return { texts }
  }

  const num = parseInt(mode, 10)
  if (num >= 2 && num <= 5) {
    const idx = num - 2
    const d = data.proximas[idx]
    if (!d) return { texts: ['❌ Rotação +' + (num - 1) + ' não disponível.'] }
    return { texts: [formatDescentDetail('🔜 *DESCENDIA — ROTAÇÃO +' + (num - 1) + '*', d).trim()] }
  }

  const msg1 = formatDescentDetail('🔥 *DESCENDIA — ROTAÇÃO ATUAL*', data.atual).trim()
  let msg2 = '🔜 *PRÓXIMAS ROTAÇÕES*\n\n'
  if (!data.proximas.length) {
    msg2 += '_Nenhuma próxima listada._'
  } else {
    data.proximas.forEach((d, i) => { msg2 += formatDescentSummaryLine('*' + (i + 1) + '.*', d) + '\n' })
    msg2 += '\n💡 `!descendia 2` detalhe da próxima\n'
    msg2 += '💡 `!descendia 3` / `4` / `5`\n'
    msg2 += '💡 `!descendia all` envia todas (várias msgs)'
  }
  return { texts: [msg1, msg2] }
}

module.exports = { handleDescendiaCommand, fetchOfficialWorldState, getDescendiaFromWS }
