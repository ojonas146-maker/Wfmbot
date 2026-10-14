// src/services/riven/statDictionary.js
// Dicionário de stats de riven + guia de como montar o !alertariven.
// Gerado a partir das abreviações que o bot já usa (RIVEN_STAT_ALIASES).

const { RIVEN_STAT_ALIASES, RIVEN_STAT_LABEL } = require('./grading')

const GROUPS = [
  ['⚔️ Principais', ['multishot', 'critical_chance', 'critical_damage', 'base_damage_/_melee_damage', 'fire_rate_/_attack_speed', 'status_chance', 'status_duration']],
  ['🔥 Elementais e físicos', ['heat_damage', 'cold_damage', 'electric_damage', 'toxin_damage', 'impact', 'puncture', 'slash']],
  ['🧪 Novos (Riven Splicing)', ['viral', 'gas_damage', 'blast_damage', 'corrosive_damage', 'magnetic_damage', 'radiation_damage', 'status_damage', 'weakpoint_damage', 'weakpoint_critical_chance', 'ammo_efficiency', 'reload_while_holstered', 'damage_vs_orokin', 'damage_vs_scaldra', 'damage_vs_techrot', 'slam_attack_damage', 'melee_damage_on_heavy_attack', 'heavy_attack_wind_up_speed', 'parry_angle']],
  ['👾 Facções', ['damage_vs_grineer', 'damage_vs_corpus', 'damage_vs_infested']],
  ['🔫 Armas de fogo', ['reload_speed', 'magazine_capacity', 'ammo_maximum', 'projectile_speed', 'punch_through', 'recoil', 'zoom', 'range']],
  ['🗡️ Corpo a corpo', ['combo_duration', 'initial_combo', 'heavy_attack_efficiency', 'combo_chance', 'finisher_damage', 'slide_attack_critical_chance']]
]

// Em quais armas cada stat novo pode aparecer (tabela de Riven Splicing)
const WEAPON_TAGS = {
  ammo_efficiency: 'sem melee',
  weakpoint_damage: 'sem melee',
  weakpoint_critical_chance: 'sem melee',
  reload_while_holstered: 'rifle, shotgun e pistol',
  slam_attack_damage: 'só melee',
  melee_damage_on_heavy_attack: 'só melee',
  heavy_attack_wind_up_speed: 'só melee',
  parry_angle: 'só melee'
}

function aliasesByUrl() {
  const map = {}
  for (const alias of Object.keys(RIVEN_STAT_ALIASES)) {
    const url = RIVEN_STAT_ALIASES[alias]
    // tokens com "_" ou "/" são feios de digitar e não aparecem no dicionário
    if (/[_\/]/.test(alias)) continue
    if (!map[url]) map[url] = []
    map[url].push(alias)
  }
  for (const url of Object.keys(map)) {
    map[url].sort((a, b) => a.length - b.length || a.localeCompare(b))
  }
  return map
}

function labelOf(url) {
  return RIVEN_STAT_LABEL[url] || url
}

function statLine(url, map) {
  const list = (map[url] || []).slice(0, 6)
  return '• *' + labelOf(url) + '* — ' + (list.length ? list.join(', ') : url) + (WEAPON_TAGS[url] ? ' _(' + WEAPON_TAGS[url] + ')_' : '')
}

function howToMessage() {
  return (
    '🎯 *Como montar o !alertariven*\n\n' +
    '`!alertariven <arma> <stats> [opções]`\n\n' +
    '*Stats:* use as abreviações do dicionário (veja `!rivenstats`) ou o nome em inglês sem espaço (ex: `multishot`, `criticaldamage`). O alerta só dispara se o riven tiver *todos* os stats que você pôs como *positivos*.\n\n' +
    '*Opções (qualquer ordem):*\n' +
    '• `max 3000` — preço máximo em platina\n' +
    '• `3p` ou `2p` — só rivens com 3 ou 2 stats positivos\n' +
    '• `grade S` — nota mínima (S, +A, A, -A, +B, B)\n' +
    '• `meta` — usa os stats meta da arma (god roll)\n\n' +
    '*Exemplos:*\n' +
    '• `!alertariven burston ms cc cd max 5000`\n' +
    '• `!alertariven burston wp cc max 3000` _(weakpoint damage + crit chance)_\n' +
    '• `!alertariven kohm viral dmg 3p max 800`\n' +
    '• `!alertariven torid meta max 2500`\n' +
    '• `!alertariven burston dmg cc cd grade +A max 4000`\n\n' +
    '📖 Todas as abreviações: `!rivenstats`\n' +
    '🔎 Procurar um stat: `!rivenstats weakpoint`\n' +
    '📋 Seus alertas: `!alertasriven` · ❌ `!delalertariven <id|all>`'
  )
}

function dictionaryMessage() {
  const map = aliasesByUrl()
  const used = {}
  let out = '📖 *Dicionário de stats (abreviações)*\n_Formato: Stat — abreviações que você pode usar_\n'
  for (const g of GROUPS) {
    const lines = g[1].filter((u) => map[u] || RIVEN_STAT_LABEL[u]).map((u) => { used[u] = true; return statLine(u, map) })
    if (lines.length) out += '\n*' + g[0] + '*\n' + lines.join('\n') + '\n'
  }
  const others = Object.keys(map).filter((u) => !used[u])
  if (others.length) {
    out += '\n*Outros*\n' + others.map((u) => statLine(u, map)).join('\n') + '\n'
  }
  out += '\n💡 Exemplo: `!alertariven burston wp cc max 3000`'
  return out.trim()
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function searchMessage(query) {
  const q = norm(query)
  const map = aliasesByUrl()
  const urls = Object.keys(map)
  const hits = urls.filter((u) => {
    if (norm(u).includes(q) || norm(labelOf(u)).includes(q)) return true
    return (map[u] || []).some((a) => norm(a) === q)
  })
  if (!hits.length) {
    return '❌ Não achei nenhum stat para "*' + query + '*".\nVeja a lista completa com `!rivenstats`.'
  }
  let out = '🔎 *Stats encontrados para "' + query + '"*\n\n'
  for (const u of hits.slice(0, 8)) {
    const first = (map[u] || [])[0] || u
    out += statLine(u, map) + '\n   Ex: `!alertariven burston ' + first + ' cc max 3000`\n'
  }
  return out.trim()
}

/** @returns {string[]} mensagens a enviar */
function getRivenStatsMessages(query) {
  const q = String(query || '').trim()
  if (q) return [searchMessage(q)]
  return [howToMessage(), dictionaryMessage()]
}

module.exports = { getRivenStatsMessages, howToMessage, dictionaryMessage, searchMessage }
