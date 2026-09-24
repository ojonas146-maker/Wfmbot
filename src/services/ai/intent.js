// src/services/ai/intent.js
// Classificação leve (regex) para decidir o que buscar e como formatar o
// system prompt. Isso deixa o !g "mais esperto" porque o prompt fica focado
// no que a pergunta realmente precisa, em vez de sempre mandar as mesmas
// regras genéricas de uma vez só.

const RULES = [
  { tag: 'riven', re: /\briven|dispo(sition)?|god ?roll|reroll|kuva\b.*mod|grol\b/i },
  { tag: 'price', re: /preç|prec|plat\b|platinum|quanto (custa|vale)|barato|caro|vale a pena/i },
  { tag: 'stats_arma', re: /\bstats?\b|status\b(?!.*chance)|dano|damage|crit|cr[ií]tico|cad[eê]ncia|fire rate|carregador|magazine|recarga|reload|multishot/i },
  { tag: 'worldstate', re: /fissur|invas|sortie|archon|nightwave|cetus|vallis|deimos|baro|ressurg|varzia|incurs|arby|arbitr|zariman|hex|1999|calendario/i },
  { tag: 'acquisition', re: /\b(conseguir|obter|pegar|drop|chance|taxa|custo|montar|comprar|farmar|farm|onde|como)\b/i },
  { tag: 'trade_basico', re: /\b(trocar|troca|platina|kuva|endo|vault|arcane)\b/i }
]

function classifyIntent(message) {
  const q = String(message || '')
  const tags = []
  for (const r of RULES) {
    if (r.re.test(q)) tags.push(r.tag)
  }
  if (!tags.length) tags.push('geral')
  return tags
}

module.exports = { classifyIntent }
