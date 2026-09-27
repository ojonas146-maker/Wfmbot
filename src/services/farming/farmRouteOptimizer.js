// src/services/farming/farmRouteOptimizer.js
// farm_route_optimizer — portado do warframe-mcp (mpeciakk/warframe-mcp,
// tools/farmOptimizer.ts).
//
// CORRIGIDO (comparado com o original em 27/09/2026): a v1 usava a tabela
// de drops AO VIVO do warframestat.us (drops/search) em vez do dataset
// estático de planeta+dark sector do projeto original. Funcionava, mas não
// era "a mesma lógica do MCP" como o usuário pediu. Agora usa exatamente o
// dataset de src/data/planet-resources.ts (portado em ./planetResources.js)
// e o mesmo sistema de pontuação (overlap de recursos > dark sector > tipo
// de missão preferido > bônus %).
const { PLANET_RESOURCES, RESOURCE_ALIASES, PREFERRED_MISSION_TYPES } = require('./planetResources')

function normalizeResource(input) {
  const lower = String(input || '').toLowerCase().trim()
  if (RESOURCE_ALIASES[lower]) return RESOURCE_ALIASES[lower]

  const all = new Set()
  for (const pd of Object.values(PLANET_RESOURCES)) for (const r of pd.resources) all.add(r)

  for (const r of all) if (r.toLowerCase() === lower) return r
  for (const r of all) if (r.toLowerCase().includes(lower) || lower.includes(r.toLowerCase())) return r

  return String(input || '').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function findPlanetsForResource(resource) {
  const planets = []
  for (const [planet, data] of Object.entries(PLANET_RESOURCES)) {
    if (data.resources.some((r) => r.toLowerCase() === resource.toLowerCase())) planets.push(planet)
  }
  return planets
}

function scoreMissionType(type) {
  const idx = PREFERRED_MISSION_TYPES.findIndex((t) => t.toLowerCase() === String(type || '').toLowerCase())
  return idx >= 0 ? PREFERRED_MISSION_TYPES.length - idx : 0
}

async function farmRouteOptimizer(resources, opts) {
  opts = opts || {}
  const preference = (opts.preferMissionType || 'any').toLowerCase()

  const list = Array.isArray(resources) ? resources : [resources]
  const normalized = list.map(normalizeResource)
  const unique = [...new Set(normalized)]

  const planetMatches = {}
  const unknownResources = []
  for (const resource of unique) {
    const planets = findPlanetsForResource(resource)
    if (!planets.length) { unknownResources.push(resource); continue }
    for (const planet of planets) {
      if (!planetMatches[planet]) planetMatches[planet] = []
      planetMatches[planet].push(resource)
    }
  }

  const candidates = []
  for (const [planet, matched] of Object.entries(planetMatches)) {
    const planetData = PLANET_RESOURCES[planet]
    if (!planetData) continue
    const otherResources = planetData.resources.filter((r) => !matched.includes(r))

    for (const ds of planetData.darkSectors) {
      candidates.push({
        name: ds.name, planet, missionType: ds.missionType, isDarkSector: true,
        resourceBonus: ds.resourceBonus, creditBonus: ds.creditBonus,
        resources: matched, otherResources, score: 0
      })
    }
    candidates.push({
      name: planet + ' (qualquer node)', planet, missionType: 'Various', isDarkSector: false,
      resourceBonus: 0, creditBonus: 0, resources: matched, otherResources, score: 0
    })
  }

  for (const c of candidates) {
    c.score = c.resources.length * 100
    if (c.isDarkSector) c.score += 30
    if (preference !== 'any') {
      if (c.missionType.toLowerCase() === preference) c.score += 25
    } else {
      c.score += scoreMissionType(c.missionType)
    }
    c.score += c.resourceBonus
  }

  candidates.sort((a, b) => b.score - a.score)
  const seen = new Set()
  const top = []
  for (const c of candidates) {
    const key = c.planet + '/' + c.name
    if (seen.has(key)) continue
    seen.add(key)
    top.push(c)
    if (top.length >= 10) break
  }

  const lines = []
  lines.push('🗺️ *Farm Route Optimizer*')
  lines.push('_Recursos: ' + unique.join(', ') + '_')

  if (unknownResources.length) {
    lines.push('\n⚠️ *Recursos não reconhecidos* (fora da tabela de planetas): ' + unknownResources.join(', '))
    lines.push('_Podem ser drops específicos de inimigo/missão — tente !usadoem ou !spawn._')
  }

  if (!top.length) {
    lines.push('\nNenhum node de farm encontrado pra esses recursos.')
    return lines.join('\n').trim()
  }

  const maxOverlap = top[0].resources.length
  if (maxOverlap >= 2) lines.push('\n📋 *Melhores nodes com overlap (' + maxOverlap + '/' + unique.length + ' recursos de uma vez):*')

  let prevOverlap = maxOverlap + 1
  for (let i = 0; i < top.length; i++) {
    const node = top[i]
    if (node.resources.length < prevOverlap && node.resources.length >= 2) {
      lines.push('\n📋 *Overlap de ' + node.resources.length + ' recursos:*')
    } else if (node.resources.length < prevOverlap && node.resources.length === 1) {
      lines.push('\n📋 *Melhor node individual por recurso:*')
    }
    prevOverlap = node.resources.length

    const tag = node.isDarkSector ? ' [Dark Sector]' : ''
    lines.push('\n' + (i + 1) + '. *' + node.name + ' (' + node.planet + ')* — ' + node.missionType + tag)
    lines.push('   Farma: ' + node.resources.join(', '))
    if (node.isDarkSector) lines.push('   Bônus: +' + node.resourceBonus + '% drop, +' + node.creditBonus + '% créditos')
    if (node.otherResources.length) lines.push('   Também dropa: ' + node.otherResources.join(', '))
  }

  const best = top[0]
  if (best.resources.length >= 2) {
    lines.push('\n─────')
    lines.push('✅ *Recomendação:* rode *' + best.name + '* em *' + best.planet + '* (' + best.missionType + ')' +
      (best.isDarkSector ? ' com bônus de +' + best.resourceBonus + '% drop' : '') +
      ' pra farmar *' + best.resources.join(' e ') + '* ao mesmo tempo.')
    if (unique.length > best.resources.length) {
      const missing = unique.filter((r) => !best.resources.includes(r))
      lines.push('Vai precisar de runs separadas pra: ' + missing.join(', '))
    }
  }

  lines.push('\n💡 _Dica: leve um Smeeta Kavat (double resource) e use Resource Booster pra maximizar o farm._')

  return lines.join('\n').trim()
}

module.exports = { farmRouteOptimizer }
