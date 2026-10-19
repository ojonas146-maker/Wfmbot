// src/commands/diag.js
// !diag (admin): testa os endereços externos que o bot usa e mostra o que cada um responde.
const { register } = require('./router')

register(/^!(?:diag|diagnostico|diagapi)$/i, async ({ sock, from }) => {
  await sock.sendMessage(from, { text: '🩺 Testando a rede do bot (leva ~20s)...' })
  const { runNetDiagnostics, formatReport } = require('../services/diag/netDiag')
  const rep = await runNetDiagnostics()
  await sock.sendMessage(from, { text: formatReport(rep) })
}, { adminOnly: true })
