// src/services/worldstate/baro.js
const axios = require('axios')
const { sleep, formatTimeLeft } = require('../../utils/time')

function classifyBaroItem(name, uniqueName) {
  const n = String(name || '').toLowerCase()
  const u = String(uniqueName || '').toLowerCase()
  const both = n + ' ' + u

  if (/\brelic\b|voidprojection|void projection/i.test(both)) return 'relics'

  const isCosmeticWord = /skin|syandana|ephemera|sigil|glyph|diadem|sugatra|ornament|bobble|decoration|armor set|shoulder plate|chest plate|leg plate|kubrow armor|helmet|mask|wings|tail|scarf|palette|banner|poster|luxxum|song item|tarot|motorcycle/i.test(n)
  if (/\/weapons\//i.test(u)) return 'weapons'
  if (!isCosmeticWord) {
    if (/\b(prisma|vandal|wraith|dex)\b/i.test(n)) return 'weapons'
    if (/\b(skana|machete|glaxion|paris|braton|lato|boltor|soma|vectis|tigris|vulkar|strun|gorgon|grakata|hek|sobek|akbolto|akstiletto|nikana|gram|galatine|orthos|scindo|fragor|kronen|ninkondi|tipedo|reaper|serro|sibear|tekko|zenistar|ohma|mios|caustacyst)\b/i.test(n)) {
      return 'weapons'
    }
  }

  if (isCosmeticWord) return 'cosmetics'
  if (/\/skins\/|\/cosmetics\/|\/syandana|\/ephemera|\/sigil|\/glyph|shipdecos|bobblehead/i.test(u)) return 'cosmetics'

  if (/\bprimed\b|\barchon\b/i.test(n)) return 'mods'
  if (/smite|expel|convulsion|chilling grasp|slip magazine|ammo mutation|ammo stock|morphic transformer|\bscorch\b|steady hands|heated charge|ice storm|magnum force|lethal torrent|anemic agility|hornet strike|barrel diffusion|pistol pestilence|pathogen rounds|deep freeze|frostbite|pistol gambit|target cracker|hollow point|tactical pump|point blank|\bblaze\b|vicious spread|ravage|seeking force|breach loader|burdened magazine|charged shell|chilling reload|contagious spread|disruptor|flechette|incendiary coat|shell shock|shredder|silent battery|toxic barrage|frigid blast|narrow barrel|lock and load|soft hands|turbo charge|accelerated blast|amalgam|galvanized|umbral|augur/i.test(n)) {
    return 'mods'
  }
  if (/\/mods\//i.test(u)) return 'mods'

  return 'other'
}

async function fetchBaroData() {
  const urls = ['https://api.warframestat.us/pc/voidTrader', 'https://api.warframestat.us/pc/voidTrader?language=en']
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const u of urls) {
      try {
        const res = await axios.get(u, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
        if (res.data) return res.data
      } catch (e) { lastErr = e }
    }
    if (attempt < 2) await sleep(1500)
  }
  throw lastErr || new Error('Baro API indisponível')
}

async function getBaro() {
  try {
    const data = await fetchBaroData()
    if (!data) return '❌ Não foi possível obter dados do Baro.'
    const now = Date.now()
    const activation = data.activation ? new Date(data.activation).getTime() : 0
    const expiry = data.expiry ? new Date(data.expiry).getTime() : 0
    const isActive = activation && expiry && now >= activation && now < expiry
    const location = data.location || 'Relay desconhecido'
    const inv = data.inventory || []
    if (!isActive) {
      const when = data.activation ? new Date(data.activation).toLocaleString('pt-BR') : '?'
      const left = activation ? formatTimeLeft(activation - now) : '?'
      let replyOff = "🛸 *Baro Ki'Teer*\n\n❌ *Não está disponível no momento.*\n\n"
      replyOff += '📅 Próxima chegada: *' + when + '*\n⏳ Em: *' + left + '*\n📍 Relay: *' + location + '*\n'
      if (expiry) replyOff += '🗓️ Fica até: ' + new Date(data.expiry).toLocaleString('pt-BR') + '\n'
      replyOff += '\n_Os itens só aparecem quando ele estiver ativo._'
      return replyOff
    }

    let reply = "🛸 *Baro Ki'Teer — ATIVO*\n\n"
    reply += '📍 *' + location + '*\n'
    reply += '⏳ Sai em: *' + formatTimeLeft(expiry - now) + '*\n'
    reply += '🗓️ Até: ' + new Date(data.expiry).toLocaleString('pt-BR') + '\n'

    if (!inv.length) return reply + '\n_Inventário vazio ou ainda não listado._'

    const cats = { mods: [], weapons: [], relics: [], cosmetics: [], other: [] }
    for (const item of inv) {
      const name = item.item || item.uniqueName || 'Item'
      const cat = classifyBaroItem(name, item.uniqueName)
      const ducats = item.ducats != null ? item.ducats + ' ducats' : '—'
      const credits = item.credits != null ? Number(item.credits).toLocaleString('pt-BR') + ' cr' : '—'
      cats[cat].push('• *' + name + '*\n   ' + ducats + ' | ' + credits)
    }

    const sections = [
      { key: 'mods', title: '🧩 *Mods*' },
      { key: 'weapons', title: '🔫 *Armas*' },
      { key: 'relics', title: '📦 *Relíquias*' },
      { key: 'cosmetics', title: '✨ *Cosméticos*' },
      { key: 'other', title: '📦 *Outros*' }
    ]

    for (const sec of sections) {
      const list = cats[sec.key]
      if (!list.length) continue
      reply += '\n' + sec.title + '\n'
      reply += list.join('\n') + '\n'
    }

    return reply.trim()
  } catch (err) {
    console.error('getBaro:', err.message)
    return '❌ Erro ao buscar Baro. (API lenta ou offline — tente de novo em alguns segundos)'
  }
}

module.exports = { fetchBaroData, getBaro, classifyBaroItem }
