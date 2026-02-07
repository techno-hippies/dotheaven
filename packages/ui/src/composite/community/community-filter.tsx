/**
 * CommunityFilter — Filter dialog/drawer for community member discovery.
 *
 * Mobile: Drawer (bottom sheet)
 * Desktop: Dialog (modal)
 *
 * Filters:
 * - Gender
 * - Native language (speaks)
 * - Learning language (wants to learn)
 * - Verified (Celo passport verification)
 */

import type { Component, JSX } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogCloseButton,
} from '../../primitives/dialog'
import {
  Drawer,
  DrawerContent,
} from '../../primitives/drawer'
import { Button } from '../../primitives/button'
import { Select, type SelectOption } from '../../primitives/select'
import { Switch } from '../../primitives/switch'
import { useIsMobile } from '../../lib/use-media-query'
import { GENDER_OPTIONS, LEARNING_LANGUAGE_OPTIONS } from '../../constants/profile-options'
import { X } from '../../icons'

export interface CommunityFilters {
  gender?: string
  nativeLanguage?: string
  learningLanguage?: string
  verified?: boolean
}

export interface CommunityFilterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: CommunityFilters
  onFiltersChange: (filters: CommunityFilters) => void
  /** Count of active filters */
  activeCount?: number
}

/** Gender options with "Any" prepended */
const GENDER_FILTER_OPTIONS: SelectOption[] = [
  { value: '', label: 'Any' },
  ...GENDER_OPTIONS,
]

/** Language options with "Any" prepended */
const LANGUAGE_FILTER_OPTIONS: SelectOption[] = [
  { value: '', label: 'Any' },
  ...LEARNING_LANGUAGE_OPTIONS,
]

/**
 * CommunityFilterDialog — responsive filter UI for community member discovery.
 */
export const CommunityFilterDialog: Component<CommunityFilterProps> = (props) => {
  const isMobile = useIsMobile()

  // Local state for pending changes
  const [localFilters, setLocalFilters] = createSignal<CommunityFilters>(props.filters)

  // Reset local state when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalFilters(props.filters)
    }
    props.onOpenChange(open)
  }

  const handleApply = () => {
    props.onFiltersChange(localFilters())
    props.onOpenChange(false)
  }

  const handleReset = () => {
    const empty: CommunityFilters = {}
    setLocalFilters(empty)
    props.onFiltersChange(empty)
    props.onOpenChange(false)
  }

  // Check if any filters are set
  const hasFilters = () => {
    const f = localFilters()
    return !!(f.gender || f.nativeLanguage || f.learningLanguage || f.verified)
  }

  // Shared filter content
  const filterContent = (): JSX.Element => (
    <div class="flex flex-col gap-6">
      {/* Gender */}
      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium text-[var(--text-secondary)]">
          Gender
        </label>
        <Select
          options={GENDER_FILTER_OPTIONS}
          value={GENDER_FILTER_OPTIONS.find((o) => o.value === (localFilters().gender ?? '')) ?? GENDER_FILTER_OPTIONS[0]}
          onChange={(opt) => setLocalFilters((f) => ({ ...f, gender: opt?.value || undefined }))}
          placeholder="Any"
        />
      </div>

      {/* Native Language (speaks) */}
      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium text-[var(--text-secondary)]">
          Speaks (Native)
        </label>
        <Select
          options={LANGUAGE_FILTER_OPTIONS}
          value={LANGUAGE_FILTER_OPTIONS.find((o) => o.value === (localFilters().nativeLanguage ?? '')) ?? LANGUAGE_FILTER_OPTIONS[0]}
          onChange={(opt) => setLocalFilters((f) => ({ ...f, nativeLanguage: opt?.value || undefined }))}
          placeholder="Any"
        />
        <p class="text-xs text-[var(--text-muted)]">
          Find native speakers of this language
        </p>
      </div>

      {/* Learning Language */}
      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium text-[var(--text-secondary)]">
          Learning
        </label>
        <Select
          options={LANGUAGE_FILTER_OPTIONS}
          value={LANGUAGE_FILTER_OPTIONS.find((o) => o.value === (localFilters().learningLanguage ?? '')) ?? LANGUAGE_FILTER_OPTIONS[0]}
          onChange={(opt) => setLocalFilters((f) => ({ ...f, learningLanguage: opt?.value || undefined }))}
          placeholder="Any"
        />
        <p class="text-xs text-[var(--text-muted)]">
          Find people learning this language
        </p>
      </div>

      {/* Verified */}
      <div class="flex items-center justify-between py-2">
        <div class="flex flex-col gap-0.5">
          <label class="text-sm font-medium text-[var(--text-secondary)]">
            Verified Only
          </label>
          <p class="text-xs text-[var(--text-muted)]">
            Passport-verified identity
          </p>
        </div>
        <Switch
          checked={localFilters().verified ?? false}
          onChange={(checked) => setLocalFilters((f) => ({ ...f, verified: checked || undefined }))}
        />
      </div>
    </div>
  )

  // Footer with Apply/Reset buttons
  const filterFooter = (): JSX.Element => (
    <div class="flex gap-3">
      <Show when={hasFilters()}>
        <Button
          variant="ghost"
          class="flex-1"
          onClick={handleReset}
        >
          Reset
        </Button>
      </Show>
      <Button
        variant="default"
        class="flex-1"
        onClick={handleApply}
      >
        Apply Filters
      </Button>
    </div>
  )

  return (
    <Show
      when={isMobile()}
      fallback={
        // Desktop: Dialog
        <Dialog open={props.open} onOpenChange={handleOpenChange}>
          <DialogContent class="max-w-sm">
            <div class="relative p-6 pb-4">
              <DialogCloseButton class="absolute top-4 right-4 p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer">
                <X class="w-5 h-5" />
              </DialogCloseButton>
              <h2 class="text-lg font-semibold text-[var(--text-primary)]">
                Filter Members
              </h2>
            </div>
            <DialogBody>
              {filterContent()}
              <div class="mt-6">
                {filterFooter()}
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Mobile: Drawer */}
      <Drawer open={props.open} onOpenChange={handleOpenChange}>
        <DrawerContent
          showHandle
          class="pb-8"
          footer={filterFooter()}
        >
          <div class="pt-4 pb-2">
            <h2 class="text-lg font-semibold text-[var(--text-primary)] text-center">
              Filter Members
            </h2>
          </div>
          {filterContent()}
        </DrawerContent>
      </Drawer>
    </Show>
  )
}

/**
 * Count the number of active filters.
 */
export function countActiveFilters(filters: CommunityFilters): number {
  let count = 0
  if (filters.gender) count++
  if (filters.nativeLanguage) count++
  if (filters.learningLanguage) count++
  if (filters.verified) count++
  return count
}
