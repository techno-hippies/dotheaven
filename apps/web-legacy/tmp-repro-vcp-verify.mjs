import { Wallet } from 'ethers'

const base = (process.env.VOICE_CONTROL_PLANE_URL || '').trim().replace(/\/+$/, '')
if (!base) throw new Error('Missing VOICE_CONTROL_PLANE_URL')
const wallet = new Wallet('0x59c6995e998f97a5a0044966f094538e36f50d8df10ac7a90c6fce44f7f0fd5c')
const address = wallet.address.toLowerCase()

async function authOnce(i) {
  const n = await fetch(base + '/auth/nonce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: address }),
  })
  const nbody = await n.json().catch(() => ({}))
  if (!n.ok || !nbody.nonce) return { step: 'nonce', status: n.status, body: nbody }

  const sig = await wallet.signMessage(nbody.nonce)

  const v = await fetch(base + '/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: address, signature: sig, nonce: nbody.nonce }),
  })
  const vbody = await v.json().catch(() => ({}))
  if (!v.ok) return { step: 'verify', status: v.status, body: vbody, nonce: nbody.nonce.slice(0,12) }
  return { step: 'ok', status: v.status }
}

let fail = 0
for (let i = 0; i < 120; i++) {
  const r = await authOnce(i)
  if (r.step !== 'ok') {
    fail++
    console.log('FAIL', i, JSON.stringify(r))
  }
}
console.log('done fail=', fail)
