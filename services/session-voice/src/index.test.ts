import { expect, test } from 'bun:test'
import { privateKeyToAccount } from 'viem/accounts'

test('auth and join (mock escrow)', async () => {
  process.env.AGORA_APP_ID = '00000000000000000000000000000000'
  process.env.AGORA_APP_CERTIFICATE = '00000000000000000000000000000000'
  process.env.JWT_SECRET = 'test-secret'
  process.env.MOCK_ESCROW = '1'

  const account = privateKeyToAccount(
    '0x59c6995e998f97a5a0044966f094538b2928b1d0a4d4f6ddbd5b01b0cdd4f3c8'
  )
  const host = privateKeyToAccount(
    '0x8b3a350cf5c34c9194ca0f5dc8e8b3b6580f6c8d702d0f69c9d6b1c8c2b7f9d1'
  )

  process.env.MOCK_GUEST = account.address
  process.env.MOCK_HOST = host.address

  const { default: server } = await import('./index.js')

  const now = Math.floor(Date.now() / 1000)
  const message = `heaven-session:${now}`
  const signature = await account.signMessage({ message })

  const authRes = await server.fetch(new Request('http://local/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: account.address,
      message,
      signature,
    }),
  }))

  expect(authRes.status).toBe(200)
  const authBody = await authRes.json()
  expect(typeof authBody.token).toBe('string')

  const joinRes = await server.fetch(new Request('http://local/session/join', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${authBody.token}`,
    },
    body: JSON.stringify({ booking_id: '1' }),
  }))

  expect(joinRes.status).toBe(200)
  const joinBody = await joinRes.json()
  expect(joinBody.channel).toBe('heaven-6343-1')
  expect(typeof joinBody.user_uid).toBe('number')
  expect(typeof joinBody.agora_token).toBe('string')
})
