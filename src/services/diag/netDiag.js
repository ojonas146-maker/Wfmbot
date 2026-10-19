// src/services/diag/netDiag.js
// Diagnóstico de rede: testa cada endereço externo que o bot usa e mostra o resultado real
// (status, tempo, se veio JSON ou uma página de bloqueio). Serve para saber se o problema é
// a API do warframe.market, um bloqueio no servidor onde o bot roda, ou o código.
//
// Usado por:  !diag (admin, no WhatsApp)   e   node scripts/diagnostico.js

const axios = require('axios')

const BOT_HEADERS = {
  Platform: 'pc',
  Language: 'en',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
}

const DESKTOP_HEADERS = {
  Platform: 'pc',
  Language: 'en',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://warframe.market',
  Referer: 'https://warframe.market/',
  'Accept-Language': 'en-US,en;q=0.9'
}

const TESTS = [
  { group: 'WFM', name: 'item (v2)', url: 'https://api.warframe.market/v2/item/serration', headers: BOT_HEADERS },
  { group: 'WFM', name: 'item (v2, UA desktop)', url: 'https://api.warframe.market/v2/item/serration', headers: DESKTOP_HEADERS },
  { group: 'WFM', name: 'ordens top (v2)', url: 'https://api.warframe.market/v2/orders/item/serration/top', headers: BOT_HEADERS },
  { group: 'WFM', name: 'estatísticas (v1)', url: 'https://api.warframe.market/v1/items/serration/statistics', headers: DESKTOP_HEADERS },
  { group: 'WFM', name: 'catálogo de itens (v2)', url: 'https://api.warframe.market/v2/items', headers: BOT_HEADERS, big: true },
  { group: 'WFM', name: 'leilões riven (v1)', url: 'https://api.warframe.market/v1/auctions/search?type=riven&weapon_url_name=burston&sort_by=price_asc', headers: DESKTOP_HEADERS },
  { group: 'WFM', name: 'leilões lich (v1)', url: 'https://api.warframe.market/v1/auctions/search?type=lich&weapon_url_name=kuva_hek&sort_by=price_asc', headers: DESKTOP_HEADERS },
  { group: 'WFM', name: 'catálogo lich (v2, opcional)', url: 'https://api.warframe.market/v2/lich/weapons', headers: BOT_HEADERS },
  { group: 'Outros', name: 'warframestat invasões', url: 'https://api.warframestat.us/pc/invasions', headers: { Accept: 'application/json' } },
  { group: 'Outros', name: 'worldState oficial', url: 'https://content.warframe.com/dynamic/worldState.php', headers: { Accept: '*/*' }, big: true },
  { group: 'Outros', name: 'rivens da semana', url: 'https://www-static.warframe.com/repos/weeklyRivensPC.json', headers: { Accept: 'application/json' }, big: true },
  { group: 'Outros', name: 'Groq (modelos)', url: 'https://api.groq.com/openai/v1/models', headers: process.env.GROQ_API_KEY ? { Authorization: 'Bearer ' + process.env.GROQ_API_KEY } : null }
]

function classify(res) {
  const st = res.status
  const ct = String((res.headers && res.headers['content-type']) || '')
  const server = String((res.headers && res.headers.server) || '')
  const body = typeof res.data === 'string' ? res.data : ''
  const looksHtml = /text\/html/i.test(ct) || /^\s*<(!doctype|html)/i.test(body)
  const cf = /cloudflare/i.test(server) || (res.headers && res.headers['cf-ray'])
  const blocked = looksHtml && (/just a moment|attention required|cf-chl|access denied|captcha/i.test(body) || st === 403 || st === 503)

  if (st >= 200 && st < 300) {
    if (looksHtml) return { ok: false, label: 'veio HTML em vez de JSON' + (blocked ? ' (página de bloqueio)' : '') }
    return { ok: true, label: 'OK' }
  }
  if (st === 429) {
    const ra = res.headers && res.headers['retry-after']
    return { ok: false, label: 'LIMITE (429)' + (ra ? ', espere ' + ra + 's' : '') }
  }
  if (st === 403 || blocked) return { ok: false, label: 'BLOQUEADO (' + st + ')' + (cf ? ' pelo Cloudflare' : '') }
  if (st === 404) return { ok: false, label: 'não existe (404)' }
  if (st === 401) return { ok: false, label: 'sem autorização (401)' }
  if (st >= 500) return { ok: false, label: 'erro do servidor (' + st + ')' }
  return { ok: false, label: 'status ' + st }
}

async function runOne(t) {
  if (!t.headers) return { name: t.name, group: t.group, ok: null, label: 'pulado (sem chave)', ms: 0 }
  const t0 = Date.now()
  try {
    const res = await axios.get(t.url, {
      headers: t.headers,
      timeout: 15000,
      validateStatus: () => true,
      responseType: t.big ? 'text' : 'json',
      maxContentLength: 60 * 1024 * 1024,
      transformResponse: t.big ? [(d) => d] : undefined
    })
    const c = classify(res)
    let extra = ''
    if (c.ok && !t.big && res.data && typeof res.data === 'object') {
      const d = res.data
      const arr = (d.data && Array.isArray(d.data) && d.data) || (d.payload && (d.payload.auctions || d.payload.orders)) || null
      if (Array.isArray(arr)) extra = arr.length + ' itens'
      else if (d.data && d.data.sell) extra = d.data.sell.length + ' vendas'
      else if (Array.isArray(d)) extra = d.length + ' itens'
    }
    if (!c.ok && typeof res.data === 'string') extra = res.data.replace(/\s+/g, ' ').slice(0, 70)
    if (!c.ok && res.data && typeof res.data === 'object') extra = JSON.stringify(res.data).slice(0, 70)
    return { name: t.name, group: t.group, ok: c.ok, label: c.label, status: res.status, ms: Date.now() - t0, extra }
  } catch (e) {
    const code = e.code || e.message
    let label = 'sem resposta: ' + code
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') label = 'TIMEOUT (não respondeu em 15s)'
    if (code === 'ENOTFOUND') label = 'DNS falhou (sem internet?)'
    if (code === 'ECONNRESET') label = 'conexão derrubada (ECONNRESET)'
    return { name: t.name, group: t.group, ok: false, label, ms: Date.now() - t0, extra: '' }
  }
}

async function whoAmI() {
  try {
    const r = await axios.get('https://api.ipify.org?format=json', { timeout: 8000 })
    return r.data && r.data.ip ? r.data.ip : '?'
  } catch (e) {
    return 'desconhecido'
  }
}

/** Roda todos os testes (um por vez, para não gerar rajada) e devolve { env, results }. */
async function runNetDiagnostics() {
  const results = []
  for (const t of TESTS) {
    results.push(await runOne(t))
    await new Promise((r) => setTimeout(r, 400))
  }
  return {
    env: {
      node: process.version,
      platform: process.platform,
      railway: !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
      ip: await whoAmI(),
      at: new Date().toISOString()
    },
    results
  }
}

function formatReport(rep) {
  const e = rep.env
  let t = '🩺 *Diagnóstico de rede*\n'
  t += '_' + (e.railway ? 'Railway' : 'local/Termux') + ' · node ' + e.node + ' · IP ' + e.ip + '_\n'
  let group = ''
  for (const r of rep.results) {
    if (r.group !== group) { group = r.group; t += '\n*' + group + '*\n' }
    const icon = r.ok === true ? '✅' : r.ok === false ? '❌' : '⏭️'
    t += icon + ' ' + r.name + ' — ' + r.label + (r.ms ? ' (' + r.ms + 'ms)' : '') + (r.extra && r.ok ? ' · ' + r.extra : '') + '\n'
    if (!r.ok && r.extra) t += '    ↳ ' + r.extra + '\n'
  }
  const wfm = rep.results.filter((r) => r.group === 'WFM' && !/opcional/.test(r.name))
  const wfmOk = wfm.filter((r) => r.ok).length
  t += '\n*Leitura rápida:* '
  if (wfmOk === wfm.length) t += 'o warframe.market respondeu a tudo; se algo falha no bot, o problema é no código/dados.'
  else if (wfmOk === 0) t += 'nenhum endpoint do warframe.market respondeu: ' + (wfm.some((r) => /BLOQUEADO|HTML/.test(r.label)) ? 'este servidor está sendo *bloqueado* (comum em IP de hospedagem).' : wfm.some((r) => /LIMITE/.test(r.label)) ? 'limite de requisições.' : 'API fora do ar ou sem conexão.')
  else t += 'só alguns endpoints do warframe.market respondem (' + wfmOk + '/' + wfm.length + '): veja quais ❌ acima.'
  return t.trim()
}

module.exports = { runNetDiagnostics, formatReport }
