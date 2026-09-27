// src/services/worldstate/simaris.js
// simaris_target — portado do warframe-mcp (mpeciakk/warframe-mcp, tools/simaris.ts).
// Alvo de síntese do dia + sugestão de onde escanear, reaproveitando o
// find_enemy_spawn pra cruzar com o world state ao vivo.
const { fetchWS } = require('./fetchWS')
const { findEnemySpawnOne } = require('../enemy/findEnemySpawn')

async function getSimarisMessage() {
  try {
    const s = await fetchWS('simaris')
    if (!s) return '❌ Cephalon Simaris indisponível no momento.'

    let reply = '🔬 *Cephalon Simaris*\n\n'

    if (s.isTargetActive === false) {
      reply += '_Nenhum alvo de síntese ativo agora — volte mais tarde._'
      return reply.trim()
    }

    const target = s.target || '?'
    reply += '🎯 *Alvo de hoje:* ' + target + '\n'
    reply += '📡 Scanner de síntese disponível no Codex, seção Simaris.\n\n'

    try {
      const spawnInfo = await findEnemySpawnOne(target, {})
      reply += spawnInfo
    } catch (e) {
      reply += '💡 Use `!spawn ' + target + '` pra ver onde escanear.'
    }

    return reply.trim()
  } catch (err) {
    console.error('getSimarisMessage:', err.message)
    return '❌ Erro ao buscar alvo do Simaris.'
  }
}

module.exports = { getSimarisMessage }
