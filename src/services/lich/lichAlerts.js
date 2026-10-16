// src/services/lich/lichAlerts.js
// Snipers de Kuva Lich / Sisters of Parvos: comandos, armazenamento, checagem periódica
// e envio do cartão (imagem) + "/w vendedor hi" em mensagem separada.

const fs = require('fs')
const path = require('path')

const env = require('../../config/env')
const { isAdmin, getRivenAlertLimit, canUseRivenSnipe, configHasUser } = require('../../core/adminAuth')
const { sleep } = require('../../utils/time')
const data = require('./lichData')
const { searchLichAuctions } = require('./lichSearch')
const { renderLichPng } = require('./lichCard')

const ALERTS_FILE = path.join(env.DATA_ROOT, 'lich_alerts.json')
const MAX_PINGS_PER_USER_PER_CYCLE = 3
const MAX_NOTIFIED = 400

// ---------------------------------------------------------------- armazenamento

function loadStore() {
  try {
    if (!fs.existsSync(ALERTS_FILE)) return { nextId: 1, alerts: [] }
    const d = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'))
    if (!d.alerts) d.alerts = []
    if (!d.nextId) d.nextId = 1
    return d
  } catch (e) {
    return { nextId: 1, alerts: [] }
  }
}

function saveStore(store) {
  try {
    fs.mkdirSync(path.dirname(ALERTS_FILE), { recursive: true })
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(store, null, 2))
  } catch (e) {
    console.error('lich alerts (salvar):', e.message)
  }
}

function sameUser(a, jid) {
  return a.userJid === jid || configHasUser([a.userJid], jid)
}

function userAlerts(store, userJid) {
  return store.alerts.filter((a) => sameUser(a, userJid))
}

async function ensureCatalogs() {
  await Promise.all([data.loadCatalog('lich'), data.loadCatalog('sister')])
}

// ---------------------------------------------------------------- interpretação do comando

const ELEMENT_ALIASES = {
  impact: 'impact', imp: 'impact', impacto: 'impact',
  heat: 'heat', fire: 'heat', calor: 'heat', fogo: 'heat',
  cold: 'cold', ice: 'cold', frio: 'cold', gelo: 'cold',
  electricity: 'electricity', electric: 'electricity', elec: 'electricity', ele: 'electricity', eletrico: 'electricity', eletricidade: 'electricity',
  toxin: 'toxin', tox: 'toxin', toxico: 'toxin',
  magnetic: 'magnetic', mag: 'magnetic', magnetico: 'magnetic',
  radiation: 'radiation', rad: 'radiation', radiacao: 'radiation'
}

const WITH_EPHEMERA = new Set(['efemera', 'ephemera', 'eph', 'efe', 'comefemera', 'com-efemera'])
const NO_EPHEMERA = new Set(['semefemera', 'sem-efemera', 'semeph', 'noeph', 'semefe'])
const KIND_WORDS = { lich: 'lich', liches: 'lich', sister: 'sister', sisters: 'sister', parvos: 'sister' }

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * @returns {{error:string}|{kind, weapon, weaponName, element, ephemera, ephemeraName, damageMin, maxPrice, quirk}}
 */
function parseLichArgs(raw) {
  const tokens = stripAccents(raw).toLowerCase().split(/\s+/).filter(Boolean)
  const f = { kind: null, weapon: null, weaponName: null, element: null, ephemera: null, ephemeraName: null, damageMin: null, maxPrice: null, quirk: null }
  const free = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const next = tokens[i + 1]
    let m

    if (t === 'max' && next && /^\d+$/.test(next)) { f.maxPrice = Number(next); i++; continue }
    if ((m = t.match(/^max=?(\d+)p?$/))) { f.maxPrice = Number(m[1]); continue }
    if ((m = t.match(/^(\d+)p$/))) { f.maxPrice = Number(m[1]); continue }
    if (['dano', 'dmg', 'damage', 'dm'].includes(t) && next && /^\d+%?$/.test(next)) { f.damageMin = Number(next.replace('%', '')); i++; continue }
    if ((m = t.match(/^(\d+)%$/))) { f.damageMin = Number(m[1]); continue }
    if ((t === 'quirk' || t === 'q') && next) { f.quirk = next; i++; continue }
    if ((m = t.match(/^quirk=(.+)$/))) { f.quirk = m[1]; continue }

    if (KIND_WORDS[t]) { f.kind = KIND_WORDS[t]; continue }
    if (WITH_EPHEMERA.has(t)) { f.ephemera = true; continue }
    if (NO_EPHEMERA.has(t)) { f.ephemera = false; continue }
    if (t === 'sem' && next && WITH_EPHEMERA.has(next)) { f.ephemera = false; i++; continue }
    if (ELEMENT_ALIASES[t]) { f.element = ELEMENT_ALIASES[t]; continue }

    // número solto = preço máximo (igual ao !alertariven)
    if (/^\d+$/.test(t)) { f.maxPrice = Number(t); continue }

    // nome de efêmera (gloriana, solena, charge, flame...)
    const eph = data.findEphemeraByName(t)
    if (eph) {
      if (!eph.ephemera.element) return { error: 'Ainda não sei o elemento da efêmera *' + eph.ephemera.name + '*. Use o elemento: `!alertalich sister cold efemera`.' }
      f.kind = f.kind || eph.kind
      f.element = eph.ephemera.element
      f.ephemera = true
      f.ephemeraName = eph.ephemera.name
      continue
    }
    free.push(t)
  }

  // arma
  if (free.length) {
    const joined = free.join(' ')
    // "kuva" / "tenet" sozinhos = tipo (qualquer arma), não nome de arma
    const r = joined === 'kuva' || joined === 'tenet' ? null : data.resolveWeapon(joined)
    if (r && r.candidates) {
      const names = r.candidates.slice(0, 8).map((c) => c.weapon.name).join(', ')
      return { error: 'Arma ambígua: "' + joined + '". Qual dessas? ' + names }
    }
    if (r && r.weapon) {
      if (f.kind && f.kind !== r.kind) return { error: 'A arma *' + r.weapon.name + '* é de ' + (r.kind === 'lich' ? 'Kuva Lich' : 'Sister of Parvos') + ', mas você pediu ' + f.kind + '.' }
      f.kind = r.kind
      f.weapon = r.weapon.url_name
      f.weaponName = r.weapon.name
    } else if (joined === 'kuva') {
      f.kind = f.kind || 'lich'
    } else if (joined === 'tenet') {
      f.kind = f.kind || 'sister'
    } else {
      return { error: 'Não achei a arma "' + joined + '". Veja a lista com `!lichajuda`.' }
    }
  }

  if (!f.kind) return { error: 'Diga se é *lich* ou *sister* (ou use o nome da arma). Ex: `!alertalich lich toxin efemera max 300`' }

  // quirk: resolve pelo catálogo quando der
  if (f.quirk) {
    const key = data.normKey(f.quirk)
    const qs = data.getCatalogSync(f.kind).quirks
    const hits = qs.filter((q) => data.normKey(q.url_name).includes(key) || data.normKey(q.name).includes(key))
    if (hits.length === 1) f.quirk = hits[0].url_name
  }

  if (!f.weapon && !f.element && f.ephemera == null && f.damageMin == null && !f.quirk) {
    return { error: 'Informe pelo menos um filtro: arma, elemento, efêmera, dano ou quirk.' }
  }
  return f
}

// ---------------------------------------------------------------- textos

const USAGE =
  '❌ *Como usar (Lich/Sister Sniper):*\n' +
  '`!alertalich <arma> [elemento] [efemera|semefemera] [dano 55] [quirk x] [max 500]`\n\n' +
  'Exemplos:\n' +
  '• `!alertalich kuva hek toxin efemera max 400`\n' +
  '• `!alertalich lich cold efemera max 300` _(qualquer arma)_\n' +
  '• `!alertalich tenet plinx dano 55 max 500`\n' +
  '• `!alertalich solena max 600` _(pela efêmera)_\n\n' +
  '📖 Armas, elementos e efêmeras: `!lichajuda`\n' +
  '🔎 Ver agora, sem alerta: `!lich <mesmos filtros>`'

function describeFilters(f) {
  const kindLabel = data.KINDS[f.kind].label
  let t = ''
  t += '🔫 Arma: ' + (f.weaponName || 'qualquer ' + kindLabel) + '\n'
  if (f.element) t += '🌀 Elemento: ' + (data.ELEMENTS[f.element] ? data.ELEMENTS[f.element].name : f.element) + '\n'
  if (f.ephemera === true) {
    const eph = f.ephemeraName || (f.element && (data.findEphemera(f.kind, f.element) || {}).name)
    t += '✨ Efêmera: ' + (eph || 'sim') + '\n'
  }
  if (f.ephemera === false) t += '✨ Efêmera: sem\n'
  if (f.damageMin != null) t += '💪 Dano mínimo: +' + f.damageMin + '%\n'
  if (f.quirk) t += '🧩 Quirk: ' + data.quirkDisplayName(f.kind, f.quirk) + '\n'
  if (f.maxPrice != null) t += '💰 Máx: ' + f.maxPrice + 'p\n'
  return t
}

function buildCaption(n, alertId) {
  const kindLabel = data.KINDS[n.kind] ? data.KINDS[n.kind].label : n.kind
  const el = data.ELEMENTS[n.element] ? data.ELEMENTS[n.element].name : n.element
  const eph = n.ephemera ? (data.findEphemera(n.kind, n.element) || {}).name : null
  let c = (alertId != null ? '🚨 *ALERTA ' + kindLabel.toUpperCase() + '*  #' + alertId + '\n\n' : '')
  c += '🔫 *' + data.weaponDisplayName(n.kind, n.weapon_url_name) + '* · ' + el + ' · +' + n.damage + '%\n'
  c += '💰 *' + n.price + 'p* | ' + (n.isDirect ? 'Venda direta' : 'Leilão') + '\n'
  c += '👤 ' + n.seller + ' (' + (n.status || '?') + ')\n'
  if (eph) c += '✨ ' + eph + '\n'
  if (n.quirk) c += '🧩 ' + data.quirkDisplayName(n.kind, n.quirk) + '\n'
  c += '\n🔗 ' + n.url
  return c
}

async function sendCard(sock, jid, n, alertId) {
  let png = null
  try {
    png = renderLichPng(n)
  } catch (e) {
    console.error('lich card:', e.message)
  }
  const caption = buildCaption(n, alertId)
  if (png) {
    try {
      await sock.sendMessage(jid, { image: png, caption })
    } catch (e) {
      console.error('lich card (envio):', e.message)
      await sock.sendMessage(jid, { text: caption })
    }
  } else {
    await sock.sendMessage(jid, { text: caption })
  }
  // linha de sussurro pronta pra copiar no jogo
  await sock.sendMessage(jid, { text: '/w ' + n.seller + ' hi' })
}

// ---------------------------------------------------------------- comandos

async function createLichAlert(userJid, rawArgs, isAdmFlag) {
  await ensureCatalogs()
  const f = parseLichArgs(rawArgs)
  if (f.error) return '❌ ' + f.error + '\n\n' + USAGE

  const adm = isAdmFlag === true || isAdmin(userJid)
  if (!canUseRivenSnipe(userJid, adm)) return '❌ Os snipes estão *desativados* pelo admin no momento.'

  const store = loadStore()
  const cur = userAlerts(store, userJid).length
  const lim = getRivenAlertLimit(userJid, adm)
  if (!adm && cur >= lim) {
    return '❌ Limite de snipes de lich/sister: *' + lim + '*. Você já tem ' + cur + '.\nUse `!delalertalich all` ou apague alguns.'
  }

  const id = store.nextId++
  store.alerts.push({
    id, userJid, kind: f.kind, weapon: f.weapon, weaponName: f.weaponName, element: f.element,
    ephemera: f.ephemera, ephemeraName: f.ephemeraName, damageMin: f.damageMin, maxPrice: f.maxPrice,
    quirk: f.quirk, createdAt: new Date().toISOString(), notified: []
  })
  saveStore(store)

  const mins = Math.max(1, Math.round((env.CHECK_INTERVAL_MS || 240000) / 60000))
  return (
    '🧬 *' + data.KINDS[f.kind].label.toUpperCase() + ' SNIPER ATIVADO*\n\n' +
    describeFilters(f) +
    '\nID: #' + id + '\n' +
    'Só anúncios novos (com compra direta) após este alerta.\n' +
    'Verificação a cada ~' + mins + ' min.'
  )
}

function listLichAlerts(userJid) {
  const mine = userAlerts(loadStore(), userJid)
  if (!mine.length) return '📋 Você não tem snipes de lich/sister.\nCrie com `!alertalich` (veja `!lichajuda`).'
  let t = '📋 *Seus snipes de lich/sister:*\n'
  for (const a of mine) {
    t += '\n#' + a.id + ' · ' + data.KINDS[a.kind].label + '\n' + describeFilters(a).split('\n').filter(Boolean).map((l) => '   ' + l).join('\n') + '\n'
  }
  t += '\n❌ `!delalertalich <id|all>`'
  return t
}

function deleteLichAlert(userJid, arg) {
  const store = loadStore()
  if (/^all$/i.test(arg)) {
    const before = store.alerts.length
    store.alerts = store.alerts.filter((a) => !sameUser(a, userJid))
    const n = before - store.alerts.length
    saveStore(store)
    return n ? '🗑️ ' + n + ' snipe(s) de lich/sister removido(s).' : '❌ Você não tinha snipes de lich/sister.'
  }
  const id = parseInt(arg, 10)
  if (!id) return '❌ Use `!delalertalich <id>` ou `!delalertalich all`.'
  const idx = store.alerts.findIndex((a) => a.id === id && sameUser(a, userJid))
  if (idx === -1) return '❌ Snipe de lich/sister #' + id + ' não encontrado (ou não é seu).'
  store.alerts.splice(idx, 1)
  saveStore(store)
  return '🗑️ Snipe de lich/sister #' + id + ' removido.'
}

/** !lich <filtros>: mostra agora os mais baratos (sem criar alerta). */
async function searchLichNow(sock, jid, rawArgs, quoted) {
  await ensureCatalogs()
  const f = parseLichArgs(rawArgs)
  if (f.error) {
    await sock.sendMessage(jid, { text: '❌ ' + f.error + '\n\nUse os mesmos filtros do `!alertalich`. Ajuda: `!lichajuda`' })
    return
  }
  const r = await searchLichAuctions({
    kind: f.kind, weapon: f.weapon || undefined, element: f.element || undefined,
    ephemera: f.ephemera == null ? undefined : f.ephemera, damageMin: f.damageMin, quirk: f.quirk,
    maxPrice: f.maxPrice != null ? f.maxPrice : undefined, sortBy: 'price_asc'
  })
  if (r.error) {
    await sock.sendMessage(jid, { text: '❌ Erro ao consultar o warframe.market (' + r.error + '). Tente de novo em instantes.' })
    return
  }
  const list = r.auctions.filter((n) => n.isDirect || n.buyoutPrice != null).slice(0, 3)
  if (!list.length) {
    await sock.sendMessage(jid, { text: '🔎 Nada encontrado para:\n' + describeFilters(f) })
    return
  }
  for (const n of list) await sendCard(sock, jid, n, null)
}

// ---------------------------------------------------------------- ajuda / dicionário

function lichHelpMessages() {
  const lich = data.getCatalogSync('lich')
  const sister = data.getCatalogSync('sister')
  const names = (c) => c.weapons.map((w) => w.name.replace(/^(Kuva|Tenet) /, '')).sort().join(', ')

  const m1 = USAGE.replace('❌ *Como usar (Lich/Sister Sniper):*', '🧬 *Lich / Sister Sniper — como usar*') +
    '\n\n*Filtros (qualquer ordem):*\n' +
    '• *arma* — `hek`, `kuva hek`, `tenet envoy`...\n' +
    '• *elemento* — ver abaixo\n' +
    '• `efemera` / `semefemera` — só com / só sem efêmera\n' +
    '• *nome da efêmera* — `solena`, `gloriana`, `charge`, `flame`... (já define o elemento)\n' +
    '• `dano 55` — dano bônus mínimo (vai de 25 a 60)\n' +
    '• `quirk <nome>` — ex: `quirk loner`\n' +
    '• `max 500` (ou só `500`) — preço máximo\n' +
    '• `lich` / `sister` — quando não usar o nome de uma arma\n\n' +
    '📋 `!alertaslich` · ❌ `!delalertalich <id|all>`'

  const els = Object.keys(data.ELEMENTS).map((k) => {
    const aliases = Object.keys(ELEMENT_ALIASES).filter((a) => ELEMENT_ALIASES[a] === k && a !== k && a.length <= 5).slice(0, 3)
    return '• *' + data.ELEMENTS[k].name + '* — ' + [k].concat(aliases).join(', ')
  }).join('\n')

  const ephs = (c) => c.ephemeras.map((e) => '• ' + e.name.replace(' Ephemera', '') + ' → ' + (e.element ? data.ELEMENTS[e.element].name : '?')).join('\n')

  const m2 =
    '📖 *Dicionário Lich / Sister*\n\n' +
    '*🌀 Elementos*\n' + els + '\n\n' +
    '*✨ Efêmeras Kuva (Vengeful)*\n' + ephs(lich) + '\n\n' +
    '*✨ Efêmeras Sisters*\n' + ephs(sister) + '\n\n' +
    '*🔫 Armas Kuva*\n' + names(lich) + '\n\n' +
    '*🔫 Armas Tenet*\n' + names(sister)

  return [m1, m2]
}

// ---------------------------------------------------------------- checagem periódica

function matchesAlert(n, a) {
  if (n.kind !== a.kind) return false
  if (a.weapon && n.weapon_url_name !== a.weapon) return false
  if (a.element && n.element !== a.element) return false
  if (a.ephemera === true && !n.ephemera) return false
  if (a.ephemera === false && n.ephemera) return false
  if (a.damageMin != null && (n.damage == null || n.damage < a.damageMin)) return false
  if (a.maxPrice != null && (n.price == null || n.price > a.maxPrice)) return false
  if (a.quirk) {
    const want = data.normKey(data.quirkDisplayName(a.kind, a.quirk))
    if (!n.quirk || data.normKey(data.quirkDisplayName(n.kind, n.quirk)) !== want) return false
  }
  // snipe = compra imediata: ignora leilão sem preço de compra direta
  if (!(n.isDirect || n.buyoutPrice != null)) return false
  return true
}

async function checkLichAlerts(sock) {
  const store = loadStore()
  if (!store.alerts.length) return
  await ensureCatalogs()

  // uma busca por combinação (tipo, arma, elemento, efêmera); filtros finos são locais
  const groups = new Map()
  for (const a of store.alerts) {
    const key = [a.kind, a.weapon || '*', a.element || '*', a.ephemera == null ? '*' : a.ephemera].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(a)
  }

  const pings = {}
  let changed = false

  for (const [key, alerts] of groups) {
    const a0 = alerts[0]
    const r = await searchLichAuctions({
      kind: a0.kind, weapon: a0.weapon || undefined, element: a0.element || undefined,
      ephemera: a0.ephemera == null ? undefined : a0.ephemera, sortBy: 'price_asc'
    })
    if (r.error) {
      console.error('lich check ' + key + ':', r.error)
      await sleep(1500)
      continue
    }

    for (const alert of alerts) {
      const alertMs = Date.parse(alert.createdAt)
      alert.notified = alert.notified || []
      for (const n of r.auctions) {
        if (!matchesAlert(n, alert)) continue
        if (alert.notified.includes(n.id)) continue

        const createdMs = n.created ? Date.parse(n.created) : NaN
        const isOld = !isNaN(createdMs) && !isNaN(alertMs) && createdMs < alertMs
        if (isOld) { alert.notified.push(n.id); changed = true; continue }

        const uKey = alert.userJid
        if ((pings[uKey] || 0) >= MAX_PINGS_PER_USER_PER_CYCLE) continue // fica pro próximo ciclo

        try {
          await sendCard(sock, alert.userJid, n, alert.id)
          pings[uKey] = (pings[uKey] || 0) + 1
          alert.notified.push(n.id)
          changed = true
          await sleep(1000)
        } catch (e) {
          console.error('lich alerta (envio):', e.message)
        }
      }
      if (alert.notified.length > MAX_NOTIFIED) alert.notified = alert.notified.slice(-MAX_NOTIFIED)
    }
    await sleep(1500)
  }

  if (changed) saveStore(store)
}

module.exports = {
  parseLichArgs,
  createLichAlert,
  listLichAlerts,
  deleteLichAlert,
  searchLichNow,
  lichHelpMessages,
  checkLichAlerts,
  matchesAlert
}
