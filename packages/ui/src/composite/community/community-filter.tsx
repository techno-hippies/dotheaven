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
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
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

export interface CommunityFilters {
  gender?: string
  nativeLanguage?: string
  learningLanguage?: string
  sameCity?: boolean
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
    return !!(f.gender || f.nativeLanguage || f.learningLanguage || f.sameCity || f.verified)
  }

  // Shared filter content
  const filterContent = (): JSX.Element => (
    <div class="flex flex-col gap-6">
      {/* Gender */}
      <div class="flex flex-col gap-2">
        <label class="text-base font-medium text-[var(--text-secondary)]">
          Gender
        </label>
        <Select
          options={GENDER_FILTER_OPTIONS}
          value={GENDER_FILTER_OPTIONS.find((o) => o.value === (localFilters().gender ?? '')) ?? GENDER_FILTER_OPTIONS[0]}
          onChange={(opt) => setLocalFilters((f) => ({ ...f, gender: opt?.value || undefined }))}
          placeholder="Any"
        />
      </div>

      {/* Native Language */}
      <div class="flex flex-col gap-2">
        <label class="text-base font-medium text-[var(--text-secondary)]">
          Native Language
        </label>
        <Select
          options={LANGUAGE_FILTER_OPTIONS}
          value={LANGUAGE_FILTER_OPTIONS.find((o) => o.value === (localFilters().nativeLanguage ?? '')) ?? LANGUAGE_FILTER_OPTIONS[0]}
          onChange={(opt) => setLocalFilters((f) => ({ ...f, nativeLanguage: opt?.value || undefined }))}
          placeholder="Any"
        />
      </div>

      {/* Learning Language */}
      <div class="flex flex-col gap-2">
        <label class="text-base font-medium text-[var(--text-secondary)]">
          Learning Language
        </label>
        <Select
          options={LANGUAGE_FILTER_OPTIONS}
          value={LANGUAGE_FILTER_OPTIONS.find((o) => o.value === (localFilters().learningLanguage ?? '')) ?? LANGUAGE_FILTER_OPTIONS[0]}
          onChange={(opt) => setLocalFilters((f) => ({ ...f, learningLanguage: opt?.value || undefined }))}
          placeholder="Any"
        />
      </div>

      {/* Same City */}
      <div class="flex items-center justify-between py-2">
        <label class="text-base font-medium text-[var(--text-secondary)]">
          Same City
        </label>
        <Switch
          checked={localFilters().sameCity ?? false}
          onChange={(checked) => setLocalFilters((f) => ({ ...f, sameCity: checked || undefined }))}
        />
      </div>

      {/* Verified */}
      <div class="flex items-center justify-between py-2">
        <label class="text-base font-medium text-[var(--text-secondary)]">
          Verified
        </label>
        <Switch
          checked={localFilters().verified ?? false}
          onChange={(checked) => setLocalFilters((f) => ({ ...f, verified: checked || undefined }))}
        />
      </div>
    </div>
  )

  // Footer with Apply/Reset buttons
  const filterFooter = (): JSX.Element => (
    <div class="flex gap-3 w-full">
      <Show when={hasFilters()}>
        <Button
          variant="secondary"
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
        Apply
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
            <DialogHeader>
              <DialogTitle>Filter Members</DialogTitle>
            </DialogHeader>
            <DialogBody>
              {filterContent()}
            </DialogBody>
            <DialogFooter class="!justify-stretch">
              {filterFooter()}
            </DialogFooter>
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
  if (filters.sameCity) count++
  if (filters.verified) count++
  return count
}
