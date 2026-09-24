// src/utils/text.js
function clipText(s, max) {
  s = String(s || '').trim()
  if (s.length <= max) return s
  return s.slice(0, max - 20).trim() + '\n...(cortado)'
}

function toSlug(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function normalizeWeaponKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function normDispKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function jidToNumber(jid) {
  return String(jid || '').replace(/@.*$/, '').replace(/\D/g, '')
}

module.exports = { clipText, toSlug, normalizeWeaponKey, normDispKey, stripAccents, jidToNumber }
