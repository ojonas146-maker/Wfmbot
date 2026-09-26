// src/commands/help.js — !ajuda
const { register } = require('./router')

function getHelp() {
  return (
    '🤖 *COMANDOS DO BOT*\n' +
    '_`<obrigatório>` · `[opcional]`_\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '💰 *PREÇOS & ITENS*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '📊 *!p <item>* — preço médio de venda\n' +
    '   Ex: `!p prime kavat`\n' +
    '🧩 *!set <nome>* — partes de um set + preço do conjunto\n' +
    '📦 *!relic <tier> <nome>* — drops de uma relíquia\n' +
    '   Ex: `!relic lith a1`\n' +
    '📍 *!drops <item>* — em qual missão/inimigo o item dropa\n' +
    '👤 *!perfil <nome>* — perfil de um jogador no warframe.market\n' +
    '🔫 *!riven <arma>* — preço oficial do riven (rolled/unrolled)\n' +
    '🏆 *!highest [cat] [pág]* — ranking dos itens mais caros do mercado\n' +
    '   Ex: `!highest` · `!highest 2` · `!highest 3 2`\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🌍 *MUNDO ABERTO & EVENTOS*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '🕳️ *!fissuras* — fissuras ativas · 🎯 *!fissfarm* — só Defesa/Extermínio\n' +
    '🎯 *!sortie* — sortie do dia · 👑 *!archon* — Archon Hunt\n' +
    '🧪 *!archimedea* — Archimedea da semana\n' +
    '📅 *!eventos* · 📡 *!nightwave*\n' +
    '🌿 *!cetus* · ❄️ *!vallis* · ☣️ *!deimos* — ciclo dia/noite de cada um\n' +
    '♻️ *!ressurgencia* — evento Ressurgência\n' +
    '🛸 *!baro* — chegada e itens do Baro Ki\'Teer\n' +
    '📅 *!calendario* / *!1999*\n' +
    '🗺️ *!bounty cetus|fortuna|deimos* — bounties ativas do local\n' +
    '🌌 *!zariman* · 🧪 *!lab* · 🏙️ *!hex*\n' +
    '🗡️ *!incursao* — missões Steel Path do dia\n' +
    '🔥 *!descendia [2-5|all]* — status das Descendências\n' +
    '⚔️ *!invasoes* — invasões ativas\n' +
    '📜 *!acrithis* — loja semanal da Acrithis (Duviri)\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '⚔️ *ARBITRAGEM*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '⚔️ *!arby* — arbitragem atual + tier da recompensa\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🔫 *RIVENS*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '📐 *!grade <link|id>* — analisa a grade do seu riven vs. a meta\n' +
    '🎯 *!meta <arma>* / *!grol <arma>* — god roll / rolls must-have da arma\n' +
    '🏆 *!rivendb [N] [pop] [rolled|unrolled]* — ranking semanal de rivens\n' +
    '🎯 *!alertariven <arma> [stats] [meta] [grade S|+A] [max N] [2p|3p]*\n' +
    '   Sniper: te avisa só quando aparecer um roll bom, meta ou barato\n' +
    '   Ex: `!alertariven torid meta max 2500`\n' +
    '📅 *!snipeweek [N] [pop|price] [max 900|auto]* — top da semana p/ flip\n' +
    '   Ex: `!snipeweek 20 max 900` · `!snipeweek 15 auto` · `!snipeweek clear`\n' +
    '📋 *!alertasriven* — lista seus alertas · ❌ *!delalertariven <id|all>*\n' +
    '💎 Detector automático de rivens roubados (compara com o top da semana)\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🔔 *ALERTAS*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '🔔 *!alerta <item> <=preço>* — avisa quando o item cair pra esse preço\n' +
    '   Ex: `!alerta prime kavat <=40`\n' +
    '📋 *!alertas* — lista seus alertas · ❌ *!delalerta <id|all>*\n' +
    '🔔 *!alertainvasao <item>* — avisa quando o item aparecer numa invasão\n' +
    '📋 *!alertasinvasao* · ❌ *!delalertainvasao <id|all>*\n\n' +

    '━━━━━━━━━━━━━━━━━\n' +
    '🧠 *IA & UTILIDADES*\n' +
    '━━━━━━━━━━━━━━━━━\n' +
    '📜 *!i <item>* — informações detalhadas do item\n' +
    '🧠 *!g <pergunta>* — pergunta qualquer coisa pra IA do bot\n' +
    '🧹 *!limpar* — apaga seu histórico de conversa com a IA\n\n' +

    '❓ Precisar desse menu de novo? Manda *!ajuda*'
  )
}

register(/^!(ajuda|h|help)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: getHelp() })
})

module.exports = { getHelp }
