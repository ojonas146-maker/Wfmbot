// src/services/riven/rivenImage.js
// /grade com imagem: lê o riven de um print (modelo de visão da Groq), calcula as
// notas com o mesmo motor do /grade por link e devolve um cartão PNG.
//
// Fluxo: getImageBuffer(msg) -> extractRivenFromImage(buf) -> gradeExtracted(data)
//        -> buildCardSvg(result, buf) -> renderPng(svg)

const fs = require('fs')
const path = require('path')
const axios = require('axios')

const env = require('../../config/env')
const { loadBaseValues, findDisposition, getDispositionsList, resolveCategoryFromDisp } = require('./baseData')
const { gradeOneStat, gradeRank, getConfigKey } = require('./grading')

// Modelo de visão da Groq. Se a Groq aposentar este, troque via variável de ambiente.
// tira espaços e aspas que às vezes vêm coladas junto do valor da variável
const VISION_MODEL = String(process.env.GROQ_VISION_MODEL || '').trim().replace(/^["']|["']$/g, '') || 'qwen/qwen3.8-27b'
console.log('[rivenImage] modelo de visão:', VISION_MODEL, process.env.GROQ_VISION_MODEL ? '(da variável GROQ_VISION_MODEL)' : '(padrão do código)')
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024 // limite do base64 da Groq é ~4MB

const FONT_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'fonts')

// ---------------------------------------------------------------------------
// 1) Pegar a imagem da mensagem (legenda "/grade" OU resposta a uma imagem)
// ---------------------------------------------------------------------------

function findImageNode(msg) {
  const m = (msg && msg.message) || {}
  if (m.imageMessage) return msg

  const ctx =
    (m.extendedTextMessage && m.extendedTextMessage.contextInfo) ||
    (m.imageMessage && m.imageMessage.contextInfo) ||
    null
  const q = ctx && ctx.quotedMessage
  if (q && q.imageMessage) {
    return {
      key: {
        remoteJid: msg.key.remoteJid,
        id: ctx.stanzaId,
        participant: ctx.participant,
        fromMe: false
      },
      message: q
    }
  }
  return null
}

async function getImageBuffer(sock, msg) {
  const node = findImageNode(msg)
  if (!node) return null
  // require tardio: baileys só é necessário em runtime real do bot
  const { downloadMediaMessage } = require('@whiskeysockets/baileys')
  const pino = require('pino')
  return downloadMediaMessage(
    node,
    'buffer',
    {},
    { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
  )
}

function detectMime(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) return 'image/png'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  if (buf.length > 4 && buf.slice(0, 3).toString() === 'GIF') return 'image/gif'
  return 'image/jpeg'
}

// ---------------------------------------------------------------------------
// 2) Ler o riven com o modelo de visão
// ---------------------------------------------------------------------------

const VISION_PROMPT = [
  'You are reading a screenshot of a Warframe Riven mod card. Extract the data and answer with ONE JSON object and nothing else (no markdown, no comments).',
  'Schema:',
  '{"riven_name": string, "mastery_rank": number|null, "rerolls": number|null, "stats": [{"name": string, "value": number}]}',
  'Rules:',
  '- riven_name: the full title printed on the card, e.g. "Sobek Deci-calican".',
  '- stats: one entry per stat line, in the order printed. "name" is the stat text WITHOUT the number, sign, % or icons (e.g. "Multishot", "Gas", "Status Duration", "Reload Speed", "Critical Damage", "Damage to Grineer").',
  '- value: the number exactly as printed, KEEPING its sign (e.g. -50.3 for a curse). For faction damage printed like "x1.35 Damage to Grineer" use 1.35.',
  '- mastery_rank: the number next to "MR". rerolls: the number next to the reroll (circular arrow) icon. Use null if not visible.',
  '- Do not invent stats. If the image is not a Riven card, answer {"error":"not_a_riven"}.'
].join('\n')

function parseJsonLoose(text) {
  // modelos com raciocínio (Qwen) podem devolver <think>...</think> antes do JSON
  let s = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '')
  const end = s.lastIndexOf('}')
  if (end === -1) return null
  for (let start = s.indexOf('{'); start !== -1 && start < end; start = s.indexOf('{', start + 1)) {
    try {
      return JSON.parse(s.slice(start, end + 1))
    } catch (e) { /* tenta o próximo '{' */ }
  }
  return null
}

async function extractRivenFromImage(buf) {
  if (!env.GROQ_API_KEY) {
    return { error: 'Chave da Groq não configurada (defina GROQ_API_KEY no ambiente).' }
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { error: 'Imagem grande demais. Envie um print menor (até ~3MB).' }
  }

  const dataUrl = 'data:' + detectMime(buf) + ';base64,' + buf.toString('base64')
  const body = {
    model: VISION_MODEL,
    temperature: 0,
    max_tokens: 3000, // folga p/ modelos com raciocínio
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  }
  const reqCfg = {
    headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    timeout: 60000
  }

  try {
    let res
    try {
      res = await axios.post(env.GROQ_API_URL, body, reqCfg)
    } catch (e1) {
      // limite por minuto: se a Groq pede espera curta, espera e tenta mais uma vez
      const retryAfter = e1.response && e1.response.status === 429 && Number(e1.response.headers && e1.response.headers['retry-after'])
      if (retryAfter && retryAfter <= 20) {
        await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000))
        res = await axios.post(env.GROQ_API_URL, body, reqCfg)
      } else {
        throw e1
      }
    }
    const content = res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content
    const data = parseJsonLoose(content)
    if (!data) return { error: 'Não consegui interpretar a resposta do modelo de visão. Tente outro print.' }
    if (data.error) return { error: 'Isso não parece ser um riven. Envie o print da carta do riven.' }
    if (!Array.isArray(data.stats) || data.stats.length < 2) {
      return { error: 'Não consegui ler os stats do riven. Envie um print mais nítido, só com a carta.' }
    }
    return { data }
  } catch (e) {
    const status = e.response && e.response.status
    if (status === 404 || status === 400) {
      const detail = e.response && e.response.data && e.response.data.error && e.response.data.error.message
      if (status === 404 || /model/i.test(String(detail || ''))) {
        return { error: 'Modelo de visão indisponível (' + VISION_MODEL + '). Ajuste GROQ_VISION_MODEL. ' + (detail ? '\n' + detail : '') }
      }
      return { error: 'A Groq recusou a imagem: ' + (detail || e.message) }
    }
    if (status === 429) {
      const d429 = e.response && e.response.data && e.response.data.error && e.response.data.error.message
      return { error: 'Limite da Groq atingido. Tente de novo em instantes.' + (d429 ? '\n' + d429 : '') }
    }
    return { error: 'Erro ao ler a imagem: ' + e.message }
  }
}

// ---------------------------------------------------------------------------
// 3) Nome do stat (como impresso na carta) -> chave de base_values.json
// ---------------------------------------------------------------------------

function normKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

let _statLookup = null

function getStatLookup() {
  if (_statLookup) return _statLookup
  const bv = loadBaseValues()
  const map = {}
  const add = (alias, base) => { map[normKey(alias)] = base }

  for (const base of Object.keys(bv.stats)) {
    add(base, base)
    // elementais aparecem sem a palavra "Damage" na carta ("Gas", "Viral"...)
    if (/^(Cold|Heat|Electricity|Toxin|Impact|Puncture|Slash|Blast|Corrosive|Gas|Magnetic|Radiation|Viral) Damage$/.test(base)) {
      add(base.replace(/ Damage$/, ''), base)
    }
    const vs = base.match(/^Damage vs\. (.+)$/)
    if (vs) {
      add('Damage to ' + vs[1], base)
      add('Damage vs ' + vs[1], base)
      add('x Damage to ' + vs[1], base)
    }
  }

  const extras = {
    'Electric': 'Electricity Damage',
    'Base Damage': 'Damage', 'Melee Damage': 'Damage', 'Base Damage / Melee Damage': 'Damage',
    'Fire Rate': 'Fire Rate / Attack Speed', 'Attack Speed': 'Fire Rate / Attack Speed',
    'Crit Chance': 'Critical Chance', 'Crit Damage': 'Critical Damage',
    'Critical Chance on Slide Attack': 'Critical Chance for Slide Attack',
    'Projectile Flight Speed': 'Projectile Speed',
    'Recoil': 'Weapon Recoil',
    'Maximum Ammo': 'Ammo Maximum', 'Max Ammo': 'Ammo Maximum', 'Ammo Capacity': 'Ammo Maximum',
    'Chance to Gain Extra Combo Count': 'Additional Combo Count Chance',
    'Combo Count Chance': 'Additional Combo Count Chance',
    'Heavy Attack Wind-Up': 'Heavy Attack Wind Up Speed', 'Wind Up Speed': 'Heavy Attack Wind Up Speed',
    'Heavy Attack Damage': 'Melee Damage On Heavy Attack',
    'Reload Speed While Holstered': 'Reload While Holstered', 'Magazine Reload While Holstered': 'Reload While Holstered',
    'Slam Damage': 'Slam Attack Damage',
    'Weakpoint Crit Chance': 'Weakpoint Critical Chance', 'Weak Point Damage': 'Weakpoint Damage',
    'Weak Point Critical Chance': 'Weakpoint Critical Chance'
  }
  for (const k of Object.keys(extras)) add(k, extras[k])

  _statLookup = map
  return map
}

function resolveBaseStat(name) {
  const map = getStatLookup()
  // a carta traz textos extras entre parênteses, ex: "Fire Rate (x2 for Bows)"
  name = String(name || '').replace(/\([^)]*\)/g, ' ')
  const key = normKey(name)
  if (map[key]) return map[key]
  // o modelo às vezes devolve "+121.1% Gas" inteiro: tira números e tenta de novo
  const cleaned = normKey(String(name || '').replace(/[-+x]?\d+(\.\d+)?%?/g, ''))
  return map[cleaned] || null
}

// ---------------------------------------------------------------------------
// 4) Calcular as notas
// ---------------------------------------------------------------------------

function findWeaponFromTitle(title, hint) {
  const list = getDispositionsList()
  const t = String(title || '').toLowerCase().replace(/\s+/g, ' ').trim()
  let best = null
  for (const w of list) {
    if (!w || !w.name) continue
    const n = String(w.name).toLowerCase()
    if (t === n || t.indexOf(n + ' ') === 0) {
      if (!best || n.length > String(best.name).length) best = w
    }
  }
  if (best) return best
  return findDisposition(hint || '') || findDisposition(t.split(' ')[0]) || null
}

const GRADE_COLORS = {
  S: '#3ddc84', '+A': '#3ddc84', A: '#3ddc84', '-A': '#3ddc84',
  '+B': '#f5c542', B: '#f5c542', '-B': '#f5c542',
  '+C': '#fb923c', C: '#fb923c', '-C': '#fb923c', F: '#ef4444'
}

function fmtValue(base, unit, v) {
  const n = Number(v)
  if (unit === 'x') return 'x' + n.toFixed(2)
  const sign = n >= 0 ? '+' : '-'
  return sign + Math.abs(n).toFixed(1)
}

function gradeExtracted(data, opts) {
  const bv = loadBaseValues()
  const title = String(data.riven_name || '').trim()
  const weapon = findWeaponFromTitle(title, data.weapon)
  if (!weapon) {
    return { error: 'Não achei a arma "' + (title.split(' ')[0] || '?') + '" na tabela de disposições.' }
  }

  const category = resolveCategoryFromDisp(weapon)
  const disposition = Number(weapon.disposition)

  // monta attrs no formato do warframe.market (positive = buff, não o sinal)
  const parsed = []
  for (const s of data.stats) {
    const raw = Number(s.value)
    if (isNaN(raw)) continue
    const base = resolveBaseStat(s.name)
    const entry = base ? bv.stats[base] : null
    const unit = entry ? entry.unit : '%'

    let value = raw
    let positive = raw >= 0
    if (unit === 'x') {
      if (value > 3) value = 1 + value / 100 // veio como porcentagem
      positive = value >= 1
    } else if (base === 'Weapon Recoil') {
      positive = raw < 0 // recoil negativo é buff
      value = Math.abs(raw)
    }

    parsed.push({
      raw, base, unit, name: s.name,
      attr: { url_name: normKey(s.name), base_name: base || undefined, value, positive }
    })
  }
  if (parsed.length < 2) return { error: 'Não consegui ler os stats do riven.' }

  const attrs = parsed.map((p) => p.attr)
  const configKey = getConfigKey(attrs)

  // O modelo de visão erra a contagem das bolinhas de rank (lia 4 em riven rank 8),
  // então o padrão é rank 8. Para outro rank: legenda "/grade r5".
  const maxRank = 8
  let modRank = maxRank
  let rankNote = null
  if (opts && opts.rank != null && !isNaN(Number(opts.rank))) {
    modRank = Math.max(0, Math.min(maxRank, Number(opts.rank)))
    if (modRank < maxRank) rankNote = 'Rank ' + modRank
  }

  const rows = parsed.map((p) => {
    const g = gradeOneStat(p.attr, category, disposition, configKey, modRank, maxRank)
    return {
      label: p.base || String(p.name),
      valueText: fmtValue(p.base, p.unit, p.raw),
      positive: p.attr.positive,
      grade: g.grade || null,
      dev: g.dev != null ? g.dev : null,
      note: g.note || null
    }
  })

  // positivos primeiro (melhor nota no topo), curse por último — igual ao print de referência
  rows.sort((a, b) => {
    if (a.positive !== b.positive) return a.positive ? -1 : 1
    return gradeRank(b.grade) - gradeRank(a.grade)
  })

  return {
    weaponName: weapon.name,
    rivenName: title,
    disposition,
    category,
    configKey,
    modRank,
    rankNote,
    mastery: data.mastery_rank,
    rerolls: data.rerolls,
    rows
  }
}

// ---------------------------------------------------------------------------
// 5) Desenhar o cartão (SVG -> PNG com @resvg/resvg-js)
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Lê largura/altura do cabeçalho da imagem (PNG, JPEG, WebP) sem depender de biblioteca.
function imageSize(buf) {
  try {
    const mime = detectMime(buf)
    if (mime === 'image/png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    if (mime === 'image/jpeg') {
      let i = 2
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue }
        const marker = buf[i + 1]
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
        }
        i += 2 + buf.readUInt16BE(i + 2)
      }
    }
    if (mime === 'image/webp') {
      const kind = buf.toString('ascii', 12, 16)
      if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
      if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 } }
      if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) }
    }
  } catch (e) { /* cai no padrão */ }
  return null
}

// Estilo "referência": riven original ocupando a esquerda inteira, painel preto à direita.
function buildCardSvg(result, imgBuf) {
  const LEFT_W = 460
  const RIGHT_W = 400
  const W = LEFT_W + RIGHT_W
  const n = result.rows.length
  const HEAD = 126 // espaço do título + subtítulo

  const size = imgBuf ? imageSize(imgBuf) : null
  const natural = size && size.w > 0 ? Math.round(LEFT_W * size.h / size.w) : 560
  const minH = HEAD + n * 92 + 14
  const H = Math.max(minH, Math.min(natural, 820))
  // se a altura final é próxima da natural, preenche tudo (sem sobras); senão mostra inteira
  const fill = Math.abs(natural - H) / H < 0.15 ? 'slice' : 'meet'

  const RX = LEFT_W + 36
  const RR = W - 28

  let svg = ''
  svg += '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'
  svg += '<defs><clipPath id="imgclip"><rect x="0" y="0" width="' + LEFT_W + '" height="' + H + '"/></clipPath></defs>'
  svg += '<rect width="' + W + '" height="' + H + '" fill="#08080a"/>'

  if (imgBuf) {
    svg += '<image x="0" y="0" width="' + LEFT_W + '" height="' + H + '" preserveAspectRatio="xMidYMid ' + fill + '" clip-path="url(#imgclip)" xlink:href="data:' + detectMime(imgBuf) + ';base64,' + imgBuf.toString('base64') + '"/>'
  }

  // cabeçalho
  svg += '<text x="' + RX + '" y="56" font-family="DejaVu Sans" font-weight="bold" font-size="32" fill="#ffffff">' + esc(result.weaponName) + '</text>'
  svg += '<text x="' + RX + '" y="84" font-family="DejaVu Sans" font-size="15" fill="#6f6f7a">' + esc(result.configKey + ' \u00B7 disposition ' + result.disposition) + '</text>'
  svg += '<line x1="' + RX + '" y1="104" x2="' + RR + '" y2="104" stroke="#2a2a31" stroke-width="1.5"/>'

  // linhas de stats
  const rowH = Math.min(112, (H - HEAD - 6) / n)
  let y = 104
  for (const r of result.rows) {
    const color = r.grade ? (GRADE_COLORS[r.grade] || '#f5c542') : '#8b8b96'
    const labelSize = r.label.length > 22 ? 19 : 23
    svg += '<text x="' + RX + '" y="' + Math.round(y + rowH * 0.40) + '" font-family="DejaVu Sans" font-size="' + labelSize + '" fill="#f0f0f3">' + esc(r.label) + '</text>'

    let line
    if (r.grade) {
      const dev = (r.dev >= 0 ? '+' : '') + r.dev.toFixed(2) + '%'
      line = r.grade + '\u00A0\u00A0' + r.valueText + '\u00A0\u00A0(' + dev + ')'
    } else {
      line = r.valueText + '\u00A0\u00A0(' + (r.note || 'sem grade') + ')'
    }
    svg += '<text x="' + RX + '" y="' + Math.round(y + rowH * 0.76) + '" font-family="DejaVu Sans" font-weight="bold" font-size="25" fill="' + color + '">' + esc(line) + '</text>'
    y += rowH
    svg += '<line x1="' + RX + '" y1="' + Math.round(y) + '" x2="' + RR + '" y2="' + Math.round(y) + '" stroke="#2a2a31" stroke-width="1.5"/>'
  }

  // rodapé só quando o rank foi informado e é menor que o máximo (ex: /grade r5)
  if (result.rankNote) {
    svg += '<text x="' + RX + '" y="' + (H - 14) + '" font-family="DejaVu Sans" font-size="14" fill="#6f6f7a">' + esc(result.rankNote) + '</text>'
  }

  svg += '</svg>'
  return svg
}

function renderPng(svg) {
  const { Resvg } = require('@resvg/resvg-js')
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
    font: {
      fontFiles: [path.join(FONT_DIR, 'DejaVuSans.ttf'), path.join(FONT_DIR, 'DejaVuSans-Bold.ttf')],
      loadSystemFonts: false,
      defaultFontFamily: 'DejaVu Sans'
    }
  })
  return resvg.render().asPng()
}

// ---------------------------------------------------------------------------
// 6) Ponto de entrada usado pelo comando
// ---------------------------------------------------------------------------

/**
 * @returns {{ error: string } | { png: Buffer }}
 */
async function gradeRivenFromMessage(sock, msg, opts) {
  let buf
  try {
    buf = await getImageBuffer(sock, msg)
  } catch (e) {
    return { error: 'Não consegui baixar a imagem: ' + e.message }
  }
  if (!buf) {
    return {
      error: '❌ *Como usar:*\nEnvie o print do riven com a legenda */grade*, ou responda a uma imagem com */grade*.\nPara anúncio: /grade <link ou id>'
    }
  }

  const ext = await extractRivenFromImage(buf)
  if (ext.error) return { error: '❌ ' + ext.error }

  const result = gradeExtracted(ext.data, opts)
  if (result.error) return { error: '❌ ' + result.error }

  try {
    const png = renderPng(buildCardSvg(result, buf))
    return { png }
  } catch (e) {
    console.error('rivenImage render:', e.message)
    return { error: '❌ Erro ao gerar a imagem (' + e.message + '). Confira se o pacote @resvg/resvg-js está instalado (npm install).' }
  }
}

module.exports = {
  gradeRivenFromMessage,
  // exportados para teste
  gradeExtracted,
  buildCardSvg,
  renderPng,
  resolveBaseStat,
  extractRivenFromImage,
  findImageNode
}
