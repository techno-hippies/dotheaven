import { For } from 'solid-js'
import { CaretDown, Check } from '../../icons'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItemIndicator,
} from '../../primitives/dropdown-menu'

export interface FilterSortBarProps<F extends string, S extends string> {
  filter: F
  filterLabels: Record<F, string>
  onFilterChange: (v: F) => void
  sortField: S
  sortLabels: Record<S, string>
  onSortChange: (v: S) => void
}

/**
 * Horizontal bar with Filter and Sort dropdown menus.
 * Generic over filter and sort value types.
 */
export function FilterSortBar<F extends string, S extends string>(props: FilterSortBarProps<F, S>) {
  return (
    <div class="flex items-center justify-between px-4 h-10">
      <DropdownMenu>
        <DropdownMenuTrigger class="flex items-center gap-1 text-base font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
          Filter: {props.filterLabels[props.filter]}
          <CaretDown class="w-3.5 h-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value={props.filter} onChange={(v) => props.onFilterChange(v as F)}>
            <For each={Object.entries(props.filterLabels)}>
              {([value, label]) => (
                <DropdownMenuRadioItem value={value}>
                  <DropdownMenuItemIndicator>
                    <Check class="w-4 h-4" />
                  </DropdownMenuItemIndicator>
                  {label as string}
                </DropdownMenuRadioItem>
              )}
            </For>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger class="flex items-center gap-1 text-base font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
          Sort: {props.sortLabels[props.sortField]}
          <CaretDown class="w-3.5 h-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value={props.sortField} onChange={(v) => props.onSortChange(v as S)}>
            <For each={Object.entries(props.sortLabels)}>
              {([value, label]) => (
                <DropdownMenuRadioItem value={value}>
                  <DropdownMenuItemIndicator>
                    <Check class="w-4 h-4" />
                  </DropdownMenuItemIndicator>
                  {label as string}
                </DropdownMenuRadioItem>
              )}
            </For>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
