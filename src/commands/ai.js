// src/commands/ai.js — !g e !limpar
const { register } = require('./router')
const { askAI, clearHistory } = require('../services/ai/groqClient')
const { retrieveWarframeFacts } = require('../services/ai/rag')

// Mantém o comportamento original: histórico da IA é por CHAT (from), não por
// remetente — assim um grupo compartilha o mesmo contexto de conversa.
register(/^!g\s+(.+)/i, async ({ sock, from, match }) => {
  const resposta = await askAI(from, match[1].trim(), { retrieveFacts: retrieveWarframeFacts })
  await sock.sendMessage(from, { text: String(resposta || '❌ Sem resposta.') })
})

register(/^!limpar$/i, async ({ sock, from }) => {
  clearHistory(from)
  await sock.sendMessage(from, { text: '🧹 Histórico de conversa limpo.' })
})
