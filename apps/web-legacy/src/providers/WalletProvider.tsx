import { createContext, useContext, type ParentComponent, createSignal, createEffect } from 'solid-js'
import type { Address } from 'viem'
import { connectWallet, getCurrentChainId } from '../lib/web3'

interface WalletContextValue {
  address: () => Address | null
  chainId: () => number | null
  connect: () => Promise<void>
  disconnect: () => void
  isConnected: () => boolean
}

const WalletContext = createContext<WalletContextValue>()

export const WalletProvider: ParentComponent = (props) => {
  const [address, setAddress] = createSignal<Address | null>(null)
  const [chainId, setChainId] = createSignal<number | null>(null)

  // Listen for account changes
  createEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAddress(accounts[0] as Address)
          getCurrentChainId().then(setChainId).catch(console.error)
        }
      })

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAddress(accounts[0] as Address)
        } else {
          setAddress(null)
        }
      }

      const handleChainChanged = (chainIdHex: string) => {
        setChainId(Number.parseInt(chainIdHex, 16))
      }

      window.ethereum.on?.('accountsChanged', handleAccountsChanged)
      window.ethereum.on?.('chainChanged', handleChainChanged)

      return () => {
        window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged)
        window.ethereum?.removeListener?.('chainChanged', handleChainChanged)
      }
    }
  })

  const connect = async () => {
    try {
      const addr = await connectWallet()
      setAddress(addr)
      const cid = await getCurrentChainId()
      setChainId(cid)
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      throw error
    }
  }

  const disconnect = () => {
    setAddress(null)
    setChainId(null)
  }

  const isConnected = () => address() !== null

  const value: WalletContextValue = {
    address,
    chainId,
    connect,
    disconnect,
    isConnected,
  }

  return <WalletContext.Provider value={value}>{props.children}</WalletContext.Provider>
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider')
  }
  return context
}
