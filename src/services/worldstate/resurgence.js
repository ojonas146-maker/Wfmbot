// src/services/worldstate/resurgence.js
const axios = require('axios')
const { toSlug } = require('../../utils/text')
const { formatTimeLeft } = require('../../utils/time')
const { getTopOrders, calcStatsFromOrders } = require('../wfm/client')

async function getResurgence() {
  try {
    const res = await axios.get('https://api.warframestat.us/pc/vaultTrader', { timeout: 15000 })
    const data = res.data
    if (!data) return '❌ Não foi possível obter a Ressurgência atual.'

    const start = data.activation ? new Date(data.activation).toLocaleString('pt-BR') : '?'
    const end = data.expiry ? new Date(data.expiry).toLocaleString('pt-BR') : '?'
    const left = data.expiry ? formatTimeLeft(new Date(data.expiry).getTime() - Date.now()) : ''
    const inv = data.inventory || []

    const NAME_FIX = {
      'all new1h s g': 'Euphona Prime',
      'prime ak bolto weapon': 'Akbolto Prime',
      'prime ak bolto': 'Akbolto Prime',
      'kogake prime knuckles': 'Kogake Prime',
      'prime helios power suit': 'Helios Prime',
      'prime helios': 'Helios Prime'
    }

    const warframes = [], weapons = [], sentinels = [], relics = [], cosmetics = []
    const seen = {}

    function titleCase(s) {
      return s.toLowerCase().split(' ').map((w) => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ')
    }
    function pushUnique(arr, name) {
      const k = name.toLowerCase()
      if (seen[k]) return
      seen[k] = true
      arr.push(name)
    }

    for (const it of inv) {
      const name = (it.item || '').trim()
      const un = it.uniqueName || ''
      if (!name && !un) continue

      if (/\/Packages\//i.test(un) || /MegaPrimeVault/i.test(un)) continue
      if (/BobbleHead|ShipDecos/i.test(un)) continue
      if (/pack|bobble head|accessories/i.test(name) && !/armor set|scarf|syandana|plate/i.test(name)) continue

      const lower = name.toLowerCase()
      const fixed = NAME_FIX[lower]
      let clean = fixed || name
      clean = clean.replace(/\s*\(.*?\)/g, '').replace(/Power Suit/i, '').replace(/Knuckles/i, '').replace(/\bWeapon\b/i, '').replace(/\s+/g, ' ').trim()
      clean = titleCase(clean)

      if (/VoidProjection|void projection/i.test(un + name)) {
        let tier = 'Relic'
        if (/T1/i.test(un + name)) tier = 'Lith'
        else if (/T2/i.test(un + name)) tier = 'Meso'
        else if (/T3/i.test(un + name)) tier = 'Neo'
        else if (/T4/i.test(un + name)) tier = 'Axi'
        const vault = /Vault\s*B/i.test(un + name) ? 'Vault B' : (/Vault\s*A/i.test(un + name) ? 'Vault A' : '')
        pushUnique(relics, tier + (vault ? ' (' + vault + ')' : ''))
        continue
      }

      if (/Scarves|Syandana|Armor|Skin|Plate|Mask|Wings|Tail|Shoulder/i.test(un) || /scarf|syandana|armor set|plate|mask|wings|tail/i.test(name)) {
        if (/PrimeScarfF/i.test(un)) clean = 'Capella Prime Syandana'
        else if (/PrimeScarfG/i.test(un)) clean = 'Abbera Prime Syandana'
        else if (/Atavist/i.test(un + name)) clean = 'Atavist Prime Armor Set'
        pushUnique(cosmetics, clean)
        continue
      }

      if (/Powersuits\//i.test(un) && !/Sentinel/i.test(un)) {
        if (!/prime/i.test(clean) && /prime/i.test(un)) clean = clean + ' Prime'
        pushUnique(warframes, clean)
        continue
      }
      if (/Sentinel/i.test(un)) {
        if (!/prime/i.test(clean) && /prime/i.test(un)) clean = clean + ' Prime'
        pushUnique(sentinels, clean)
        continue
      }
      if (/Weapons\//i.test(un)) {
        if (!/prime/i.test(clean) && /prime/i.test(un)) clean = clean + ' Prime'
        if (/prime/i.test(clean) && !/prime$/i.test(clean)) {
          clean = clean.replace(/\s*Prime\s*/i, ' ').trim() + ' Prime'
          clean = titleCase(clean)
        }
        pushUnique(weapons, clean)
        continue
      }

      if (/prime/i.test(clean + un)) {
        if (!/prime$/i.test(clean)) clean = titleCase(clean.replace(/prime/i, '').trim() + ' Prime')
        pushUnique(warframes, clean)
      }
    }

    let reply = '♻️ *Prime Resurgence (Varzia)*\n'
    reply += '📍 ' + (data.location || "Maroo's Bazaar") + '\n'
    reply += '🗓️ ' + start + ' → ' + end + '\n'
    if (left) reply += '⏳ ' + left + '\n'

    async function section(title, arr, withPrice) {
      if (!arr.length) return ''
      let t = '\n*' + title + ':*\n'
      for (const name of arr) {
        let priceText = ''
        if (withPrice) {
          priceText = ' —'
          try {
            let orders = await getTopOrders(toSlug(name) + '_set')
            let stats = calcStatsFromOrders(orders.sell)
            if (!stats) {
              orders = await getTopOrders(toSlug(name))
              stats = calcStatsFromOrders(orders.sell)
            }
            if (stats) priceText = ' → set min *' + stats.min + 'p*'
          } catch (e) {}
          await new Promise((r) => setTimeout(r, 200))
        }
        t += '• *' + name + '*' + priceText + '\n'
      }
      return t
    }

    reply += await section('Warframes', warframes, true)
    reply += await section('Weapons', weapons, true)
    reply += await section('Sentinels', sentinels, true)
    reply += await section('Relics', relics, false)
    reply += await section('Cosmetics', cosmetics, false)

    if (!warframes.length && !weapons.length && !sentinels.length) reply += '\n_Nenhum prime principal identificado._\n'

    reply += '\n💡 `!drops nome prime` | `!set nome prime` | `!relic lith x1` | `!i nome`'
    return reply.trim()
  } catch (err) {
    console.error(err.message)
    return '❌ Erro ao buscar Ressurgência.'
  }
}

module.exports = { getResurgence }
