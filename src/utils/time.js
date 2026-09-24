// src/utils/time.js
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function formatTimeLeft(ms) {
  if (ms <= 0) return 'agora'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  if (days > 0) return days + 'd ' + hours + 'h'
  if (hours > 0) return hours + 'h ' + mins + 'min'
  return mins + 'min'
}

function formatDaysLeft(ms) {
  if (ms <= 0) return 'agora'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  if (d <= 0) return h + 'h'
  if (d === 1) return '1 dia'
  if (d < 28) return d + ' dias'
  const m = Math.round(d / 30)
  return m <= 1 ? '1 mês' : m + ' meses'
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'min'
  if (h > 0) return h + 'h ' + m + 'min'
  return m + 'min'
}

function formatBR(tsMs) {
  if (!tsMs) return '?'
  return new Date(tsMs).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function formatBRDate(tsMs) {
  if (!tsMs) return '?'
  return new Date(tsMs).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

module.exports = { sleep, formatTimeLeft, formatDaysLeft, formatUptime, formatBR, formatBRDate }
