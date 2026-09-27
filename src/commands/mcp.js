// src/commands/mcp.js
// Comandos novos portados do projeto warframe-mcp (mpeciakk/warframe-mcp):
// lookup_builds, farm_route_optimizer, task_synergy_planner, simaris_target,
// find_enemy_spawn, crafting_requirements, crafting_usage e prime_vault_status
// (essa última substitui/robustece a checagem manual que o !ressurgencia fazia).
const { register } = require('./router')
const { lookupBuilds } = require('../services/wfm/builds')
const { farmRouteOptimizer } = require('../services/farming/farmRouteOptimizer')
const { taskSynergyPlanner } = require('../services/worldstate/synergy')
const { getSimarisMessage } = require('../services/worldstate/simaris')
const { findEnemySpawn } = require('../services/enemy/findEnemySpawn')
const { craftingRequirements, craftingUsage } = require('../services/crafting/crafting')
const { primeVaultStatus } = require('../services/worldstate/primeVaultStatus')

function splitList(raw) {
  return String(raw || '')
    .split(/[,;]|\s+e\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---------- lookup_builds ----------
register(/^!(builds?|overframe)\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🛠️ Buscando builds no Overframe.gg...' })
  const names = splitList(match[2])
  await sock.sendMessage(from, { text: await lookupBuilds(names, { limit: 3 }) })
})

// ---------- farm_route_optimizer ----------
register(/^!(farm|farmroute|rotafarm)\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🗺️ Cruzando tabelas de drop pra achar overlap...' })
  const resources = splitList(match[2])
  await sock.sendMessage(from, { text: await farmRouteOptimizer(resources, {}) })
})

// ---------- task_synergy_planner ----------
register(/^!(sinergia|synergy|combo)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🧭 Cruzando Nightwave com fissuras/invasões/sortie...' })
  await sock.sendMessage(from, { text: await taskSynergyPlanner() })
})

// ---------- simaris_target ----------
register(/^!simaris$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🔬 Consultando Cephalon Simaris...' })
  await sock.sendMessage(from, { text: await getSimarisMessage() })
})

// ---------- find_enemy_spawn ----------
register(/^!(spawn|ondeacho)\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '👾 Procurando spawns...' })
  const enemies = splitList(match[2])
  const steelPath = /\bsp\b|steel ?path/i.test(match[2])
  await sock.sendMessage(from, { text: await findEnemySpawn(enemies, { steelPath }) })
})

// ---------- crafting_requirements ----------
register(/^!(receita|crafting|craft)\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🛠️ Buscando receita de craft...' })
  const names = splitList(match[2])
  await sock.sendMessage(from, { text: await craftingRequirements(names) })
})

// ---------- crafting_usage ----------
register(/^!(usadoem|usedin|craftingusage)\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '📦 Verificando em quais receitas isso entra...' })
  const names = splitList(match[2])
  await sock.sendMessage(from, { text: await craftingUsage(names) })
})

// ---------- prime_vault_status (versão robusta, substitui a checagem manual) ----------
register(/^!(vault|vaultstatus|statusvault)\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🔐 Verificando status de vault/Varzia/relíquias...' })
  const names = splitList(match[2])
  await sock.sendMessage(from, { text: await primeVaultStatus(names) })
})
