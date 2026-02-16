/**
 * useVerification — Self.xyz identity verification flow.
 *
 * Manages the verification dialog state machine:
 * QR code → poll for Celo verification → mirror to MegaETH → success
 */

import { createSignal, onCleanup } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import type { VerificationState, VerificationData, VerifyStep } from '@heaven/ui'
import { getVerificationStatus, buildSelfVerifyLink, syncVerificationToMegaEth } from '../lib/heaven/verification'
import type { AuthContextType } from '../providers/AuthContext'

export function useVerification(
  address: () => string | null | undefined,
  auth: Pick<AuthContextType, 'getAuthContext'>,
) {
  const verificationQuery = createQuery(() => ({
    queryKey: ['verification', address()],
    queryFn: () => getVerificationStatus(address()! as `0x${string}`),
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 5,
  }))

  const verificationState = (): VerificationState => {
    const v = verificationQuery.data
    if (!v) return 'none'
    return v.verified ? 'verified' : 'none'
  }

  const verificationData = (): VerificationData | undefined => {
    const v = verificationQuery.data
    if (!v?.verified) return undefined
    return { verified: true, nationality: v.nationality }
  }

  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [step, setStep] = createSignal<VerifyStep>('qr')
  const [link, setLink] = createSignal<string | undefined>()
  const [linkLoading, setLinkLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()

  let pollTimer: ReturnType<typeof setInterval> | undefined

  onCleanup(() => { if (pollTimer) clearInterval(pollTimer) })

  const handleVerifyClick = async () => {
    setStep('qr')
    setLink(undefined)
    setError(undefined)
    setDialogOpen(true)
    setLinkLoading(true)

    try {
      const VERIFIER = import.meta.env.VITE_SELF_VERIFIER_CELO
      if (!VERIFIER) throw new Error('Verifier contract not configured')

      const selfLink = await buildSelfVerifyLink({
        contractAddress: VERIFIER,
        userAddress: address()! as `0x${string}`,
        scope: 'heaven-profile-verify',
      })
      setLink(selfLink)
      setLinkLoading(false)

      pollTimer = setInterval(async () => {
        try {
          const status = await getVerificationStatus(address()! as `0x${string}`, { skipCache: true })
          if (status.verified) {
            clearInterval(pollTimer!)
            pollTimer = undefined

            if (status.mirrorStale) {
              setStep('mirroring')
              try {
                const authCtx = await auth.getAuthContext()
                await syncVerificationToMegaEth(address()! as `0x${string}`, authCtx)
              } catch (e) {
                console.warn('[Verify] Mirror sync failed (non-fatal):', e)
              }
            }

            setStep('success')
            verificationQuery.refetch()
          }
        } catch {
          // polling error, keep trying
        }
      }, 5000)
    } catch (err: any) {
      setLinkLoading(false)
      setStep('error')
      setError(err?.message || 'Failed to start verification')
    }
  }

  const handleRetry = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined }
    handleVerifyClick()
  }

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  return {
    verificationQuery,
    verificationState,
    verificationData,
    dialogOpen,
    step,
    link,
    linkLoading,
    error,
    handleVerifyClick,
    handleRetry,
    handleDialogChange,
  }
}
