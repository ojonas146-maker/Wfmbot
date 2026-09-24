// src/services/riven/steal.js
// Detector de "riven roubado" (anúncio muito abaixo da mediana oficial).
const fs = require('fs')
const { STEAL_SEEN_FILE, STEAL_MIN_DISCOUNT, STEAL_MIN_MEDIAN } = require('../../config/env')
const { STEAL_SCAN_WEAPONS_FALLBACK } = require('../../config/constants')
const { sleep } = require('../../utils/time')
const { getWeaponMeta, findDisposition, resolveCategoryFromDisp } = require('./baseData')
const { RIVEN_STAT_LABEL, getConfigKey, gradeOneStat, analyzeRivenMeta, formatMetaBlock } = require('./grading')
const { searchRivenAuctions, isIn429Cooldown } = require('./auctionSearch')
const { getOfficialRivenMedian, fmtPlat, getTopWeeklyWeapons } = require('./weekly')
const { loadRivenAlerts } = require('./alerts')

function loadStealSeen() {
  try {
    if (!fs.existsSync(STEAL_SEEN_FILE)) return { ids: [], updated: null }
    return JSON.parse(fs.readFileSync(STEAL_SEEN_FILE, 'utf8'))
  } catch (e) {
    return { ids: [], updated: null }
  }
}
function saveStealSeen(data) {
  try {
    fs.writeFileSync(STEAL_SEEN_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('steal seen:', e.message)
  }
}

function loadStealSubscribers() {
  const store = loadRivenAlerts()
  const jids = {}
  for (const a of store.alerts) jids[a.userJid] = true
  return Object.keys(jids)
}

async function formatStealMessage(auction, medianInfo) {
  const item = auction.item || {}
  const weapon = item.weapon_url_name || '?'
  const name = (item.name || '').replace(/-/g, ' ')
  let title = weapon.replace(/_/g, ' ')
  if (name) title += ' ' + name
  title = title.replace(/\b\w/g, (c) => c.toUpperCase())

  const price = auction.buyout_price != null ? auction.buyout_price : auction.starting_price
  const seller = (auction.owner && (auction.owner.ingame_name || auction.owner.slug)) || '?'
  const status = (auction.owner && auction.owner.status) || '?'
  const median = medianInfo && medianInfo.median
  const diff = median && price != null ? Math.round(((price - median) / median) * 100) : null

  let reply = '💎 *RIVEN ROUBADO DETECTADO*\n\n'
  reply += '🔫 *' + title + '*\n'
  reply += '💰 *' + (price != null ? price + 'p' : '?') + '*'
  if (median != null) reply += '  (mediana *' + fmtPlat(median) + '*)'
  if (diff != null) reply += '\n📉 *' + diff + '% abaixo da mediana*'
  reply += '\n👤 ' + seller + ' (' + status + ')\n\n'

  const attrs = item.attributes || []
  const analysis = analyzeRivenMeta(weapon, attrs, getWeaponMeta)
  reply += formatMetaBlock(analysis)

  reply += '*Stats:*\n'
  const disp = findDisposition(weapon)
  const disposition = disp ? disp.disposition : null
  const category = resolveCategoryFromDisp(disp)
  const configKey = getConfigKey(attrs)
  const mrSt = item.mod_rank != null ? Number(item.mod_rank) : 8
  const mxSt = item.mod_max_rank != null ? Number(item.mod_max_rank) : 8
  for (const a of attrs) {
    const sign = a.positive === false ? '' : '+'
    const label = RIVEN_STAT_LABEL[a.url_name] || a.url_name
    let line = '• ' + sign + a.value + ' ' + label
    if (disposition != null) {
      const g = gradeOneStat(a, category, disposition, configKey, mrSt, mxSt)
      if (g.grade) {
        const devStr = (g.dev >= 0 ? '+' : '') + g.dev.toFixed(1) + '%'
        line += ' → *' + g.grade + '* (' + devStr + ')'
      }
    }
    reply += line + '\n'
  }

  reply += '\n🔗 https://warframe.market/auction/' + auction.id + '\n'
  reply += "💬 `/w " + seller + " hi` — *age rápido*"
  return reply.trim()
}

let stealLock = false

async function checkRivenSteals(sock) {
  if (stealLock) {
    console.log('💎 Steal detector já em execução')
    return
  }
  stealLock = true
  try {
    if (isIn429Cooldown()) {
      console.log('💎 Steal: pulando ciclo inteiro (cooldown 429 ainda ativo)')
      return
    }

    const subs = loadStealSubscribers()
    if (!subs.length) {
      console.log('💎 Steal: nenhum inscrito (crie !alertariven para receber)')
      return
    }

    const seen = loadStealSeen()
    if (!Array.isArray(seen.ids)) seen.ids = []
    const seenSet = {}
    for (const id of seen.ids) seenSet[id] = true

    let scanList = STEAL_SCAN_WEAPONS_FALLBACK.slice()
    try {
      const weekTops = await getTopWeeklyWeapons(20, 'price', null)
      if (weekTops && weekTops.length) {
        const merged = []
        const seenW = {}
        for (const wt of weekTops) {
          const wk = wt.weaponKey
          if (!seenW[wk]) { seenW[wk] = true; merged.push(wk) }
        }
        for (const fk of STEAL_SCAN_WEAPONS_FALLBACK) {
          if (!seenW[fk]) { seenW[fk] = true; merged.push(fk) }
        }
        scanList = merged.slice(0, 10)
      }
    } catch (eWeek) {
      console.error('steal week tops:', eWeek.message)
    }

    let found = 0
    for (const weapon of scanList) {
      if (isIn429Cooldown()) {
        console.log('💎 steal: interrompendo scan por cooldown 429')
        break
      }

      const meta = getWeaponMeta(weapon)
      const positiveStats = meta && meta.must_have ? meta.must_have.slice(0, 2) : []

      const auctions = await searchRivenAuctions(weapon, positiveStats)
      console.log('💎 steal scan ' + weapon + ': ' + auctions.length)

      if (isIn429Cooldown()) {
        console.log('💎 steal: 429 detectado após ' + weapon + ' — parando')
        break
      }

      for (const auction of auctions) {
        if (!auction || !auction.id || seenSet[auction.id]) continue
        if (auction.closed) continue
        if (auction.item && auction.item.type && auction.item.type !== 'riven') continue

        const price = auction.buyout_price != null ? auction.buyout_price : auction.starting_price
        if (price == null || price <= 0) continue

        let off = null
        try { off = await getOfficialRivenMedian(weapon) } catch (e) {}
        if (!off || off.median == null || off.median < STEAL_MIN_MEDIAN) continue

        const ratio = price / off.median
        if (ratio > (1 - STEAL_MIN_DISCOUNT)) continue

        const attrs = (auction.item && auction.item.attributes) || []
        const analysis = analyzeRivenMeta(weapon, attrs, getWeaponMeta)
        if (analysis.hasMeta && analysis.mustHaveHit < analysis.mustHaveTotal) continue
        if (analysis.hasMeta && (analysis.label === 'MEH' || analysis.label === 'PARCIAL')) continue

        seenSet[auction.id] = true
        seen.ids.push(auction.id)
        found++

        const msg = await formatStealMessage(auction, off)
        for (const s of subs) {
          try { await sock.sendMessage(s, { text: msg }) } catch (e) { console.error('steal send:', e.message) }
        }
      }

      await sleep(2500)
    }

    if (seen.ids.length > 200) seen.ids = seen.ids.slice(-200)
    seen.updated = new Date().toISOString()
    saveStealSeen(seen)
    console.log('💎 Steal detector: ' + found + ' roubado(s)')
  } catch (e) {
    console.error('Steal detector:', e.message)
  } finally {
    stealLock = false
  }
}

module.exports = { checkRivenSteals, formatStealMessage, loadStealSeen, saveStealSeen, loadStealSubscribers }
