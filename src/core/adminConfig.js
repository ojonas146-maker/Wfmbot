// src/core/adminConfig.js
const fs = require('fs')
const { ADMIN_CONFIG_FILE } = require('../config/env')

function defaultAdminConfig() {
  return {
    mutedUsers: [],
    vipUsers: [],
    rivenSnipeEnabled: true,
    maxRivenAlerts: 10,
    maxRivenAlertsVip: 30,
    blockedCommands: []
  }
}

function loadAdminConfig() {
  try {
    if (!fs.existsSync(ADMIN_CONFIG_FILE)) return defaultAdminConfig()
    const raw = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8'))
    const base = defaultAdminConfig()
    for (const k in base) {
      if (raw[k] === undefined) raw[k] = base[k]
    }
    if (!Array.isArray(raw.mutedUsers)) raw.mutedUsers = []
    if (!Array.isArray(raw.vipUsers)) raw.vipUsers = []
    if (!Array.isArray(raw.blockedCommands)) raw.blockedCommands = []
    return raw
  } catch (e) {
    console.error('admin_config:', e.message)
    return defaultAdminConfig()
  }
}

function saveAdminConfig(cfg) {
  try {
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(cfg, null, 2))
  } catch (e) {
    console.error('save admin_config:', e.message)
  }
}

module.exports = { defaultAdminConfig, loadAdminConfig, saveAdminConfig }
