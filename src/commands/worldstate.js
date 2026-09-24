// src/commands/worldstate.js — fissuras, invasões, ciclos, sortie, archon, nightwave,
// baro, ressurgência, calendário, descendia, oracle bounties, arby, incursões, drops, acrithis, incarnon.
const { register } = require('./router')
const { getFissures, getInterestingFissures } = require('../services/worldstate/fissures')
const {
  getInvasionsMessage, toggleInvasionAlert, listInvasionAlerts, deleteInvasionAlert
} = require('../services/worldstate/invasions')
const { getCycle } = require('../services/worldstate/cycles')
const { getSortie, getArchon, getArchimedea, getEvents, getNightwave } = require('../services/worldstate/missions')
const { getBaro } = require('../services/worldstate/baro')
const { getResurgence } = require('../services/worldstate/resurgence')
const { getCalendar } = require('../services/worldstate/calendar')
const { handleDescendiaCommand } = require('../services/worldstate/descendia')
const { formatOracleCycle, formatLocationBounty } = require('../services/worldstate/oracleBounties')
const { formatArbyMessage, formatIncursionsMessage } = require('../services/worldstate/arbitration')
const { getDrops } = require('../services/worldstate/drops')
const { getAcrithisMessage } = require('../services/worldstate/acrithis')
const { formatIncarnonMessage } = require('../services/incarnon')

register(/^!(fissuras|fissura|fissures)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🕳️ Buscando fissuras...' })
  await sock.sendMessage(from, { text: await getFissures() })
})

register(/^!(fissfarm|fendas|farmfiss|interesse)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🕳️ Buscando fissuras de interesse...' })
  await sock.sendMessage(from, { text: await getInterestingFissures() })
})

register(/^!sortie$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🎯 Buscando sortie...' })
  await sock.sendMessage(from, { text: await getSortie() })
})

register(/^!archon$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '👑 Buscando Archon Hunt...' })
  await sock.sendMessage(from, { text: await getArchon() })
})

register(/^!(archimedea|archmedea)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🧪 Buscando Archimedea...' })
  await sock.sendMessage(from, { text: await getArchimedea() })
})

register(/^!(eventos|events)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '📅 Buscando eventos...' })
  await sock.sendMessage(from, { text: await getEvents() })
})

register(/^!nightwave$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '📡 Buscando Nightwave...' })
  await sock.sendMessage(from, { text: await getNightwave() })
})

register(/^!cetus$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await getCycle('cetus') }) })
register(/^!vallis$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await getCycle('vallis') }) })
register(/^!(deimos|cambion)$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await getCycle('deimos') }) })

register(/^!(ressurgencia|resurgence|varzia)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '♻️ Buscando Resurgence...' })
  await sock.sendMessage(from, { text: await getResurgence() })
})

register(/^!baro$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🛸 Consultando Baro...' })
  await sock.sendMessage(from, { text: await getBaro() })
})

register(/^!invasoes$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '⚔️ Buscando invasões...' })
  await sock.sendMessage(from, { text: await getInvasionsMessage() })
})

register(/^!alertainvasao\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: toggleInvasionAlert(from, match[1].trim()) })
})
register(/^!alertasinvasao$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: listInvasionAlerts(from) })
})
register(/^!delalertainvasao\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: deleteInvasionAlert(from, match[1].trim()) })
})

register(/^!(arby|arbit|arbitragem)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '⚔️ Buscando Arbitrations...' })
  await sock.sendMessage(from, { text: await formatArbyMessage() })
})

register(/^!(incursao|incursões|incursoes|spincursion|sp)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🗡️ Buscando Incursões SP...' })
  await sock.sendMessage(from, { text: await formatIncursionsMessage() })
})

register(/^!(calendario|calendar|1999)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '📅 Buscando Calendário 1999...' })
  await sock.sendMessage(from, { text: await getCalendar() })
})

register(/^!(descendia|descent|devil)(?:\s+(.+))?$/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '🔥 Buscando Descendia...' })
  try {
    const result = await handleDescendiaCommand(match[2] || '')
    for (const t of result.texts) {
      await sock.sendMessage(from, { text: t })
      await new Promise((r) => setTimeout(r, 400))
    }
  } catch (e) {
    console.error(e)
    await sock.sendMessage(from, { text: '❌ Erro ao buscar Descendia.' })
  }
})

register(/^!zariman$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await formatOracleCycle('zariman') }) })
register(/^!(lab|sanctum)$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await formatOracleCycle('lab') }) })
register(/^!(hex|hollvania)$/i, async ({ sock, from }) => { await sock.sendMessage(from, { text: await formatOracleCycle('hex') }) })

register(/^!bounty\s+(cetus|fortuna|deimos|ostron|solaris|entrati|holdfasts?|zariman|cavia|lab|sanctum|hex|hollvania)$/i, async ({ sock, from, match }) => {
  const p = match[1].toLowerCase()
  await sock.sendMessage(from, { text: '🗺️ Buscando bounties...' })
  if (p === 'cetus' || p === 'ostron') await sock.sendMessage(from, { text: await formatLocationBounty('cetus') })
  else if (p === 'fortuna' || p === 'solaris') await sock.sendMessage(from, { text: await formatLocationBounty('fortuna') })
  else if (p === 'deimos' || p === 'entrati') await sock.sendMessage(from, { text: await formatLocationBounty('deimos') })
  else if (p === 'holdfasts' || p === 'holdfast' || p === 'zariman') await sock.sendMessage(from, { text: await formatOracleCycle('zariman') })
  else if (p === 'cavia' || p === 'lab' || p === 'sanctum') await sock.sendMessage(from, { text: await formatOracleCycle('lab') })
  else if (p === 'hex' || p === 'hollvania') await sock.sendMessage(from, { text: await formatOracleCycle('hex') })
})

register(/^!drops\s+(.+)/i, async ({ sock, from, match }) => {
  await sock.sendMessage(from, { text: '📍 Buscando drops de *' + match[1].trim() + '*...' })
  await sock.sendMessage(from, { text: await getDrops(match[1].trim()) })
})

register(/^!(acrithis|acrit|duviri.?shop)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '📜 Consultando Acrithis...' })
  await sock.sendMessage(from, { text: await getAcrithisMessage() })
})

register(/^!(incarnon|incarnons|circuit|circuito)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: formatIncarnonMessage() })
})
