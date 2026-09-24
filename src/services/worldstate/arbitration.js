// src/services/worldstate/arbitration.js
// Arbitragem (tier list local) + Incursões Steel Path, usando arquivos
// estáticos baixados de browse.wf (não têm API oficial de schedule).
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { DATA_ROOT, ARBYS_FILE, REGIONS_FILE, SP_INCURSIONS_FILE, DATA_DIR } = require('../../config/env')
const { ARBY_TIERS, TIER_EMOJI } = require('../../config/constants')
const { formatTimeLeft, formatBRDate } = require('../../utils/time')

async function ensureArbyData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  if (!fs.existsSync(ARBYS_FILE)) {
    console.log('📥 Baixando arbys.txt...')
    const res = await axios.get('https://browse.wf/arbys.txt', { responseType: 'text', timeout: 60000 })
    fs.writeFileSync(ARBYS_FILE, res.data)
    console.log('✅ arbys.txt salvo')
  }

  if (!fs.existsSync(SP_INCURSIONS_FILE)) {
    console.log('📥 Baixando sp-incursions.txt...')
    try {
      const res = await axios.get('https://browse.wf/sp-incursions.txt', { responseType: 'text', timeout: 60000 })
      fs.writeFileSync(SP_INCURSIONS_FILE, res.data)
      console.log('✅ sp-incursions.txt salvo')
    } catch (e) {
      console.error('Falha sp-incursions:', e.message)
    }
  }

  if (!fs.existsSync(REGIONS_FILE)) {
    console.log('📥 Baixando mapeamento de regiões...')
    const [regionsRes, dictRes] = await Promise.all([
      axios.get('https://browse.wf/warframe-public-export-plus/ExportRegions.json', { timeout: 60000 }),
      axios.get('https://browse.wf/warframe-public-export-plus/dict.en.json', { timeout: 60000 })
    ])
    const regions = regionsRes.data
    const dict = dictRes.data
    const map = {}

    for (const [key, r] of Object.entries(regions)) {
      const nameKey = r.name || ''
      const sysKey = r.systemName || ''
      const name = dict[nameKey] || nameKey.split('/').pop() || key
      const planet = dict[sysKey] || sysKey.split('/').pop() || '?'
      map[key] = {
        name, planet,
        missionType: (r.missionType || '').replace('MT_', ''),
        faction: (r.faction || '').replace('FC_', '')
      }
    }
    fs.writeFileSync(REGIONS_FILE, JSON.stringify(map))
    console.log('✅ regions.json salvo')
  }
}

function loadArbys() {
  const lines = fs.readFileSync(ARBYS_FILE, 'utf8').trim().split('\n')
  return lines.map((line) => {
    const [ts, key] = line.split(',')
    return { ts: parseInt(ts, 10), key: (key || '').trim() }
  }).filter((x) => x.ts && x.key)
}

function loadSpIncursions() {
  if (!fs.existsSync(SP_INCURSIONS_FILE)) return []
  const lines = fs.readFileSync(SP_INCURSIONS_FILE, 'utf8').trim().split('\n')
  return lines.map((line) => {
    const [ts, nodes] = line.split(';')
    return { ts: parseInt(ts, 10), nodes: (nodes || '').split(',').map((s) => s.trim()).filter(Boolean) }
  }).filter((x) => x.ts && x.nodes.length)
}

function loadRegions() {
  return JSON.parse(fs.readFileSync(REGIONS_FILE, 'utf8'))
}

const MISSION_TYPE_MAP = {
  SURVIVAL: 'Survival', EXTERMINATION: 'Exterminate', EXTERMINATE: 'Exterminate',
  ASSASSINATION: 'Assassination', DEFENSE: 'Defense', MOBILE_DEFENSE: 'Mobile Defense',
  CAPTURE: 'Capture', RESCUE: 'Rescue', SABOTAGE: 'Sabotage', SPY: 'Spy', HIJACK: 'Hijack',
  EXCAVATION: 'Excavation', DISRUPTION: 'Disruption', ALCHEMY: 'Alchemy',
  VOID_CASCADE: 'Void Cascade', VOID_FLOOD: 'Void Flood', ARMAGEDDON: 'Void Armageddon',
  CORRUPTION: 'Void Flood', HELL_SCRUB: 'Hell-Scrub', LEGACYTE_HARVEST: 'Legacyte Harvest',
  MIRROR_DEFENSE: 'Mirror Defense', Survival: 'Survival', Exterminate: 'Exterminate',
  Assassination: 'Assassination', Defense: 'Defense', MobileDefense: 'Mobile Defense',
  Capture: 'Capture', VoidCascade: 'Void Cascade', VoidFlood: 'Void Flood', VoidArmageddon: 'Void Armageddon'
}

function resolveNodeName(nodeKey, withType) {
  try {
    if (!nodeKey) return '?'
    if (!fs.existsSync(REGIONS_FILE)) return String(nodeKey)

    const regions = loadRegions()
    const info = regions[nodeKey]
    if (!info) return String(nodeKey)

    let name = info.name || nodeKey
    if (info.planet && info.planet !== '?') name += ' (' + info.planet + ')'

    if (withType) {
      const raw = (info.missionType || '').toString().trim()
      if (raw && raw !== '?') {
        const nice = MISSION_TYPE_MAP[raw] || raw.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
        name += ' — ' + nice
      }
    }
    return name
  } catch (e) {
    return String(nodeKey)
  }
}

function getArbyTier(nodeName) {
  if (!nodeName) return 'F'
  const lower = nodeName.toLowerCase()
  for (const [name, tier] of Object.entries(ARBY_TIERS)) {
    if (lower.includes(name.toLowerCase())) return tier
  }
  return 'F'
}

async function getArbitrations() {
  await ensureArbyData()
  const arbys = loadArbys()
  const regions = loadRegions()
  const now = Math.floor(Date.now() / 1000)

  let current = null
  const upcoming = []
  const notables = []

  for (let i = 0; i < arbys.length; i++) {
    const a = arbys[i]
    const nextTs = arbys[i + 1] ? arbys[i + 1].ts : a.ts + 3600
    const info = regions[a.key] || { name: a.key, planet: '?', missionType: '?', faction: '?' }
    const tier = getArbyTier(info.name)
    const entry = { ...info, key: a.key, ts: a.ts, expiry: nextTs, tier, emoji: TIER_EMOJI[tier] || '⚪' }

    if (a.ts <= now && nextTs > now) {
      current = entry
    } else if (a.ts > now) {
      upcoming.push(entry)
      if (['S', 'A'].includes(tier) && notables.length < 6) notables.push(entry)
      if (upcoming.length >= 8) break
    }
  }

  return { current, upcoming, notables }
}

async function formatArbyMessage() {
  try {
    const { current, upcoming, notables } = await getArbitrations()
    let reply = ''

    if (current) {
      const left = formatTimeLeft((current.expiry * 1000) - Date.now())
      reply += current.emoji + ' *Arbitragem Atual*\n'
      reply += '*' + current.tier + '* ' + current.name + ' (' + current.planet + ')\n'
      reply += 'Tipo: ' + current.missionType + ' - ' + current.faction + '\n'
      reply += '⏳ Expira em: *' + left + '*\n\n'
    } else {
      reply += '❌ Nenhuma arbitragem atual encontrada no schedule local.\n\n'
    }

    if (upcoming.length) {
      reply += '📅 *Próximas*\n'
      for (const u of upcoming.slice(0, 6)) {
        const left = formatTimeLeft((u.ts * 1000) - Date.now())
        reply += u.emoji + ' *' + u.tier + '* ' + u.name + ' (' + u.planet + ') — em ' + left + '\n'
      }
      reply += '\n'
    }

    if (notables.length) {
      reply += '⭐ *Notables (S/A)*\n'
      for (const n of notables) {
        const left = formatTimeLeft((n.ts * 1000) - Date.now())
        reply += n.emoji + ' *' + n.tier + '* ' + n.name + ' (' + n.planet + ') — em ' + left + '\n'
      }
    }

    return reply.trim() || '❌ Não foi possível montar a lista de arbitrations.'
  } catch (err) {
    console.error('Erro arby:', err.message)
    return '❌ Erro ao buscar arbitrations. Tente novamente mais tarde.'
  }
}

async function formatIncursionsMessage() {
  try {
    await ensureArbyData()
    const list = loadSpIncursions()
    const regions = loadRegions()
    if (!list.length) return '❌ Arquivo de incursões SP não disponível.'

    const now = Math.floor(Date.now() / 1000)
    let current = null
    const upcoming = []

    for (let i = 0; i < list.length; i++) {
      const row = list[i]
      const nextTs = list[i + 1] ? list[i + 1].ts : row.ts + 86400
      const nodes = row.nodes.map((key) => {
        const info = regions[key] || { name: key, planet: '?' }
        return info.name + ' (' + info.planet + ')'
      })

      if (row.ts <= now && nextTs > now) {
        current = { ts: row.ts, expiry: nextTs, nodes }
      } else if (row.ts > now) {
        upcoming.push({ ts: row.ts, nodes })
        if (upcoming.length >= 4) break
      }
    }

    let reply = '⚔️ *Incursões Steel Path*\n\n'
    if (current) {
      const left = formatTimeLeft((current.expiry * 1000) - Date.now())
      reply += '🟢 *Atual* (até ' + formatBRDate(current.expiry * 1000) + ')\n'
      reply += '⏳ ' + left + '\n'
      current.nodes.forEach((n, i) => { reply += (i + 1) + '. ' + n + '\n' })
      reply += '\n'
    } else {
      reply += '❌ Nenhuma incursão atual no schedule.\n\n'
    }

    if (upcoming.length) {
      reply += '📅 *Próximas*\n'
      upcoming.forEach((u, idx) => {
        const left = formatTimeLeft((u.ts * 1000) - Date.now())
        reply += '\n*' + (idx + 1) + '.* em ' + left + ' (' + formatBRDate(u.ts * 1000) + ')\n'
        u.nodes.slice(0, 6).forEach((n) => { reply += '• ' + n + '\n' })
      })
    }

    return reply.trim()
  } catch (err) {
    console.error('Erro incursao:', err.message)
    return '❌ Erro ao buscar incursões SP.'
  }
}

module.exports = {
  ensureArbyData, loadArbys, loadSpIncursions, loadRegions, resolveNodeName,
  getArbyTier, getArbitrations, formatArbyMessage, formatIncursionsMessage
}
