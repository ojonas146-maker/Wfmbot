// src/commands/help.js — !ajuda
const { register } = require('./router')

function getHelp() {
  return '🤖 *Comandos do Bot*\n\n' +
    '📊 *!p <item>* — preço\n' +
    '🧩 *!set <nome>* — partes + set\n' +
    '📦 *!relic <tier> <nome>* — drops da relíquia\n' +
    '📍 *!drops <item>* — onde dropa\n' +
    '👤 *!perfil <nome>* — perfil WFM\n\n' +
    '🕳️ *!fissuras* | 🎯 *!fissfarm* — Defesa/Extermínio de interesse\n' +
    '🎯 *!sortie* | 👑 *!archon*\n' +
    '🧪 *!archimedea* | 📅 *!eventos* | 📡 *!nightwave*\n' +
    '🌿 *!cetus* | ❄️ *!vallis* | ☣️ *!deimos*\n\n' +
    '♻️ *!ressurgencia* | 🛸 *!baro*\n' +
    '📅 *!calendario* / *!1999*\n' +
    '⚔️ *!arby* — arbitragem + tiers\n' +
    '🗡️ *!incursao* — Steel Path\n' +
    '🔥 *!descendia* [2-5|all]\n\n' +
    '🌌 *!zariman* | 🧪 *!lab* | 🏙️ *!hex*\n' +
    '🗺️ *!bounty cetus|fortuna|deimos*\n\n' +
    '⚔️ *!invasoes*\n' +
    '🔫 *!riven <arma>* — preço oficial (rolled/unrolled)\n' +
    '🏆 *!highest* [cat] [página] — ranking de preços\n' +
    'Ex: !highest · !highest 2 · !highest 3 2\n\n' +
    '📐 *!grade <link|id>* — grade + análise meta do riven\n' +
    '🎯 *!meta <arma>* / *!grol <arma>* — god roll / must-have\n' +
    '🏆 *!rivendb* [N] [pop] [rolled|unrolled] — ranking semanal\n' +
    '📜 *!acrithis* / */acrithis* — loja weekly da Acrithis (Duviri)\n' +
    '🔔 *!alertainvasao <item>*\n' +
    '📋 *!alertasinvasao*\n' +
    '❌ *!delalertainvasao <id|all>*\n\n' +
    '🔔 *!alerta item <=40*\n' +
    '📋 *!alertas*\n' +
    '❌ *!delalerta <id|all>*\n\n' +
    '📜 *!i <item>*\n' +
    '🧠 *!g <pergunta>*\n' +
    '🧹 *!limpar*\n\n' +
    '🎯 *!alertariven <arma> [stats] [meta] [grade S|+A] [max N] [2p|3p]*\n' +
    '   Sniper: avisa só rolls bons / meta / baratos\n' +
    '   Ex: !alertariven torid meta max 2500\n' +
    '📅 *!snipeweek* [N] [pop|price] [max 900|auto] — top semana (flip)\n' +
    '   !snipeweek 20 max 900 · !snipeweek 15 auto · !snipeweek clear\n' +
    '📋 *!alertasriven* | ❌ *!delalertariven <id|all>*\n' +
    '💎 Detector de roubados (top semana + lista fixa)\n\n' +
    '❓ *!ajuda*'
}

register(/^!(ajuda|h|help)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: getHelp() })
})

module.exports = { getHelp }
