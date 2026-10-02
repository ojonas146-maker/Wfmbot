const https = require('https')
const req = https.request('https://warframe.market/socket?platform=pc', {
  headers: {
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    Origin: 'https://warframe.market',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
  }
}, res => {
  console.log('STATUS', res.statusCode)
  console.log('HEADERS', JSON.stringify(res.headers, null, 2))
  let body = ''
  res.on('data', d => body += d)
  res.on('end', () => { console.log('BODY', body.slice(0, 500)); process.exit(0) })
})
req.on('upgrade', (res) => { console.log('UPGRADE OK', res.statusCode); process.exit(0) })
req.on('error', e => { console.log('ERRO', e.message); process.exit(1) })
req.end()
