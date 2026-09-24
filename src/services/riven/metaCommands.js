// src/services/riven/metaCommands.js
const { normalizeWeaponKey } = require('../../utils/text')
const { getWeaponMeta } = require('./baseData')
const { RIVEN_STAT_LABEL } = require('./grading')

function getMetaMessage(weaponName) {
  if (!weaponName || !String(weaponName).trim()) {
    return '❌ *Como usar:*\n!meta <arma>\n!grol <arma>\n\nEx: !meta torid\n!grol burston\n!meta kuva kohm'
  }
  const key = normalizeWeaponKey(weaponName)
  const meta = getWeaponMeta(key)
  if (!meta) {
    return '❌ Meta não encontrada para *' + weaponName + '*.\nVerifique o nome (ex: torid, burston, kuva_bramma).'
  }

  let reply = '🎯 *META ROLL — ' + (meta.display || weaponName) + '*\n\n'
  reply += '*Obrigatórias (must-have):*\n'
  const must = meta.must_have || []
  if (!must.length) reply += '_nenhuma_\n'
  for (const m of must) reply += '• ' + (RIVEN_STAT_LABEL[m] || m) + '\n'

  reply += '\n*Prioridade (nessa ordem):*\n'
  const prio = meta.priority || []
  for (let j = 0; j < prio.length; j++) reply += (j + 1) + '. ' + (RIVEN_STAT_LABEL[prio[j]] || prio[j]) + '\n'

  if (meta.raw_text) reply += '\n*Formato original:*\n`' + meta.raw_text + '`\n'

  reply += '\n💡 `!grade <link>` analisa um anúncio + meta\n'
  const aliases = { multishot: 'ms', critical_damage: 'cd', critical_chance: 'cc', 'fire_rate_/_attack_speed': 'fr', 'base_damage_/_melee_damage': 'dmg', status_chance: 'sc', toxin: 'tox' }
  reply += '🔔 `!alertariven ' + key + ' ' + must.map((s) => aliases[s] || s.split('/').pop().slice(0, 4)).join(' ') + ' max 3000` para sniper'
  return reply.trim()
}

module.exports = { getMetaMessage }
