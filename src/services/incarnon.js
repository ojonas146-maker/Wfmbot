// src/services/incarnon.js
// Rotação semanal do Circuit (Incarnons), calculada localmente a partir de uma época fixa.
const { INCARNON_EPOCH_UTC, INCARNON_EPOCH_INDEX, INCARNON_ROTATIONS } = require('../config/constants')
const { formatDaysLeft } = require('../utils/time')

function getCircuitWeekIndex(nowMs) {
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const weeksSince = Math.floor((nowMs - INCARNON_EPOCH_UTC) / weekMs)
  let idx = (INCARNON_EPOCH_INDEX + weeksSince) % INCARNON_ROTATIONS.length
  if (idx < 0) idx += INCARNON_ROTATIONS.length
  return { idx, weeksSince }
}

function formatIncarnonMessage() {
  const now = Date.now()
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const info = getCircuitWeekIndex(now)
  const idx = info.idx
  const nextReset = INCARNON_EPOCH_UTC + (info.weeksSince + 1) * weekMs
  const left = nextReset - now
  const cur = INCARNON_ROTATIONS[idx]

  let reply = '⚡ *Circuit — Incarnons — Week ' + cur.letter + '*\n\n'
  reply += '*Ativo*\n'
  reply += cur.weapons.join(', ') + '\n'
  reply += 'Rotaciona: *' + formatDaysLeft(left) + '*\n\n'
  reply += '*Próximas*\n'

  for (let i = 1; i < INCARNON_ROTATIONS.length; i++) {
    const r = INCARNON_ROTATIONS[(idx + i) % INCARNON_ROTATIONS.length]
    const startIn = left + (i - 1) * weekMs
    reply += 'em *' + formatDaysLeft(startIn) + '* — ' + r.weapons.join(', ') + '\n'
  }
  return reply.trim()
}

module.exports = { getCircuitWeekIndex, formatIncarnonMessage }
