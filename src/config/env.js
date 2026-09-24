// src/config/env.js
// Ponto único de configuração. NUNCA hardcode chave aqui — sempre process.env.
const path = require('path')

function required(name, fallback) {
  const v = process.env[name]
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback
    console.warn(`[config] ⚠️  Variável de ambiente ausente: ${name}`)
    return ''
  }
  return v
}

const DATA_ROOT = process.env.DATA_ROOT || path.join(__dirname, '..', '..', 'data_runtime')

module.exports = {
  // ---- Segredos (SEMPRE via env, nunca commitados) ----
  GROQ_API_KEY: required('GROQ_API_KEY'),
  WFM_JWT: process.env.WFM_JWT || '',
  BOT_PHONE: process.env.BOT_PHONE || '5511978458775',

  // ---- Admins ----
  // Pode manter uma lista default aqui, mas idealmente vem de env separado por vírgula:
  // ADMIN_NUMBERS=5511988450236,155349520781506
  ADMIN_NUMBERS: (process.env.ADMIN_NUMBERS
    ? process.env.ADMIN_NUMBERS.split(',').map(s => s.trim()).filter(Boolean)
    : ['5511988450236', '155349520781506']),

  // ---- Paths ----
  DATA_ROOT,
  DATA_DIR: path.join(DATA_ROOT, 'data'),
  BASE_VALUES_FILE: path.join(__dirname, '..', '..', 'data', 'base_values.json'),
  DISPOSITIONS_FILE: path.join(__dirname, '..', '..', 'data', 'dispositions.json'),
  RIVEN_META_FILE: path.join(__dirname, '..', '..', 'data', 'riven_meta.json'),

  ALERTS_FILE: path.join(DATA_ROOT, 'alerts.json'),
  INVASION_ALERTS_FILE: path.join(DATA_ROOT, 'invasion_alerts.json'),
  RIVEN_ALERTS_FILE: path.join(DATA_ROOT, 'riven_alerts.json'),
  WEEKLY_RIVENS_FILE: path.join(DATA_ROOT, 'weekly_rivens_pc.json'),
  STEAL_SEEN_FILE: path.join(DATA_ROOT, 'riven_steal_seen.json'),
  RIVEN_SEEN_FILE: path.join(DATA_ROOT, 'riven_seen.json'),
  ADMIN_CONFIG_FILE: path.join(DATA_ROOT, 'admin_config.json'),
  HIGHEST_CACHE_FILE: path.join(DATA_ROOT, 'highest_cache.json'),
  ARBYS_FILE: path.join(DATA_ROOT, 'data', 'arbys.txt'),
  REGIONS_FILE: path.join(DATA_ROOT, 'data', 'regions.json'),
  SP_INCURSIONS_FILE: path.join(DATA_ROOT, 'data', 'sp-incursions.txt'),
  AUTH_DIR: path.join(DATA_ROOT, 'auth_info'),

  // ---- Groq / IA ----
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  // ⚠️ confirme na doc da Groq (console.groq.com/docs/models) se este id ainda existe.
  // Sugestões atuais fortes para PT-BR + raciocínio: 'llama-3.3-70b-versatile'
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  WA_MAX_CHARS: 3500,

  // ---- Timers ----
  CHECK_INTERVAL_MS: 4 * 60 * 1000,
  WFM_POLL_INTERVAL_MS: 30 * 1000,

  // ---- URLs externas ----
  INVASIONS_URL: 'https://api.warframestat.us/pc/invasions',
  WORLDSTATE_URL: 'https://api.warframe.com/cdn/worldState.php',
  RIVEN_AUCTIONS_URL: 'https://api.warframe.market/v1/auctions/search',
  WEEKLY_RIVENS_URL: 'https://www-static.warframe.com/repos/weeklyRivensPC.json',
  WEEKLY_RIVENS_TTL: 7 * 24 * 60 * 60 * 1000,

  STEAL_MIN_DISCOUNT: 0.55,
  STEAL_MIN_MEDIAN: 800,

  HIGHEST_CATALOG_TTL: 6 * 60 * 60 * 1000,
  HIGHEST_PRICE_TTL: 30 * 60 * 1000,
  HIGHEST_STATS_TTL: 60 * 60 * 1000,
  HIGHEST_REQUEST_DELAY: 350,
  HIGHEST_BATCH_SIZE: 20
}

// Garante que os diretórios de runtime existem assim que o config é carregado.
const fs = require('fs')
try {
  if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true })
  const dataDir = path.join(DATA_ROOT, 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
} catch (e) {
  console.error('[config] falha ao criar diretórios de runtime:', e.message)
}
