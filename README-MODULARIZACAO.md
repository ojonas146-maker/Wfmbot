# Wm_bot — modularizado (completo)

Este projeto é o `index (1).js` original (≈4000 linhas, um arquivo só)
dividido em 47 módulos, mantendo **100% das funcionalidades**. Testei a
sintaxe de todos os arquivos (`node --check`) e o carregamento/roteamento
com dependências stub (sem rede neste ambiente) — ver seção "Como validar
no seu servidor" no fim.

## Estrutura final

```
wmbot/
├─ index.js                          ← bootstrap: Baileys + pré-filtros + router
├─ package.json
├─ data/                             ← base_values.json, dispositions.json, riven_meta.json
├─ src/
│  ├─ config/
│  │  ├─ env.js                      ← TODA config/segredos/paths centralizados
│  │  └─ constants.js                ← tabelas estáticas (incarnon, arby tiers, descendia...)
│  ├─ utils/
│  │  ├─ text.js                     ← clipText, toSlug, normalizeWeaponKey, jidToNumber...
│  │  └─ time.js                     ← sleep, formatTimeLeft, formatBR, formatUptime...
│  ├─ core/
│  │  ├─ adminConfig.js              ← load/save admin_config.json
│  │  ├─ adminAuth.js                ← isAdmin, mute/vip, limites de riven
│  │  └─ adminState.js               ← estado em memória + !statusbot/!stats
│  ├─ services/
│  │  ├─ riven/
│  │  │  ├─ baseData.js              ← base_values/dispositions/riven_meta
│  │  │  ├─ grading.js               ← gradeOneStat, analyzeRivenMeta, labels
│  │  │  ├─ auctionSearch.js         ← busca de leilões + backoff 429
│  │  │  ├─ weekly.js                ← dados semanais oficiais (DE)
│  │  │  ├─ alerts.js                ← sniper de riven (criar/listar/checar/!grade)
│  │  │  ├─ steal.js                 ← detector de "riven roubado"
│  │  │  └─ metaCommands.js          ← !meta / !grol
│  │  ├─ wfm/
│  │  │  ├─ client.js                ← preço, perfil, set, relíquia
│  │  │  ├─ priceAlerts.js           ← !alerta / !alertas / !delalerta
│  │  │  ├─ highest.js               ← !highest (ranking de preços)
│  │  │  ├─ statusChat.js            ← WebSocket status/chat do Market (admin)
│  │  │  └─ itemInfo.js              ← !i (ficha de item, com fallback wiki)
│  │  ├─ worldstate/                 ← fissuras, invasões, ciclos, sortie, archon,
│  │  │                                 archimedea, eventos, nightwave, baro,
│  │  │                                 ressurgência, calendário, descendia,
│  │  │                                 oracle bounties, arbitragem/incursões, drops, acrithis
│  │  ├─ ai/
│  │  │  ├─ knowledgeBase.js         ← fatos fixos (WF_KNOWLEDGE)
│  │  │  ├─ intent.js                ← classificação leve da pergunta
│  │  │  ├─ systemPrompt.js          ← prompt dinâmico por intenção
│  │  │  ├─ groqClient.js            ← askAI (cache, histórico por orçamento)
│  │  │  └─ rag.js                   ← retrieveWarframeFacts / wiki / stats de arma
│  │  └─ incarnon.js                 ← rotação do Circuit
│  ├─ commands/
│  │  ├─ router.js                   ← registro/roteamento de comandos
│  │  ├─ help.js                     ← !ajuda
│  │  ├─ ai.js                       ← !g, !limpar
│  │  ├─ price.js                    ← !p, !set, !perfil, !relic, !alerta*
│  │  ├─ riven.js                    ← !alertariven, !snipeweek, !riven, !grade, !meta, !highest, !i
│  │  ├─ worldstate.js               ← todos os comandos de estado do jogo
│  │  └─ admin.js                    ← TODOS os comandos admin-only
│  └─ jobs/
│     └─ scheduler.js                ← runAllChecks (preço, invasão, riven, steal)
└─ README-MODULARIZACAO.md           ← este arquivo
```

## O que foi preservado (verificado item a item)

- **Todos os comandos** do `!ajuda` original existem e apontam pra função
  equivalente extraída — nenhum comando foi removido ou renomeado.
- **Comportamento do admin**: mute por usuário, mute global, comandos
  bloqueáveis, limite de riven snipe por VIP/usuário comum, `!eval`
  (mantive por pedido explícito — ver aviso de segurança abaixo).
- **`!g` (IA)**: mantém o histórico por **chat** (`from`), igual ao
  original — não troquei pra por-remetente, que mudaria o comportamento
  em grupos. Além disso ganhou as melhorias já entregues na fase 1
  (prompt por intenção, cache, histórico por orçamento de caracteres).
- **Riven sniper / steal detector / weekly**: toda a lógica de dedupe
  (`riven_seen.json`), backoff de 429, fingerprint de leilão, e o cálculo
  de grade (`gradeOneStat`) foram portados **sem alterar a fórmula**.
- **WFM WebSocket (status/chat)**: reconexão com backoff exponencial,
  resposta citando a notificação do bot, tudo preservado.
- **Dados estáticos** (tiers de arbitragem, rotação do Incarnon, mapas do
  Descendia) foram movidos pra `config/constants.js` sem alterar nenhum
  valor.

## Testes que rodei (sem acesso à internet neste ambiente)

1. `node --check` em **todos os 47 arquivos** → sintaxe 100% válida.
2. Criei stubs locais de `axios`, `ws`, `pino` e `@whiskeysockets/baileys`
   (sem rede real) e rodei `require()` de **todos os módulos + index.js**
   → nenhuma dependência circular, nenhum path quebrado.
3. Rodei `index.js` com os stubs → bootstrap completo executa sem lançar
   exceção (só o `ensureArbyData` falha, porque o stub de rede não devolve
   dados reais — isso é esperado e está com try/catch, exatamente como no
   original).
4. Simulei o roteador chamando comandos reais (`!ajuda`, `!meta torid`,
   `!grol burston`, `!admin` como admin/não-admin, `!meujid`, `!incarnon`,
   comando inexistente) e conferi que as respostas batem com a lógica
   original (inclusive o silêncio em comando desconhecido).

**Isso NÃO substitui rodar de verdade** com WhatsApp conectado. Antes de
subir em produção:

```bash
cd wmbot
npm install
# defina as variáveis de ambiente (ver abaixo) antes de rodar
node index.js
```

## Variáveis de ambiente necessárias

```bash
GROQ_API_KEY=...        # obrigatório para !g (revogue a chave antiga exposta!)
WFM_JWT=...             # opcional, só pra !start/!online/!ingame/!offline
ADMIN_NUMBERS=5511988450236,155349520781506   # opcional, tem default
GROQ_MODEL=...           # opcional, confirme o id atual em console.groq.com/docs/models
DATA_ROOT=./data_runtime # opcional, onde ficam os *.json de runtime (alertas etc)
BOT_PHONE=5511978458775  # opcional, número pra pairing code
```

## ⚠️ Ainda pendente (herdado da fase 1, não modularização)

- **Revogar a chave Groq antiga** que estava hardcoded no arquivo original
  — ela não existe mais em nenhum módulo novo, mas se o `index (1).js`
  antigo já vazou publicamente, a chave em si continua comprometida até
  você trocá-la no painel da Groq.
- **`!eval`**: mantive porque a instrução foi "mantenha todas as
  funcionalidades intocadas", mas reforço a recomendação: rode isso só se
  os `ADMIN_NUMBERS` forem 100% confiáveis, porque é `eval()` puro no
  processo do bot.
- **`isAdmin` por `endsWith`**: mantive a lógica original (inclusive o
  matching "frouxo" por sufixo de número) pra não mudar comportamento;
  se quiser, dá pra trocar por comparação exata depois, mas isso é uma
  mudança de *comportamento*, não só de estrutura, então deixei como
  estava.
