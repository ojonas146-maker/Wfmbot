// src/services/riven/alerts.js
// Alertas/sniper de riven: criação, matching, formatação de mensagem,
// checagem periódica, dedupe (riven_seen) e !grade (análise de 1 leilão).
const fs = require('fs')
const axios = require('axios')
const { RIVEN_ALERTS_FILE, RIVEN_SEEN_FILE } = require('../../config/env')
const { jidToNumber } = require('../../utils/text')
const { getRivenAlertLimit, canUseRivenSnipe, isAdmin } = require('../../core/adminAuth')
const { getWeaponMeta, findDisposition, resolveCategoryFromDisp, getDispositionsList } = require('./baseData')
const {
  RIVEN_STAT_LABEL, RIVEN_STAT_ALIASES, resolveRivenStat, getConfigKey,
  gradeOneStat, gradeRank, analyzeRivenMeta, formatMetaBlock,
  formatVariantBlocks
} = require('./grading')
const { searchRivenAuctions, searchRivenAuctionsBroad } = require('./auctionSearch')
const { getOfficialRivenMedian, fmtPlat, getTopWeeklyWeapons } = require('./weekly')

// ---------------------------------------------------------------- storage
function loadRivenAlerts() {
  try {
    if (!fs.existsSync(RIVEN_ALERTS_FILE)) return { nextId: 1, alerts: [] }
    return JSON.parse(fs.readFileSync(RIVEN_ALERTS_FILE, 'utf8'))
  } catch (e) {
    return { nextId: 1, alerts: [] }
  }
}
function saveRivenAlerts(data) {
  fs.writeFileSync(RIVEN_ALERTS_FILE, JSON.stringify(data, null, 2))
}

function countUserRivenAlerts(userJid) {
  const { configHasUser } = require('../../core/adminAuth')
  try {
    return loadRivenAlerts().alerts.filter((a) => configHasUser([a.userJid], userJid) || a.userJid === userJid).length
  } catch (e) {
    return 0
  }
}

// ---------------------------------------------------------------- parsing
function parseRivenAlertArgs(raw) {
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 1) return null

  const weapon = parts[0].toLowerCase().replace(/\s+/g, '_')
  const stats = []
  let maxPrice = null
  let useMeta = false
  let minGrade = null
  let minPositives = 2
  let maxPositives = 3

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].toLowerCase()
    if (p === 'meta' || p === 'god' || p === 'godroll') { useMeta = true; continue }
    if (p === '3p' || p === '3p1n' || p === 'three') { minPositives = 3; maxPositives = 3; continue }
    if (p === '2p' || p === '2p1n') { minPositives = 2; maxPositives = 2; continue }
    if (p === 'grade' || p === 'mingrade') {
      const g = String(parts[i + 1] || '').toUpperCase()
      if (/^(S|\+A|A|-A|\+B|B)$/.test(g)) { minGrade = g; i++ }
      continue
    }
    if (p === 's' && parts.length > 2) { minGrade = 'S'; continue }
    if (p === 'max' || p === '<=') {
      const n = parseInt(parts[i + 1], 10)
      if (!isNaN(n)) { maxPrice = n; i++ }
      continue
    }
    if (/^\d+$/.test(p) && i === parts.length - 1) { maxPrice = parseInt(p, 10); continue }
    const url = resolveRivenStat(p)
    if (url) {
      if (stats.indexOf(url) === -1) stats.push(url)
    } else {
      return { error: 'Stat desconhecido: *' + p + '*\nEx: ms fr cc cd sc dmg | meta | grade S' }
    }
  }

  if (useMeta && !stats.length) {
    const meta = getWeaponMeta(weapon)
    if (meta && meta.must_have && meta.must_have.length) stats.push(...meta.must_have)
  }
  if (!stats.length && !useMeta) {
    return { error: 'Informe stats ou use *meta*.\nEx: !alertariven torid ms cd max 2000\n!alertariven burston meta grade +A max 5000' }
  }

  return { weapon, stats, maxPrice, useMeta, minGrade, minPositives, maxPositives }
}

// ---------------------------------------------------------------- CRUD
function createRivenAlert(userJid, rawArgs, isAdmFlag) {
  const parsed = parseRivenAlertArgs(rawArgs)
  if (!parsed) {
    return (
      '❌ *Como usar (Riven Sniper):*\n' +
      '!alertariven <arma> <stats...> [meta] [grade S|+A] [max N] [2p|3p]\n\n' +
      'Exemplos:\n' +
      '• !alertariven kohm ms fr max 500\n' +
      '• !alertariven burston ms cc cd max 5000\n' +
      '• !alertariven torid meta max 2500\n' +
      '• !alertariven burston meta grade +A max 4000\n' +
      '• !alertariven ballistica ms cd 2p max 3000'
    )
  }
  if (parsed.error) return '❌ ' + parsed.error

  const adm = isAdmFlag === true || isAdmin(userJid)
  if (!canUseRivenSnipe(userJid, adm)) return '❌ Snipe de riven está *desativado* pelo admin no momento.'
  const cur = countUserRivenAlerts(userJid)
  const lim = getRivenAlertLimit(userJid, adm)
  if (!adm && cur >= lim) {
    return '❌ Limite de snipes de riven: *' + lim + '*. Você já tem ' + cur + '.\nUse `!delalertariven all` ou apague alguns.'
  }

  const store = loadRivenAlerts()
  const id = store.nextId++
  const statLabels = (parsed.stats || []).map((s) => RIVEN_STAT_LABEL[s] || s)

  store.alerts.push({
    id, userJid, weapon: parsed.weapon, stats: parsed.stats || [], maxPrice: parsed.maxPrice,
    useMeta: !!parsed.useMeta, minGrade: parsed.minGrade || null,
    minPositives: parsed.minPositives != null ? parsed.minPositives : ((parsed.stats || []).length >= 3 ? 3 : 2),
    maxPositives: parsed.maxPositives != null ? parsed.maxPositives : 3,
    createdAt: new Date().toISOString(), notified: []
  })
  saveRivenAlerts(store)

  let reply = ' RIVEN SNIPER ATIVADO\n\n'
  reply += ' Arma: ' + parsed.weapon + '\n'
  if (statLabels.length) reply += ' Stats: ' + statLabels.join(', ') + '\n'
  if (parsed.useMeta) reply += ' Filtro: META / GOD ROLL\n'
  if (parsed.minGrade) reply += ' Grade mín: ' + parsed.minGrade + '\n'
  if (parsed.maxPrice != null) reply += ' Máx: ' + parsed.maxPrice + 'p\n'
  const posLabel = parsed.maxPositives === 2 ? 'somente 2P' : (parsed.minPositives === 3 || (parsed.stats || []).length >= 3) ? '3P' : '2P ou 3P'
  reply += ' Positivos: ' + posLabel + '\n'
  reply += '\nID: #' + id + '\n'
  reply += 'Só anúncios novos após este alerta.\n'
  reply += 'Verificação a cada ~4 min.'
  return reply
}

function listRivenAlerts(userJid) {
  const { configHasUser } = require('../../core/adminAuth')
  const store = loadRivenAlerts()
  const mine = store.alerts.filter((a) => a.userJid === userJid || configHasUser([a.userJid], userJid))
  if (!mine.length) return '🔔 Sem alertas de riven.\nCrie: !alertariven torid meta max 2500'
  let reply = '🎯 *SEUS RIVEN SNIPERS*\n\n'
  for (const a of mine) {
    const labels = (a.stats || []).map((s) => RIVEN_STAT_LABEL[s] || s)
    reply += '#' + a.id + ' *' + (a.weekDisplay || a.weapon) + '*'
    if (labels.length) reply += ' | ' + labels.join(', ')
    if (a.useMeta) reply += ' | META'
    if (a.minGrade) reply += ' | grade≥' + a.minGrade
    if (a.maxPrice != null) reply += ' | max ' + a.maxPrice + 'p'
    if (a.source === 'week') reply += ' | 📅semana'
    reply += '\n'
  }
  return reply.trim()
}

function deleteRivenAlert(userJid, arg) {
  const { configHasUser } = require('../../core/adminAuth')
  const store = loadRivenAlerts()
  if (/^all$/i.test(arg)) {
    const before = store.alerts.length
    store.alerts = store.alerts.filter((a) => !(a.userJid === userJid || configHasUser([a.userJid], userJid)))
    const removed = before - store.alerts.length
    saveRivenAlerts(store)
    return removed ? '🔕 ' + removed + ' alerta(s) de riven removido(s).' : 'Você não tinha alertas de riven.'
  }
  const id = parseInt(arg, 10)
  if (!id) return '❌ Use: !delalertariven 1  ou  !delalertariven all'
  const idx = store.alerts.findIndex((a) => a.id === id && a.userJid === userJid)
  if (idx === -1) return '❌ Alerta de riven #' + id + ' não encontrado.'
  store.alerts.splice(idx, 1)
  saveRivenAlerts(store)
  return '🔕 Alerta de riven *#' + id + '* removido.'
}

// ---------------------------------------------------------------- matching
function rivenMatchesAlert(auction, alert) {
  if (!auction || !auction.item) return false
  if (auction.closed) return false
  if (auction.item.type && auction.item.type !== 'riven') return false

  const weapon = (auction.item.weapon_url_name || '').toLowerCase()
  if (weapon !== alert.weapon) return false

  const price = auction.buyout_price != null ? auction.buyout_price : auction.starting_price
  if (alert.maxPrice != null && price != null && price > alert.maxPrice) return false

  const attrs = auction.item.attributes || []
  const positiveNames = {}
  for (const a of attrs) if (a.positive !== false) positiveNames[a.url_name] = true
  const stats = alert.stats || []
  for (const s of stats) if (!positiveNames[s]) return false

  let posCount = 0, negCount = 0
  for (const a of attrs) { if (a.positive === false) negCount++; else posCount++ }
  const minPos = alert.minPositives != null ? alert.minPositives : 2
  const maxPos = alert.maxPositives != null ? alert.maxPositives : 3
  if (posCount < minPos || posCount > maxPos) return false

  if (alert.useMeta) {
    const analysis = analyzeRivenMeta(weapon, attrs, getWeaponMeta)
    if (!analysis.hasMeta) return false
    if (analysis.mustHaveHit < analysis.mustHaveTotal) return false
    if (analysis.label === 'MEH' || analysis.label === 'PARCIAL') return false
  }

  if (alert.minGrade) {
    const disp = findDisposition(weapon)
    if (!disp || disp.disposition == null) return false
    const category = resolveCategoryFromDisp(disp)
    const configKey = getConfigKey(attrs)
    const mrG = auction.item && auction.item.mod_rank != null ? Number(auction.item.mod_rank) : 8
    const mxG = auction.item && auction.item.mod_max_rank != null ? Number(auction.item.mod_max_rank) : 8
    let best = -1
    for (const a of attrs) {
      if (a.positive === false) continue
      const g = gradeOneStat(a, category, disp.disposition, configKey, mrG, mxG)
      if (g.grade) best = Math.max(best, gradeRank(g.grade))
    }
    if (best < gradeRank(alert.minGrade)) return false
  }

  return true
}

async function formatRivenAuctionMessage(auction, alert) {
  const item = auction.item || {}
  const weapon = item.weapon_url_name || alert.weapon
  const name = (item.name || '').replace(/-/g, ' ')
  let title = weapon.replace(/_/g, ' ')
  if (name) title += ' ' + name
  title = title.replace(/\b\w/g, (c) => c.toUpperCase())

  const price = auction.buyout_price != null ? auction.buyout_price : auction.starting_price
  const seller = (auction.owner && (auction.owner.ingame_name || auction.owner.slug)) || '?'
  const status = (auction.owner && auction.owner.status) || '?'
  const direct = auction.is_direct_sell ? 'Direct' : 'Auction'

  let reply = '🚨 *ALERTA DE RIVEN*'
  if (alert && alert.id != null) reply += '  #' + alert.id
  if (alert && alert.source === 'week') reply += '  📅semana'
  reply += '\n\n'
  reply += '🔫 *' + title + '*\n'
  reply += '💰 *' + (price != null ? price + 'p' : '?') + '* | ' + direct
  if (alert && alert.maxPrice != null) reply += ' (snipe ≤' + alert.maxPrice + 'p)'
  reply += '\n'
  reply += '👤 ' + seller + ' (' + status + ')\n'

  try {
    const off = await getOfficialRivenMedian(weapon)
    if (off && off.median != null) {
      reply += '📊 Mediana oficial: *' + fmtPlat(off.median) + '*'
      reply += off.rerolled ? ' (rolled)' : ' (unrolled)'
      reply += '\n'
      if (price != null && off.median > 0) {
        const diff = Math.round(((price - off.median) / off.median) * 100)
        if (diff <= -15) reply += '🔥 *Abaixo da mediana (' + diff + '%)*\n'
        else if (diff >= 30) reply += '⚠️ Acima da mediana (+' + diff + '%)\n'
      }
    }
  } catch (e) {}

  reply += '\n*Stats:*\n'
  const attrs = item.attributes || []
  const disp = findDisposition(weapon)
  const disposition = disp ? disp.disposition : null
  const category = resolveCategoryFromDisp(disp)
  const configKey = getConfigKey(attrs)
  const mrMsg = item.mod_rank != null ? Number(item.mod_rank) : 8
  const mxMsg = item.mod_max_rank != null ? Number(item.mod_max_rank) : 8

  if (disposition != null) {
    reply += '_' + configKey + ' · dispo ' + disposition
    if (disp && disp.name) reply += ' · ' + disp.name
    reply += '_\n'
  }

  for (const a of attrs) {
    const sign = a.positive === false ? '' : '+'
    const label = RIVEN_STAT_LABEL[a.url_name] || a.url_name
    let line = '• ' + sign + a.value + ' ' + label
    if (disposition != null) {
      const g = gradeOneStat(a, category, disposition, configKey, mrMsg, mxMsg)
      if (g.grade) {
        const devStr = (g.dev >= 0 ? '+' : '') + g.dev.toFixed(1) + '%'
        line += ' → *' + g.grade + '* (' + devStr + ')'
      }
    }
    reply += line + '\n'
  }
  reply += '\n'

  try {
    const analysis = analyzeRivenMeta(weapon, attrs, getWeaponMeta)
    reply += formatMetaBlock(analysis)
  } catch (e) {}

  reply += '\n🔗 https://warframe.market/auction/' + auction.id + '\n'
  reply += '💬 `/w ' + seller + ' hi`\n'
  return reply.trim()
}

// ---------------------------------------------------------------- seen/dedupe
function rivenSeenKey(userJid) {
  const raw = String(userJid || '')
  const num = jidToNumber(raw)
  if (num && num.length >= 10) return num
  return raw
}

function loadRivenSeen() {
  try {
    if (!fs.existsSync(RIVEN_SEEN_FILE)) return {}
    const d = JSON.parse(fs.readFileSync(RIVEN_SEEN_FILE, 'utf8'))
    return d && typeof d === 'object' ? d : {}
  } catch (e) {
    return {}
  }
}
function saveRivenSeen(data) {
  try {
    fs.writeFileSync(RIVEN_SEEN_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('riven seen save:', e.message)
  }
}

function rivenAuctionFingerprint(auction) {
  if (!auction || !auction.item) return null
  const item = auction.item
  const weapon = String(item.weapon_url_name || '').toLowerCase()
  let owner = ''
  if (auction.owner) owner = String(auction.owner.ingame_name || auction.owner.ingameName || auction.owner.slug || '').toLowerCase()
  const attrs = (item.attributes || []).slice().map((a) => (a.positive === false ? '-' : '+') + a.url_name + ':' + a.value)
  attrs.sort()
  const name = String(item.name || '').toLowerCase()
  return [weapon, name, owner, attrs.join('|')].join('::')
}

function hasSeenRiven(userJid, auctionIdOrFp) {
  if (!auctionIdOrFp) return false
  const store = loadRivenSeen()
  const key = rivenSeenKey(userJid)
  const list = store[key] || store[userJid] || []
  return list.indexOf(String(auctionIdOrFp)) !== -1
}

function markSeenRiven(userJid, auctionIdOrFp) {
  if (!userJid || !auctionIdOrFp) return
  const id = String(auctionIdOrFp)
  const store = loadRivenSeen()
  const key = rivenSeenKey(userJid)
  if (!store[key]) store[key] = []
  if (store[userJid] && userJid !== key && Array.isArray(store[userJid])) {
    for (const old of store[userJid]) {
      if (store[key].indexOf(old) === -1) store[key].push(old)
    }
    delete store[userJid]
  }
  if (store[key].indexOf(id) === -1) {
    store[key].push(id)
    if (store[key].length > 600) store[key] = store[key].slice(-600)
    saveRivenSeen(store)
  }
}

function markAuctionSeenForUser(userJid, auction, alertNotified) {
  if (!auction) return
  const aid = auction.id != null ? String(auction.id) : null
  const fp = rivenAuctionFingerprint(auction)
  if (aid) {
    markSeenRiven(userJid, aid)
    if (alertNotified && alertNotified.indexOf(aid) === -1) alertNotified.push(aid)
  }
  if (fp) {
    markSeenRiven(userJid, fp)
    if (alertNotified && alertNotified.indexOf(fp) === -1) alertNotified.push(fp)
  }
}

function wasAuctionSeen(userJid, auction, alertNotified) {
  if (!auction) return true
  const aid = auction.id != null ? String(auction.id) : null
  const fp = rivenAuctionFingerprint(auction)
  if (aid && alertNotified && alertNotified.indexOf(aid) !== -1) return true
  if (fp && alertNotified && alertNotified.indexOf(fp) !== -1) return true
  if (aid && hasSeenRiven(userJid, aid)) return true
  if (fp && hasSeenRiven(userJid, fp)) return true
  return false
}

// ---------------------------------------------------------------- checagem periódica
let rivenAlertLock = false

async function checkRivenAlerts(sock) {
  if (rivenAlertLock) {
    console.log('⏳ checkRivenAlerts já em execução — pulando (anti-duplicata)')
    return
  }
  rivenAlertLock = true
  try {
    const store = loadRivenAlerts()
    console.log('🔫 checkRivenAlerts: ' + store.alerts.length + ' alerta(s)')
    if (!store.alerts.length) return

    const byWeapon = {}
    for (const a of store.alerts) {
      const wKey = String(a.weapon || '').toLowerCase()
      if (!byWeapon[wKey]) byWeapon[wKey] = []
      byWeapon[wKey].push(a)
    }

    let changed = false
    const weapons = Object.keys(byWeapon)
    const sentThisCycle = {}

    for (const weapon of weapons) {
      const alerts = byWeapon[weapon]
      const statsForSearch = []
      const seenStat = {}
      for (const al of alerts) {
        for (const s of al.stats || []) {
          if (!seenStat[s]) { seenStat[s] = true; statsForSearch.push(s) }
        }
      }
      const anyMeta = alerts.some((a) => a.useMeta || a.source === 'week')
      const auctions = anyMeta
        ? await searchRivenAuctionsBroad(weapon, statsForSearch)
        : await searchRivenAuctions(weapon, statsForSearch)
      console.log('🔫 riven search "' + weapon + '": ' + auctions.length + ' anúncio(s)' + (anyMeta ? ' [broad]' : ''))

      for (const alert of alerts) {
        if (!Array.isArray(alert.notified)) alert.notified = []

        const candidates = []
        const userKey = rivenSeenKey(alert.userJid)

        for (const auction of auctions) {
          if (!auction || auction.id == null) continue
          const aid = String(auction.id)

          if (!rivenMatchesAlert(auction, alert)) continue

          if (wasAuctionSeen(alert.userJid, auction, alert.notified)) {
            markAuctionSeenForUser(alert.userJid, auction, alert.notified)
            changed = true
            continue
          }

          const cycleKey = userKey + '|' + aid
          const fp = rivenAuctionFingerprint(auction)
          if (sentThisCycle[cycleKey] || (fp && sentThisCycle[userKey + '|' + fp])) {
            markAuctionSeenForUser(alert.userJid, auction, alert.notified)
            changed = true
            continue
          }

          const createdMs = auction.created ? new Date(auction.created).getTime() : 0
          const alertMs = alert.createdAt ? new Date(alert.createdAt).getTime() : 0
          if (createdMs && alertMs && createdMs < alertMs) {
            markAuctionSeenForUser(alert.userJid, auction, alert.notified)
            changed = true
            continue
          }

          candidates.push(auction)
        }

        if (alert.preferCheapest || alert.source === 'week') {
          candidates.sort((a, b) => {
            const pa = a.buyout_price != null ? a.buyout_price : (a.starting_price != null ? a.starting_price : 999999)
            const pb = b.buyout_price != null ? b.buyout_price : (b.starting_price != null ? b.starting_price : 999999)
            if (pa !== pb) return pa - pb
            return new Date(b.created || 0) - new Date(a.created || 0)
          })
        } else {
          candidates.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0))
        }

        if (candidates.length) {
          const top = candidates[0]
          const topId = String(top.id)
          const topFp = rivenAuctionFingerprint(top)

          if (wasAuctionSeen(alert.userJid, top, alert.notified) ||
              sentThisCycle[userKey + '|' + topId] ||
              (topFp && sentThisCycle[userKey + '|' + topFp])) {
            for (const c of candidates) markAuctionSeenForUser(alert.userJid, c, alert.notified)
            changed = true
            continue
          }

          markAuctionSeenForUser(alert.userJid, top, alert.notified)
          sentThisCycle[userKey + '|' + topId] = true
          if (topFp) sentThisCycle[userKey + '|' + topFp] = true
          for (let k = 1; k < candidates.length; k++) markAuctionSeenForUser(alert.userJid, candidates[k], alert.notified)
          if (alert.notified.length > 120) alert.notified = alert.notified.slice(-120)
          changed = true
          saveRivenAlerts(store)

          try {
            const msg = await formatRivenAuctionMessage(top, alert)
            await sock.sendMessage(alert.userJid, { text: msg })
          } catch (e) {
            console.error('Erro envio alerta riven:', e.message)
          }
        }
      }

      await require('../../utils/time').sleep(400)
    }

    if (changed) saveRivenAlerts(store)
  } finally {
    rivenAlertLock = false
  }
}

// ---------------------------------------------------------------- !grade
function extractAuctionId(input) {
  const s = String(input || '').trim()
  const m = s.match(/auction\/([a-f0-9]+)/i)
  if (m) return m[1]
  if (/^[a-f0-9]{20,}$/i.test(s)) return s
  return null
}

async function fetchAuctionById(id) {
  const res = await axios.get('https://api.warframe.market/v1/auctions/entry/' + id, {
    timeout: 20000,
    headers: {
      Platform: 'pc', Language: 'en', Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://warframe.market', Referer: 'https://warframe.market/'
    }
  })
  return res.data && res.data.payload && res.data.payload.auction
}

async function getRivenGradeMessage(rawInput) {
  const id = extractAuctionId(rawInput)
  if (!id) {
    return '❌ *Como usar:*\n!grade <link do auction>\n!grade <id>\n\nEx: !grade https://warframe.market/auction/6a8e1d5e51f7f208aa0db472'
  }

  try {
    const auction = await fetchAuctionById(id)
    if (!auction || !auction.item) return '❌ Anúncio não encontrado.'

    const item = auction.item
    const weapon = item.weapon_url_name || '?'
    const rivenName = (item.name || '').replace(/-/g, ' ')
    const attrs = item.attributes || []
    const price = auction.buyout_price != null ? auction.buyout_price : auction.starting_price
    const seller = (auction.owner && (auction.owner.ingame_name || auction.owner.slug)) || '?'
    const status = (auction.owner && auction.owner.status) || '?'
    const rank = item.mod_rank != null ? item.mod_rank : '?'
    const rerolls = item.re_rolls != null ? item.re_rolls : '?'
    const mr = item.mastery_level != null ? item.mastery_level : '?'

    const disp = findDisposition(weapon)
    const disposition = disp ? disp.disposition : null
    const category = resolveCategoryFromDisp(disp)
    const configKey = getConfigKey(attrs)
    const modRankNum = item.mod_rank != null ? Number(item.mod_rank) : 8
    const maxRankNum = item.mod_max_rank != null ? Number(item.mod_max_rank) : 8

    let title = weapon.replace(/_/g, ' ')
    if (rivenName) title += ' ' + rivenName
    title = title.replace(/\b\w/g, (c) => c.toUpperCase())

    let reply = '🔫 *' + title + '*\n'
    if (disposition != null) {
      reply += 'Disposition: *' + disposition + '* | ' + configKey + ' | ' + category
      if (disp && disp.name) reply += ' · ' + disp.name
      reply += '\n'
    } else {
      reply += 'Disposition: *?* | ' + configKey + ' | ' + category + '\n'
      reply += '_Arma não encontrada em dispositions.json_\n'
    }
    reply += 'Rank *' + rank + '* | Rerolls *' + rerolls + '* | MR *' + mr + '*\n'
    reply += '💰 *' + (price != null ? price + 'p' : '?') + '* | ' + seller + ' (' + status + ')\n\n'

    reply += '*Stats:*\n'
    for (const a of attrs) {
      const g = disposition != null
        ? gradeOneStat(a, category, disposition, configKey, modRankNum, maxRankNum)
        : { label: RIVEN_STAT_LABEL[a.url_name] || a.url_name, value: a.value, positive: a.positive !== false, grade: null, dev: null }
      const sign = g.positive ? '+' : ''
      let line = '• ' + sign + g.value + ' ' + g.label
      if (g.grade) {
        const devStr = (g.dev >= 0 ? '+' : '') + g.dev.toFixed(1) + '%'
        line += ' → *' + g.grade + '* (' + devStr + ')'
      } else if (g.note) {
        line += ' _(' + g.note + ')_'
      }
      reply += line + '\n'
    }

    // Variantes da mesma família com disposition diferente (Prime, Mk1, Wraith, etc.)
    if (disposition != null) {
      try {
        const variantsText = formatVariantBlocks(
          attrs,
          disposition,
          (disp && disp.name) || weapon,
          getDispositionsList(),
          category,
          configKey,
          modRankNum,
          maxRankNum
        )
        if (variantsText) reply += variantsText
      } catch (e) {
        console.error('!grade variants:', e.message)
      }
    }

    const analysis = analyzeRivenMeta(weapon, attrs, getWeaponMeta)
    reply += '\n' + formatMetaBlock(analysis)

    try {
      const off = await getOfficialRivenMedian(weapon)
      if (off && off.median != null) {
        reply += '\n📊 Mediana oficial: *' + fmtPlat(off.median) + '*'
        if (price != null && off.median > 0) {
          const diff = Math.round(((price - off.median) / off.median) * 100)
          reply += ' | Anúncio: ' + (diff >= 0 ? '+' : '') + diff + '% vs mediana'
        }
        reply += '\n'
      }
    } catch (e) {}

    reply += '\n🔗 https://warframe.market/auction/' + id
    return reply.trim()
  } catch (e) {
    console.error('!grade:', e.message)
    return '❌ Erro ao buscar/analisar o anúncio.'
  }
}

// ---------------------------------------------------------------- snipe da semana
async function createWeekSnipers(userJid, rawArgs, isAdmFlag) {
  const args = String(rawArgs || '').trim().toLowerCase().split(/\s+/).filter(Boolean)

  if (args[0] === 'clear' || args[0] === 'limpar' || args[0] === 'off') {
    const store = loadRivenAlerts()
    const before = store.alerts.length
    store.alerts = store.alerts.filter((a) => !((a.userJid === userJid || require('../../core/adminAuth').configHasUser([a.userJid], userJid)) && a.source === 'week'))
    const removed = before - store.alerts.length
    saveRivenAlerts(store)
    return removed ? '✅ Removidos *' + removed + '* sniper(s) da semana.' : 'Você não tinha snipers da semana ativos.'
  }

  const admWeek = isAdmFlag === true || isAdmin(userJid)
  if (!canUseRivenSnipe(userJid, admWeek)) return '❌ Snipe de riven está *desativado* pelo admin no momento.'
  const curWeek = countUserRivenAlerts(userJid)
  const limWeek = getRivenAlertLimit(userJid, admWeek)
  const roomWeek = admWeek ? 999 : (limWeek === Infinity ? 999 : Math.max(0, limWeek - curWeek))
  if (!admWeek && roomWeek <= 0) {
    return '❌ Limite de snipes de riven: *' + limWeek + '*. Apague alguns com `!delalertariven` / `!snipeweek clear`.'
  }

  let limit = 10, sortBy = 'price', mult = 10, maxPctOfMax = 60, noMax = false, rolled = null
  let priceMode = 'fixed', fixedMax = 900

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (/^\d+$/.test(a)) limit = Math.min(30, Math.max(1, parseInt(a, 10)))
    else if (a === 'pop' || a === 'popular') sortBy = 'pop'
    else if (a === 'price' || a === 'preco' || a === 'preço') sortBy = 'price'
    else if (a === 'rolled') rolled = true
    else if (a === 'unrolled') rolled = false
    else if (a === 'nomax' || a === 'semmax' || a === 'nolimit') { noMax = true; priceMode = 'nomax' }
    else if (a === 'auto') priceMode = 'auto'
    else if (a === 'max') {
      const n = parseInt(args[i + 1], 10)
      if (!isNaN(n) && n >= 50 && n <= 50000) { fixedMax = n; priceMode = 'fixed'; i++ }
    } else if (a === 'mult' || a === 'x' || a === 'vezes') {
      const n = parseFloat(args[i + 1])
      if (!isNaN(n) && n >= 1 && n <= 50) { mult = n; priceMode = 'mult'; i++ }
    } else if (a === 'maxpct' || a === 'pct') {
      const n = parseInt(args[i + 1], 10)
      if (!isNaN(n) && n > 5 && n <= 100) { maxPctOfMax = n; priceMode = 'maxpct'; i++ }
    }
  }

  if (limit > roomWeek) limit = roomWeek

  let tops
  try {
    tops = await getTopWeeklyWeapons(limit, sortBy, rolled)
  } catch (e) {
    console.error('snipeweek:', e.message)
    return '❌ Não foi possível carregar os rivens semanais da DE.'
  }
  if (!tops.length) return '❌ Nenhuma arma no ranking semanal.'

  const store = loadRivenAlerts()
  store.alerts = store.alerts.filter((a) => !(a.userJid === userJid && a.source === 'week'))

  const created = []
  let skippedNoMeta = 0
  for (const t of tops) {
    const meta = getWeaponMeta(t.weaponKey)
    const stats = meta && meta.must_have && meta.must_have.length ? meta.must_have.slice() : []
    if (!stats.length) { skippedNoMeta++; continue }

    const minPos = stats.length <= 1 ? 3 : 2

    let maxPrice = null
    if (!noMax && priceMode !== 'nomax') {
      const med = t.median != null && t.median > 0 ? Number(t.median) : null
      const mx = t.max != null && t.max > 0 ? Number(t.max) : null
      if (priceMode === 'fixed') maxPrice = fixedMax
      else if (priceMode === 'mult' && med) maxPrice = Math.round(med * mult)
      else if (priceMode === 'maxpct' && mx) maxPrice = Math.round(mx * (maxPctOfMax / 100))
      else {
        const fromMed = med ? Math.round(med * mult) : 0
        const fromMax = mx ? Math.round(mx * (maxPctOfMax / 100)) : 0
        maxPrice = Math.max(fromMed, fromMax) || null
      }
      if (maxPrice != null && maxPrice < 50) maxPrice = 50
    }

    const id = store.nextId++
    store.alerts.push({
      id, userJid, weapon: t.weaponKey, stats, maxPrice, useMeta: !!stats.length,
      minGrade: null, minPositives: minPos, maxPositives: 3, source: 'week',
      weekDisplay: t.display, weekMedian: t.median, weekMax: t.max, preferCheapest: true,
      createdAt: new Date().toISOString(), notified: []
    })
    created.push({ id, display: t.display, maxPrice, median: t.median, max: t.max, hasMeta: !!stats.length, minPos })
  }
  saveRivenAlerts(store)

  let reply = '🎯 *SNIPE WEEK ATIVADO*\n'
  reply += '_Top ' + created.length + ' da semana (DE) — por ' + (sortBy === 'pop' ? 'popularidade' : 'preço max') + '_\n'
  if (noMax || priceMode === 'nomax') {
    reply += 'Max preço: *sem limite* (só filtro META)\n\n'
  } else if (priceMode === 'fixed') {
    reply += 'Max preço: *≤' + fixedMax + 'p* (modo flip / god roll barato)\n\n'
  } else if (priceMode === 'mult') {
    reply += 'Max preço: *' + mult + '×* a mediana DE\n\n'
  } else if (priceMode === 'maxpct') {
    reply += 'Max preço: *' + maxPctOfMax + '%* do max semanal DE\n\n'
  } else {
    reply += 'Max preço: auto = maior entre *' + mult + '× mediana* e *' + maxPctOfMax + '% do max*\n'
    reply += '_Mediana DE = todos os rivens (inclui lixo); por isso usamos multiplicador_\n\n'
  }

  for (const c of created) {
    reply += '#' + c.id + ' *' + c.display + '*'
    reply += c.maxPrice != null ? ' ≤' + c.maxPrice + 'p' : ' ≤∞'
    if (c.median != null) reply += ' (med ' + Math.round(c.median) + 'p'
    if (c.max != null) reply += ' / max ' + Math.round(c.max) + 'p)'
    else if (c.median != null) reply += ')'
    if (c.hasMeta) reply += ' · META'
    if (c.minPos === 3) reply += ' · 3P+'
    reply += '\n'
  }

  if (skippedNoMeta) reply += '\n_(' + skippedNoMeta + ' arma(s) sem meta no riven_meta.json foram ignoradas)_\n'
  reply += '\n💡 Só anúncios *novos* com must-have do meta · prioriza *mais barato*.\n'
  reply += '📌 `!snipeweek 20 max 900` · `!snipeweek 15 auto` · `!snipeweek clear`\n'
  reply += '📋 `!alertasriven` | ❌ `!delalertariven <id|all>`'
  return reply.trim()
}

module.exports = {
  loadRivenAlerts, saveRivenAlerts, countUserRivenAlerts,
  parseRivenAlertArgs, createRivenAlert, listRivenAlerts, deleteRivenAlert,
  rivenMatchesAlert, formatRivenAuctionMessage, checkRivenAlerts,
  loadRivenSeen, saveRivenSeen, rivenAuctionFingerprint, rivenSeenKey,
  hasSeenRiven, markSeenRiven, markAuctionSeenForUser, wasAuctionSeen,
  extractAuctionId, fetchAuctionById, getRivenGradeMessage, createWeekSnipers
}
