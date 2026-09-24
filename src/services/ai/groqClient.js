// src/services/ai/groqClient.js
const axios = require('axios')
const env = require('../../config/env')
const { clipText } = require('../../utils/text')
const { getKnowledgeFor } = require('./knowledgeBase')
const { classifyIntent } = require('./intent')
const { buildSystemPrompt } = require('./systemPrompt')

const chatHistory = new Map() // userJid -> [{role, content}]
const answerCache = new Map() // `${userJid}::${question}` -> { at, reply }
const CACHE_TTL_MS = 60 * 1000 // evita gastar chamada em burst de "repete?" etc.
const HISTORY_CHAR_BUDGET = 4000 // ~1000 tokens de histórico, em vez de "últimas 6 msgs" fixo

function trimHistoryByBudget(history) {
  let total = 0
  const out = []
  for (let i = history.length - 1; i >= 0; i--) {
    const len = (history[i].content || '').length
    if (total + len > HISTORY_CHAR_BUDGET && out.length > 0) break
    out.unshift(history[i])
    total += len
  }
  return out
}

function cacheKey(userJid, message) {
  return userJid + '::' + String(message || '').trim().toLowerCase()
}

/**
 * askAI — ponto de entrada do comando !g.
 *
 * @param {string} userJid
 * @param {string} userMessage
 * @param {object} opts
 * @param {function} [opts.retrieveFacts] - async (userMessage, intentTags) => string|null
 *        Injeta o RAG (ex: preço no market, wiki, worldstate). Fica fora deste
 *        módulo de propósito, pra não acoplar IA a todo o resto do bot.
 */
async function askAI(userJid, userMessage, opts) {
  opts = opts || {}
  try {
    if (!env.GROQ_API_KEY) {
      return 'Chave da Groq nao configurada (defina GROQ_API_KEY no ambiente).'
    }

    const cKey = cacheKey(userJid, userMessage)
    const cached = answerCache.get(cKey)
    if (cached && (Date.now() - cached.at) < CACHE_TTL_MS) {
      return cached.reply
    }

    const intentTags = classifyIntent(userMessage)
    const knowledge = getKnowledgeFor(userMessage)

    let facts = null
    if (typeof opts.retrieveFacts === 'function') {
      try {
        facts = await opts.retrieveFacts(userMessage, intentTags)
      } catch (e) {
        console.error('askAI retrieveFacts:', e.message)
      }
    }

    let augmented = userMessage
    const parts = []
    if (knowledge) parts.push(knowledge)
    if (facts) parts.push('[DADOS ATUALIZADOS DO JOGO — use como fonte prioritaria]\n' + facts)
    if (parts.length) {
      augmented = parts.join('\n\n---\n\n') + '\n\n[PERGUNTA DO USUARIO]\n' + userMessage
    }

    let history = chatHistory.get(userJid) || []
    history.push({ role: 'user', content: augmented })
    history = trimHistoryByBudget(history)

    const systemPrompt = buildSystemPrompt(intentTags)

    const response = await axios.post(
      env.GROQ_API_URL,
      {
        model: env.GROQ_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        // perguntas factuais (preço/stats/worldstate) pedem menos criatividade
        temperature: intentTags.some(t => ['price', 'stats_arma', 'worldstate'].includes(t)) ? 0.1 : 0.3,
        max_tokens: 700
      },
      {
        headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
        timeout: 45000
      }
    )

    let aiReply =
      (response.data &&
        response.data.choices &&
        response.data.choices[0] &&
        response.data.choices[0].message &&
        response.data.choices[0].message.content &&
        response.data.choices[0].message.content.trim()) ||
      'Resposta vazia da IA.'

    aiReply = clipText(aiReply, env.WA_MAX_CHARS)

    // guarda a pergunta original (sem o augmented) no histórico, pra não
    // inflar contexto futuro com blocos de dados já respondidos
    history[history.length - 1] = { role: 'user', content: userMessage }
    history.push({ role: 'assistant', content: aiReply })
    chatHistory.set(userJid, history)

    answerCache.set(cKey, { at: Date.now(), reply: aiReply })
    return aiReply
  } catch (err) {
    console.error('Erro Groq/RAG:', err.response ? err.response.data : err.message)
    const status = err.response && err.response.status
    if (status === 401) return 'Chave da Groq invalida/expirada. Avise o admin.'
    if (status === 404) return 'Modelo da Groq configurado nao existe mais. Avise o admin (GROQ_MODEL).'
    if (status === 429) return 'Limite da Groq atingido. Tente de novo em instantes.'
    return 'Erro ao conversar com a IA. Tente novamente.'
  }
}

function clearHistory(userJid) {
  const had = chatHistory.has(userJid)
  chatHistory.delete(userJid)
  return had
}

function clearAllHistory() {
  const n = chatHistory.size
  chatHistory.clear()
  return n
}

module.exports = { askAI, clearHistory, clearAllHistory, chatHistory }
