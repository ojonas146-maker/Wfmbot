// src/services/ai/knowledgeBase.js
const { stripAccents } = require('../../utils/text')

const WF_KNOWLEDGE = {
  'farmar platina': [
    'Platina NAO dropa em missao. So se obtem comprando com dinheiro real OU trocando itens com outros jogadores.',
    'Metodo 1 (iniciante): abra reliquias em Void Fissures, junte partes Prime, venda SETS completos no warframe.market.',
    'Metodo 2: venda mods (Corrupted do Deimos, Nightmare, Galvanized, Primed do Baro, Augment de sindicato).',
    'Metodo 3: venda Arcanes (Eidolons, Fissures high-level, sindicatos).',
    'Metodo 4 (avancado): venda mods Riven rerolados (god rolls valem milhares de platina).',
    'Pre-requisitos obrigatorios: MR2 + 2FA (TennoGuard) ativado no site da Warframe. Troca no Dojo (Trading Post) ou no Bazaar da Maroo.',
    'Dica: sempre cheque preco no warframe.market e anuncie 1-2p abaixo do menor.'
  ],
  riven: [
    'Riven e um mod especial por arma. Tem stats aleatorios (2 positivos OU 3 positivos + 1 negativo).',
    'Reroll custa Kuva, farmada em Kuva Siphon, Kuva Flood, Kuva Lich e Sortie.',
    'God roll = must-have stats com valores altos. Use !meta <arma> para ver os must-have.',
    'Kuva NAO e item negociavel. Voce vende o Riven ja rolado, nao o Kuva.'
  ],
  prime: [
    'Partes Prime vem de reliquias do Void, abertas em Void Fissures.',
    'Set completo = todas as partes de um Warframe/arma Prime. Vale mais que partes soltas.',
    'Reliquias Vaulted (fora de drop normal) tem partes que valem mais.',
    'Para montar um set, compre as partes que faltam no warframe.market.'
  ],
  baro: [
    "Baro Ki'Teer aparece a cada 2 semanas num Relay aleatorio por 48h.",
    'Ele vende com Ducats (obtidos queimando partes Prime) + Credits.',
    'Ele NAO vende com platinum nem com Void Traces.',
    'Void Traces servem para REFINAR reliquias no Orbiter, nao no Baro.'
  ],
  kuva: [
    'Kuva NAO e item negociavel.',
    'Serve apenas para rerolar mods Riven.',
    'Farm: Kuva Siphon, Kuva Flood, Kuva Lich e Sortie.'
  ],
  endo: [
    'Endo NAO e item negociavel.',
    'Serve para upar mods (rank up).',
    'Farm: Sortie, Ayatan Sculptures, Arbitrations, Rathuum, Deimos Bounties.'
  ],
  trocar: [
    'Para trocar itens voce precisa: Mastery Rank 2+ E TennoGuard (2FA) ativado.',
    'Troca acontece no Trading Post do Dojo do cla OU no Bazaar da Maroo, em Marte.',
    'No trade voce negocia platinum e itens diretamente com outro jogador.'
  ],
  vault: [
    'Reliquias Vaulted sao reliquias que sairam do drop normal.',
    'As partes delas (especialmente de Warframes/armas fortes) valem mais porque sao raras.',
    'Voce ainda pode usa-las se ja tiver, ou comprar de outros jogadores.'
  ],
  arcane: [
    'Arcanes vem de: Eidolons (Planicies de Eidolon), Void Fissures high-level, sindicatos.',
    'Arcanes como Arcane Energize, Arcane Grace e Arcane Avenger valem muito.',
    'Existem Arcanes de Warframe (equipa no Warframe) e Arcanes de arma (equipa na arma/kitgun/zaw).'
  ],
  nightwave: [
    'Nightwave e o sistema de "battle pass" gratuito do Warframe.',
    'Os desafios dao reputacao com a Nightwave, que voce gasta na loja do Nora.',
    'Itens da loja como Nitain Extract, Kuva, Catalisadores valem bem no trade.'
  ]
}

function getKnowledgeFor(message) {
  const q = stripAccents(String(message || '').toLowerCase())
  const hits = []
  const seen = {}
  for (const [key, facts] of Object.entries(WF_KNOWLEDGE)) {
    if (q.includes(key)) {
      for (const f of facts) {
        if (!seen[f]) { seen[f] = true; hits.push(f) }
      }
    }
  }
  return hits.length ? '[FATOS CONFIRMADOS]\n- ' + hits.join('\n- ') : null
}

module.exports = { WF_KNOWLEDGE, getKnowledgeFor }
