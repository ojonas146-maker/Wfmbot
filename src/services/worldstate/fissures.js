// src/services/worldstate/fissures.js
const { fetchWS } = require('./fetchWS')
const { formatTimeLeft } = require('../../utils/time')
const { FISS_INTEREST_DEFENSE, FISS_INTEREST_EXTERMINATE } = require('../../config/constants')

async function getFissures() {
  try {
    const list = await fetchWS('fissures')
    if (!list || !list.length) return '❌ Nenhuma fissura ativa.'
    const normal = [], steel = []
    for (const f of list) (f.isHard ? steel : normal).push(f)
    const sortTier = (a, b) => (a.tierNum || 0) - (b.tierNum || 0)
    normal.sort(sortTier)
    steel.sort(sortTier)

    function block(title, arr) {
      let t = title + '\n'
      if (!arr.length) return t + '_Nenhuma_\n'
      for (const f of arr) {
        const left = f.expiry ? formatTimeLeft(new Date(f.expiry).getTime() - Date.now()) : '?'
        t += '• *' + (f.tier || '?') + '* — ' + (f.missionType || '?') + '\n'
        t += '  ' + (f.node || '?') + ' | ' + (f.enemy || '') + '\n'
        t += '  ⏳ ' + left + '\n'
      }
      return t
    }

    let reply = '🕳️ *Fissuras ativas*\n\n'
    reply += block('*Normais*', normal) + '\n'
    reply += block('⚔️ *Steel Path*', steel)
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar fissuras. (API warframestat offline/lenta — tente de novo)\n_' + String(err.message || '').slice(0, 80) + '_'
  }
}

function matchFissNode(node, list) {
  const n = String(node || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return list.some((x) => n.indexOf(x) !== -1)
}
function isDefenseMission(type) { return /defense|defesa/i.test(String(type || '')) }
function isExterminateMission(type) { return /exterminat|exterm[ií]nio/i.test(String(type || '')) }
function isCascadeMission(type) { return /cascade|void cascade/i.test(String(type || '')) }

function sortExterminatePriority(arr) {
  function priority(node) {
    const n = String(node || '').toLowerCase()
    if (/mariana/i.test(n)) return 0
    if (/e prime/i.test(n)) return 1
    if (/oxomoco/i.test(n)) return 2
    return 10
  }
  return arr.slice().sort((a, b) => {
    const pa = priority(a.node), pb = priority(b.node)
    if (pa !== pb) return pa - pb
    return (a.tierNum || 0) - (b.tierNum || 0)
  })
}

async function getInterestingFissures() {
  try {
    const list = await fetchWS('fissures')
    if (!list || !list.length) return '❌ Nenhuma fissura ativa.'

    let normalDef = [], normalEx = [], steelDef = [], steelEx = [], steelCascade = []

    for (const f of list) {
      const node = f.node || ''
      const type = f.missionType || ''
      const isSteel = !!f.isHard

      if (isDefenseMission(type) && matchFissNode(node, FISS_INTEREST_DEFENSE)) {
        (isSteel ? steelDef : normalDef).push(f)
      } else if (isExterminateMission(type)) {
        (isSteel ? steelEx : normalEx).push(f)
      } else if (isSteel && isCascadeMission(type)) {
        steelCascade.push(f)
      }
    }

    const sortTier = (a, b) => (a.tierNum || 0) - (b.tierNum || 0)
    normalDef.sort(sortTier)
    steelDef.sort(sortTier)
    normalEx = sortExterminatePriority(normalEx)
    steelEx = sortExterminatePriority(steelEx)
    steelCascade.sort(sortTier)

    function blockItems(arr) {
      if (!arr.length) return '_Nenhuma_\n'
      let t = ''
      for (const f of arr) {
        const left = f.expiry ? formatTimeLeft(new Date(f.expiry).getTime() - Date.now()) : '?'
        t += '• *' + (f.tier || '?') + '* — ' + (f.missionType || '?') + '\n'
        t += '  ' + (f.node || '?') + ' | ' + (f.enemy || '') + '\n'
        t += '  ⏳ ' + left + '\n'
      }
      return t
    }

    const hasAny = normalDef.length || normalEx.length || steelDef.length || steelEx.length || steelCascade.length
    if (!hasAny) return '🕳️ *Fissuras de Interesse*\n\n_Nenhuma fissura de Defesa/Extermínio nos nodes de interesse no momento._'

    let reply = '🕳️ *Fissuras de Interesse*\n\n'
    reply += '*Normais*\n'
    reply += '*Defesa*\n' + blockItems(normalDef)
    reply += '\n*Extermínio*\n' + blockItems(normalEx)
    reply += '\n⚔️ *Steel Path*\n'
    reply += '*Defesa*\n' + blockItems(steelDef)
    reply += '\n*Extermínio*\n' + blockItems(steelEx)
    if (steelCascade.length) reply += '\n*Void Cascade*\n' + blockItems(steelCascade)

    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar fissuras de interesse. (API lenta/offline — tente de novo)\n_' + String(err.message || '').slice(0, 80) + '_'
  }
}

module.exports = { getFissures, getInterestingFissures }
