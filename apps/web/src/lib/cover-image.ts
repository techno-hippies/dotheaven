/**
 * Local cover image reader.
 *
 * Desktop filesystem support has been removed, so this always returns null.
 */

export async function readCoverBase64(_coverPath: string): Promise<{ base64: string; contentType: string } | null> {
  return null
}
