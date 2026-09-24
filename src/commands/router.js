// src/commands/router.js
// Roteador simples: cada módulo de comando registra { match(text) => bool|match, handle(ctx) }.
// index.js só chama route(text, ctx) uma vez por mensagem.

const routes = []

/**
 * @param {RegExp} re
 * @param {(ctx: {sock, from, senderJid, isAdmin, match: RegExpMatchArray}) => Promise<void>} handler
 * @param {object} [opts] - { adminOnly: boolean }
 */
function register(re, handler, opts) {
  routes.push({ re, handler, adminOnly: !!(opts && opts.adminOnly) })
}

async function route(text, ctx) {
  for (const r of routes) {
    const m = text.match(r.re)
    if (!m) continue
    if (r.adminOnly && !ctx.isAdmin) {
      await ctx.sock.sendMessage(ctx.from, { text: '❌ Só admin.' })
      return true
    }
    // `text` sempre disponível no handler, além do resultado do regex (`match`),
    // pra comandos que precisam reprocessar os argumentos por conta própria (ex: !rivendb).
    await r.handler({ ...ctx, text, match: m })
    return true
  }
  return false
}

module.exports = { register, route }

/* ------------------------------------------------------------------ *
 * EXEMPLO DE USO (fica em src/commands/ai.js):
 *
 * const { register } = require('./router')
 * const { askAI, clearHistory } = require('../services/ai/groqClient')
 *
 * register(/^!g\s+(.+)/i, async ({ sock, from, senderJid, match }) => {
 *   const resposta = await askAI(senderJid || from, match[1].trim(), {
 *     retrieveFacts: require('../services/ai/rag').retrieveWarframeFacts
 *   })
 *   await sock.sendMessage(from, { text: String(resposta || '❌ Sem resposta.') })
 * })
 *
 * register(/^!limpar$/i, async ({ sock, from, senderJid }) => {
 *   clearHistory(senderJid || from)
 *   await sock.sendMessage(from, { text: '🧹 Histórico de conversa limpo.' })
 * })
 *
 * E em src/commands/riven.js, src/commands/price.js etc. — cada arquivo só
 * faz require('./router').register(...) pros comandos daquele domínio.
 * index.js então faz:
 *
 *   require('./commands/ai')
 *   require('./commands/riven')
 *   require('./commands/price')
 *   ...
 *   const { route } = require('./commands/router')
 *
 *   sock.ev.on('messages.upsert', async (m) => {
 *     ...
 *     const handled = await route(text, { sock, from, senderJid, isAdmin })
 *     if (!handled) { /* fallback / nada * / }
 *   })
 * ------------------------------------------------------------------ */
