// src/services/lich/lichCard.js
// Cartão (PNG) de um leilão de Kuva Lich / Sister of Parvos.
// Mesmo estilo do cartão de riven: arma + efêmera à esquerda, dados à direita.

const path = require('path')
const {
  KINDS, ELEMENTS, prettify,
  getImagePath, getImageDataUri, findEphemera, weaponDisplayName, quirkDisplayName
} = require('./lichData')

const FONT_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'fonts')

const W = 860
const LEFT_W = 460
const RX = LEFT_W + 36
const RR = W - 28

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Dano bônus do lich/sister vai de 25 a 60.
function damageTier(d) {
  if (d == null) return { label: '?', color: '#8b8b96' }
  if (d >= 58) return { label: 'Máximo', color: '#3ddc84' }
  if (d >= 55) return { label: 'Ótimo', color: '#3ddc84' }
  if (d >= 50) return { label: 'Bom', color: '#a3e635' }
  if (d >= 40) return { label: 'Médio', color: '#f5c542' }
  if (d >= 30) return { label: 'Baixo', color: '#fb923c' }
  return { label: 'Fraco', color: '#ef4444' }
}

function txt(x, y, size, fill, str, o) {
  o = o || {}
  return '<text x="' + x + '" y="' + y + '" font-family="DejaVu Sans" font-size="' + size + '"' +
    (o.bold ? ' font-weight="bold"' : '') +
    (o.middle ? ' text-anchor="middle"' : '') +
    (o.spacing ? ' letter-spacing="' + o.spacing + '"' : '') +
    ' fill="' + fill + '">' + esc(str) + '</text>'
}

/**
 * @param {object} n  leilão normalizado (lichSearch.normalizeAuction)
 */
function buildLichSvg(n) {
  const kind = KINDS[n.kind] || KINDS.lich
  const el = ELEMENTS[n.element] || { name: prettify(n.element) || '?', color: '#8b8b96' }
  const eph = n.ephemera ? findEphemera(n.kind, n.element) : null
  const weaponName = weaponDisplayName(n.kind, n.weapon_url_name)
  const tier = damageTier(n.damage)

  const rows = 4
  const rowH = 104
  const H = 126 + rows * rowH + 24

  const weaponImg = getImageDataUri(getImagePath(weaponName) || getImagePath(n.weapon_url_name))
  const ephImg = eph ? getImageDataUri(getImagePath(eph.name) || getImagePath(eph.url_name)) : null

  let s = ''
  s += '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'
  s += '<defs>'
  s += '<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="' + el.color + '" stop-opacity="0.38"/><stop offset="1" stop-color="' + el.color + '" stop-opacity="0"/></radialGradient>'
  s += '<linearGradient id="lbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1626"/><stop offset="1" stop-color="#0b0910"/></linearGradient>'
  s += '<clipPath id="ephclip"><circle cx="96" cy="' + (H - 264) + '" r="60"/></clipPath>'
  s += '</defs>'
  s += '<rect width="' + W + '" height="' + H + '" fill="#08080a"/>'

  // ----- lado esquerdo
  s += '<rect x="0" y="0" width="' + LEFT_W + '" height="' + H + '" fill="url(#lbg)"/>'
  s += '<circle cx="' + (LEFT_W / 2) + '" cy="250" r="220" fill="url(#glow)"/>'
  s += txt(LEFT_W / 2, 52, 15, el.color, kind.label.toUpperCase(), { middle: true, bold: true, spacing: 3 })

  if (weaponImg) {
    s += '<image x="50" y="70" width="360" height="360" preserveAspectRatio="xMidYMid meet" xlink:href="' + weaponImg + '"/>'
  } else {
    s += txt(LEFT_W / 2, 180, 30, '#cbbcf0', weaponName, { middle: true, bold: true })
    s += txt(LEFT_W / 2, 212, 16, '#6f6f7a', '(sem imagem da arma)', { middle: true })
  }

  if (eph) {
    const cy = H - 264
    s += '<circle cx="96" cy="' + cy + '" r="64" fill="#0b0910" stroke="' + el.color + '" stroke-width="3"/>'
    if (ephImg) s += '<image x="36" y="' + (cy - 60) + '" width="120" height="120" preserveAspectRatio="xMidYMid slice" clip-path="url(#ephclip)" xlink:href="' + ephImg + '"/>'
    s += txt(96, cy + 84, 14, '#a79bc4', 'Efêmera', { middle: true })
  }

  s += '<line x1="60" y1="' + (H - 152) + '" x2="' + (LEFT_W - 60) + '" y2="' + (H - 152) + '" stroke="#3a3052" stroke-width="1.5"/>'
  s += txt(LEFT_W / 2, H - 100, 42, '#f5c542', (n.price != null ? n.price : '?') + ' p', { middle: true, bold: true })
  const dot = n.status === 'ingame' ? '#3ddc84' : n.status === 'online' ? '#f5c542' : '#6e6e79'
  s += '<text x="' + (LEFT_W / 2) + '" y="' + (H - 58) + '" font-family="DejaVu Sans" font-size="19" text-anchor="middle" fill="#a79bc4">' +
    '<tspan fill="' + dot + '">\u25CF</tspan><tspan> ' + esc(n.seller + (n.status ? ' \u00B7 ' + n.status : '')) + '</tspan></text>'
  s += txt(LEFT_W / 2, H - 30, 15, '#6f6f7a', n.isDirect ? 'Venda direta' : 'Leilão', { middle: true })

  // ----- lado direito
  s += txt(RX, 56, weaponName.length > 16 ? 28 : 32, '#ffffff', weaponName, { bold: true })
  s += txt(RX, 84, 15, '#6f6f7a', kind.label + ' \u00B7 ' + el.name)
  s += '<line x1="' + RX + '" y1="104" x2="' + RR + '" y2="104" stroke="#2a2a31" stroke-width="1.5"/>'

  let y = 104
  const sep = () => '<line x1="' + RX + '" y1="' + Math.round(y) + '" x2="' + RR + '" y2="' + Math.round(y) + '" stroke="#2a2a31" stroke-width="1.5"/>'

  // linha 1: dano + barra
  s += txt(RX, y + 34, 21, '#f0f0f3', 'Dano bônus')
  s += txt(RX, y + 72, 30, tier.color, n.damage != null ? '+' + n.damage + '%' : '?', { bold: true })
  s += txt(RR, y + 72, 18, tier.color, tier.label, { bold: true }).replace('<text ', '<text text-anchor="end" ')
  const pct = n.damage != null ? Math.max(0, Math.min(1, (n.damage - 25) / 35)) : 0
  s += '<rect x="' + RX + '" y="' + (y + 84) + '" width="' + (RR - RX) + '" height="8" rx="4" fill="#26262e"/>'
  s += '<rect x="' + RX + '" y="' + (y + 84) + '" width="' + Math.round((RR - RX) * pct) + '" height="8" rx="4" fill="' + tier.color + '"/>'
  y += rowH; s += sep()

  // linha 2: elemento
  s += txt(RX, y + 38, 21, '#f0f0f3', 'Elemento')
  s += '<circle cx="' + (RX + 12) + '" cy="' + (y + 72) + '" r="11" fill="' + el.color + '"/>'
  s += txt(RX + 32, y + 80, 28, el.color, el.name, { bold: true })
  y += rowH; s += sep()

  // linha 3: efêmera
  s += txt(RX, y + 38, 21, '#f0f0f3', 'Efêmera')
  if (n.ephemera) {
    s += txt(RX, y + 78, eph && eph.name.length > 22 ? 22 : 26, '#cbbcf0', eph ? eph.name : 'Sim', { bold: true })
  } else {
    s += txt(RX, y + 78, 26, '#6e6e79', 'Sem efêmera', { bold: true })
  }
  y += rowH; s += sep()

  // linha 4: quirk
  s += txt(RX, y + 38, 21, '#f0f0f3', 'Quirk')
  const quirkText = n.quirk ? quirkDisplayName(n.kind, n.quirk) : 'Nenhum'
  s += txt(RX, y + 78, quirkText.length > 22 ? 21 : 26, n.quirk ? '#f5c542' : '#6e6e79', quirkText, { bold: true })
  y += rowH; s += sep()

  s += '</svg>'
  return s
}

function renderLichPng(n) {
  const { Resvg } = require('@resvg/resvg-js')
  const resvg = new Resvg(buildLichSvg(n), {
    fitTo: { mode: 'width', value: 1080 },
    font: {
      fontFiles: [path.join(FONT_DIR, 'DejaVuSans.ttf'), path.join(FONT_DIR, 'DejaVuSans-Bold.ttf')],
      loadSystemFonts: false,
      defaultFontFamily: 'DejaVu Sans'
    }
  })
  return resvg.render().asPng()
}

module.exports = { buildLichSvg, renderLichPng, damageTier }
