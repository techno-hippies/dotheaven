import { type Component, createSignal, Show } from 'solid-js'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Button,
  TextField,
} from '@heaven/ui'
import { isAddress } from 'viem'
import { useAuth } from '../providers'
import { computeNode, getAddr, resolveEnsName } from '../lib/heaven'
import { manageAccess } from '../lib/content-service'

export interface ShareContentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentId: string
  title: string
}

/**
 * Resolve an identifier (0x address, name.heaven, name.eth) to an Ethereum address.
 */
async function resolveRecipient(input: string): Promise<`0x${string}`> {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Enter a recipient')

  // Raw address
  if (isAddress(trimmed)) return trimmed as `0x${string}`

  // .heaven name
  if (trimmed.endsWith('.heaven') || !trimmed.includes('.')) {
    const label = trimmed.replace(/\.heaven$/, '').toLowerCase()
    if (!label) throw new Error('Invalid name')
    const node = computeNode(label)
    const addr = await getAddr(node)
    if (!addr || addr === '0x0000000000000000000000000000000000000000') {
      throw new Error(`${label}.heaven not found`)
    }
    return addr
  }

  // .eth name
  if (trimmed.endsWith('.eth')) {
    const addr = await resolveEnsName(trimmed)
    if (!addr) throw new Error(`${trimmed} not found`)
    return addr
  }

  throw new Error('Enter an address, name.heaven, or name.eth')
}

export const ShareContentDialog: Component<ShareContentDialogProps> = (props) => {
  const auth = useAuth()
  const [recipient, setRecipient] = createSignal('')
  const [status, setStatus] = createSignal<'idle' | 'resolving' | 'granting' | 'done' | 'error'>('idle')
  const [resolvedAddr, setResolvedAddr] = createSignal('')
  const [error, setError] = createSignal('')
  const [txHash, setTxHash] = createSignal('')

  const reset = () => {
    setRecipient('')
    setStatus('idle')
    setResolvedAddr('')
    setError('')
    setTxHash('')
  }

  const handleShare = async () => {
    setError('')
    setStatus('resolving')

    try {
      const addr = await resolveRecipient(recipient())
      setResolvedAddr(addr)
      setStatus('granting')

      const authContext = await auth.getAuthContext()
      const pkp = auth.pkpInfo()
      if (!pkp) throw new Error('Not authenticated')

      const result = await manageAccess('grant', authContext, pkp.publicKey, {
        contentId: props.contentId,
        grantee: addr,
      })

      setTxHash(result.txHash)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) reset()
    props.onOpenChange(open)
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription class="truncate">{props.title}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Show when={status() !== 'done'}>
            <div onKeyDown={(e) => { if (e.key === 'Enter' && recipient().trim()) handleShare() }}>
              <TextField
                placeholder="alice.heaven, alice.eth, or 0x..."
                value={recipient()}
                onChange={(value: string) => setRecipient(value)}
                disabled={status() === 'resolving' || status() === 'granting'}
              />
            </div>
            <Show when={resolvedAddr()}>
              <p class="text-xs text-[var(--text-muted)] mt-2 truncate">
                Granting to {resolvedAddr()}
              </p>
            </Show>
            <Show when={error()}>
              <p class="text-sm text-red-400 mt-2">{error()}</p>
            </Show>
          </Show>
          <Show when={status() === 'done'}>
            <div class="text-center py-4">
              <p class="text-[var(--text-primary)] mb-2">Access granted</p>
              <p class="text-xs text-[var(--text-muted)] truncate">{resolvedAddr()}</p>
              <Show when={txHash()}>
                <p class="text-xs text-[var(--text-muted)] mt-1 truncate">tx: {txHash()}</p>
              </Show>
            </div>
          </Show>
        </DialogBody>
        <DialogFooter>
          <Show when={status() !== 'done'}>
            <Button
              variant="default"
              onClick={handleShare}
              disabled={!recipient().trim() || status() === 'resolving' || status() === 'granting'}
            >
              {status() === 'resolving' ? 'Resolving...' : status() === 'granting' ? 'Granting...' : 'Share'}
            </Button>
          </Show>
          <Show when={status() === 'done'}>
            <Button variant="default" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </Show>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
