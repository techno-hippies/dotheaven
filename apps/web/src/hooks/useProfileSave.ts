/**
 * useProfileSave — profile save logic for MyProfilePage.
 *
 * Handles avatar/cover upload to IPFS, text record assembly,
 * retry-on-stale-signature, and structured profile write.
 */

import type { Accessor } from 'solid-js'
import type { ProfileInput } from '@heaven/ui'
import { getTagLabel } from '@heaven/ui'
import { computeNode, setProfile, setTextRecord, setTextRecords } from '../lib/heaven'
import { uploadAvatar } from '../lib/heaven/avatar'
import { parseTagCsv } from '../lib/heaven/profile'
import type { AuthContextType } from '../providers/AuthContext'

interface UseProfileSaveDeps {
  auth: Pick<AuthContextType, 'pkpAddress' | 'pkpInfo' | 'getAuthContext'>
  heavenName: Accessor<string | null>
  importedAvatarUri: Accessor<string | null>
  setImportedAvatarUri: (v: string | null) => void
  profileQuery: { refetch: () => void }
  t: (...args: any[]) => string
}

export interface UseProfileSaveResult {
  handleProfileSave: (data: ProfileInput) => Promise<void>
}

export function useProfileSave(deps: UseProfileSaveDeps): UseProfileSaveResult {
  const { auth, heavenName, importedAvatarUri, setImportedAvatarUri, profileQuery, t } = deps

  const handleProfileSave = async (data: ProfileInput) => {
    const addr = auth.pkpAddress()
    const pkpInfoData = auth.pkpInfo()

    if (!addr || !pkpInfoData) {
      throw new Error('Not authenticated')
    }

    const draft: ProfileInput = { ...data }
    let authContext = await auth.getAuthContext()

    const username = heavenName()
    const wantsRecords = Boolean(
      draft.avatarFile ||
      draft.coverFile ||
      draft.bio !== undefined ||
      draft.url !== undefined ||
      draft.twitter !== undefined ||
      draft.github !== undefined ||
      draft.telegram !== undefined
    )
    if (wantsRecords && !username) {
      throw new Error(t('profile.claimNameFirst'))
    }

    let updatedAvatar = false
    let updatedCover = false

    // If user imported an avatar URI from ENS/wallet, use it directly (no upload)
    const imported = importedAvatarUri()
    if (imported && !draft.avatarFile) {
      draft.avatar = imported
      updatedAvatar = true
      setImportedAvatarUri(null)
    }

    // Upload avatar to IPFS if a new file was selected
    if (draft.avatarFile) {
      const uploadResult = await uploadAvatar(
        draft.avatarFile,
        pkpInfoData.publicKey,
        authContext,
      )
      if (!uploadResult.success || !uploadResult.avatarCID) {
        throw new Error(uploadResult.error || 'Avatar upload failed')
      }
      draft.avatar = `ipfs://${uploadResult.avatarCID}`
      delete draft.avatarFile
      updatedAvatar = true
    }

    // Upload cover photo to IPFS if a new file was selected
    if (draft.coverFile) {
      const uploadResult = await uploadAvatar(
        draft.coverFile,
        pkpInfoData.publicKey,
        authContext,
        { skipStyleCheck: true },
      )
      if (!uploadResult.success || !uploadResult.avatarCID) {
        throw new Error(uploadResult.error || 'Cover photo upload failed')
      }
      draft.coverPhoto = `ipfs://${uploadResult.avatarCID}`
      delete draft.coverFile
      updatedCover = true
    }

    // Store all text records in RecordsV1 if user has a name
    if (username) {
      const recordKeys: string[] = []
      const recordValues: string[] = []

      if (updatedAvatar && draft.avatar) {
        recordKeys.push('avatar')
        recordValues.push(draft.avatar)
      }
      if (updatedCover && draft.coverPhoto) {
        recordKeys.push('header')
        recordValues.push(draft.coverPhoto)
      }

      // Convert tag IDs to display labels for RecordsV1
      const hobbyIds = parseTagCsv(draft.hobbiesCommit)
      const skillIds = parseTagCsv(draft.skillsCommit)
      const hobbyLabels = hobbyIds.length ? hobbyIds.map(id => getTagLabel(id)).join(', ') : undefined
      const skillLabels = skillIds.length ? skillIds.map(id => getTagLabel(id)).join(', ') : undefined

      const socialRecords: [string, string | undefined][] = [
        ['description', draft.bio],
        ['url', draft.url],
        ['com.twitter', draft.twitter],
        ['com.github', draft.github],
        ['org.telegram', draft.telegram],
        ['heaven.hobbies', hobbyLabels],
        ['heaven.skills', skillLabels],
        ['heaven.location', draft.locationCityId],
        ['heaven.school', draft.school],
      ]
      for (const [key, value] of socialRecords) {
        if (value !== undefined) {
          recordKeys.push(key)
          recordValues.push(value)
        }
      }

      if (recordKeys.length > 0) {
        const node = computeNode(username)
        let recordResult = recordKeys.length === 1
          ? await setTextRecord(node, recordKeys[0], recordValues[0], pkpInfoData.publicKey, authContext)
          : await setTextRecords(node, recordKeys, recordValues, pkpInfoData.publicKey, authContext)
        if (!recordResult.success && /signature/i.test(recordResult.error || '')) {
          console.warn('[ProfileSave] Signature error, refreshing auth context and retrying record set...')
          const { clearAuthContext } = await import('../lib/lit')
          clearAuthContext()
          authContext = await auth.getAuthContext()
          recordResult = recordKeys.length === 1
            ? await setTextRecord(node, recordKeys[0], recordValues[0], pkpInfoData.publicKey, authContext)
            : await setTextRecords(node, recordKeys, recordValues, pkpInfoData.publicKey, authContext)
        }
        if (!recordResult.success) {
          throw new Error(recordResult.error || 'Failed to set ENS records')
        }
      }
    }

    // These fields are stored in RecordsV1 only, not ProfileV2
    delete draft.avatar
    delete draft.coverPhoto
    delete draft.bio
    delete draft.url
    delete draft.twitter
    delete draft.github
    delete draft.telegram

    let result: Awaited<ReturnType<typeof setProfile>>
    try {
      result = await setProfile(draft, addr, authContext, pkpInfoData.publicKey)
    } catch (err: any) {
      if (/[Ss]ignature error/.test(err?.message || '')) {
        console.warn('[ProfileSave] Signature error, refreshing auth context and retrying...')
        const { clearAuthContext } = await import('../lib/lit')
        clearAuthContext()
        authContext = await auth.getAuthContext()
        result = await setProfile(draft, addr, authContext, pkpInfoData.publicKey)
      } else {
        throw err
      }
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to save profile')
    }

    profileQuery.refetch()
  }

  return { handleProfileSave }
}
