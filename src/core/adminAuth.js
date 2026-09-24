// src/core/adminAuth.js
const { ADMIN_NUMBERS } = require('../config/env')
const { jidToNumber } = require('../utils/text')
const { loadAdminConfig } = require('./adminConfig')

function getSenderJid(msg) {
  if (msg.key && msg.key.participant) return msg.key.participant
  if (msg.participant) return msg.participant
  if (msg.key && msg.key.participantAlt) return msg.key.participantAlt
  if (msg.key && msg.key.remoteJid) return msg.key.remoteJid
  return null
}

/** Aceita um JID/número (string) OU o objeto `msg` do Baileys. */
function isAdmin(jidOrMsg) {
  let jid = jidOrMsg
  if (jidOrMsg && typeof jidOrMsg === 'object' && jidOrMsg.key) {
    jid = getSenderJid(jidOrMsg)
  }
  const raw = String(jid || '')
  const num = jidToNumber(raw)
  if (!num && !raw) return false
  return ADMIN_NUMBERS.some((a) => {
    const aNum = String(a).replace(/\D/g, '')
    if (!aNum) return false
    if (num && (num === aNum || num.endsWith(aNum) || aNum.endsWith(num))) return true
    if (raw.indexOf(aNum) !== -1) return true
    if (raw === a || raw === aNum + '@lid' || raw === aNum + '@s.whatsapp.net') return true
    return false
  })
}

function identityKeys(jid) {
  const raw = String(jid || '')
  const num = jidToNumber(raw)
  const keys = [raw]
  if (num) keys.push(num)
  return keys
}

function configHasUser(list, jid) {
  const keys = identityKeys(jid)
  return (list || []).some((entry) => {
    const e = String(entry)
    const eNum = jidToNumber(e)
    return keys.some((k) => k === e || k === eNum || (eNum && (String(k).endsWith(eNum) || eNum.endsWith(String(k)))))
  })
}

function isUserMuted(jid) {
  return configHasUser(loadAdminConfig().mutedUsers, jid)
}

function isVip(jid) {
  return configHasUser(loadAdminConfig().vipUsers, jid)
}

function normalizeTargetJid(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  if (s.indexOf('@') !== -1) return s
  const num = s.replace(/\D/g, '')
  if (num.length < 10) return null
  if (num.length >= 14) return num + '@lid'
  return num + '@s.whatsapp.net'
}

function addToConfigList(listName, jidOrNum) {
  const { loadAdminConfig, saveAdminConfig } = require('./adminConfig')
  const cfg = loadAdminConfig()
  const entry = String(jidOrNum).trim()
  if (!entry) return { ok: false, msg: 'Alvo vazio' }
  if (!cfg[listName]) cfg[listName] = []
  if (configHasUser(cfg[listName], entry)) return { ok: false, msg: 'Já estava na lista.' }
  cfg[listName].push(entry)
  saveAdminConfig(cfg)
  return { ok: true, msg: 'Adicionado: `' + entry + '`' }
}

function removeFromConfigList(listName, jidOrNum) {
  const { loadAdminConfig, saveAdminConfig } = require('./adminConfig')
  const cfg = loadAdminConfig()
  const entry = String(jidOrNum).trim()
  const before = (cfg[listName] || []).length
  cfg[listName] = (cfg[listName] || []).filter((e) => !configHasUser([e], entry) && e !== entry)
  saveAdminConfig(cfg)
  const removed = before - cfg[listName].length
  return removed ? { ok: true, msg: 'Removido (' + removed + ').' } : { ok: false, msg: 'Não estava na lista.' }
}

function getRivenAlertLimit(userJid, isAdm) {
  if (isAdm === true || isAdmin(userJid)) return Infinity
  const cfg = loadAdminConfig()
  if (isVip(userJid)) return cfg.maxRivenAlertsVip || 30
  return cfg.maxRivenAlerts != null ? cfg.maxRivenAlerts : 10
}

function canUseRivenSnipe(userJid, isAdm) {
  if (isAdm) return true
  return loadAdminConfig().rivenSnipeEnabled !== false
}

module.exports = {
  getSenderJid, isAdmin, identityKeys, configHasUser, isUserMuted, isVip,
  normalizeTargetJid, addToConfigList, removeFromConfigList,
  getRivenAlertLimit, canUseRivenSnipe
}
