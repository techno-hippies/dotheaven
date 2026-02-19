const upstream = process.env.TEMPO_RPC_URL
const port = Number(process.env.RPC_SHIM_PORT ?? "8547")
const zero32 = `0x${"0".repeat(64)}`

if (!upstream) {
  console.error("TEMPO_RPC_URL is required")
  process.exit(1)
}

// Fields that Graph Node does not understand — strip from both txs and receipts.
const STRIP_FIELDS = new Set(["feePayer", "feeToken"])

function patchTxObject(obj: unknown): void {
  if (!obj || typeof obj !== "object") return
  const tx = obj as Record<string, unknown>
  if (tx.type === "0x76") {
    // Downgrade Tempo type-118 to legacy (type 0x0) so Graph Node can parse it.
    tx.type = "0x0"
    if (!("value" in tx)) tx.value = "0x0"
    if (!("input" in tx)) tx.input = "0x"
    if (!("to" in tx)) tx.to = null
    if (!("v" in tx)) tx.v = "0x0"
    if (!("r" in tx)) tx.r = zero32
    if (!("s" in tx)) tx.s = zero32
    if (!("yParity" in tx)) tx.yParity = "0x0"
    // Strip Tempo-specific fields Graph Node doesn't expect.
    for (const f of STRIP_FIELDS) delete tx[f]
  }
}

function patchReceiptObject(obj: unknown): void {
  if (!obj || typeof obj !== "object") return
  const r = obj as Record<string, unknown>
  if (r.type === "0x76") {
    r.type = "0x0"
  }
  // Strip Tempo-specific fields from ALL receipts (Tempo RPC includes them on every type).
  for (const f of STRIP_FIELDS) delete r[f]
}

function patchRpcPayload(obj: unknown): void {
  if (!obj || typeof obj !== "object") return

  if (Array.isArray(obj)) {
    for (const item of obj) patchRpcPayload(item)
    return
  }

  const record = obj as Record<string, unknown>

  // Patch transaction objects (have "input" or "nonce" fields)
  if ("nonce" in record || "input" in record) {
    patchTxObject(record)
  }
  // Patch receipt objects (have "transactionHash" + "cumulativeGasUsed")
  else if ("transactionHash" in record && "cumulativeGasUsed" in record) {
    patchReceiptObject(record)
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") patchRpcPayload(value)
  }
}

const server = Bun.serve({
  port,
  fetch: async (req) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 })
    }

    const requestBody = await req.text()

    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    })

    const raw = await upstreamRes.text()
    if (!upstreamRes.ok) {
      return new Response(raw, {
        status: upstreamRes.status,
        headers: { "content-type": "application/json" },
      })
    }

    try {
      const parsed = JSON.parse(raw) as unknown
      patchRpcPayload(parsed)
      return Response.json(parsed)
    } catch {
      return new Response(raw, {
        status: upstreamRes.status,
        headers: { "content-type": upstreamRes.headers.get("content-type") ?? "application/json" },
      })
    }
  },
})

console.log(`Tempo RPC shim listening on :${server.port}, upstream=${upstream}`)
