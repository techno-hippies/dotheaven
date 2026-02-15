export function tryParseJson(input: string): any | null {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

export function tryParseBase64Json(input: string): any | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4
    const padded = normalized + (pad ? '='.repeat(4 - pad) : '')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}
