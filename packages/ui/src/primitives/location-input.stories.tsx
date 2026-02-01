import type { Meta, StoryObj } from '@storybook/html'
import { LocationInput, type LocationInputProps, type LocationResult } from './location-input'
import { createSignal } from 'solid-js'

const meta: Meta<LocationInputProps> = {
  title: 'Primitives/LocationInput',
  argTypes: {
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    error: { control: 'text' },
  },
}

export default meta
type Story = StoryObj<LocationInputProps>

export const Default: Story = {
  render: () => {
    const [value, setValue] = createSignal<LocationResult | null>(null)

    return (
      <div class="max-w-md p-8">
        <LocationInput value={value()} onChange={setValue} />
        <div class="mt-4 p-3 bg-[var(--bg-highlight)] rounded-md">
          <p class="text-sm text-[var(--text-secondary)] mb-2">Selected location:</p>
          {value() ? (
            <div class="text-sm space-y-1">
              <p class="text-[var(--text-primary)] font-medium">{value()!.label}</p>
              <p class="text-[var(--text-muted)]">
                Lat: {value()!.lat.toFixed(4)}, Lng: {value()!.lng.toFixed(4)}
              </p>
              <p class="text-[var(--text-muted)] text-xs">
                OSM: {value()!.osm_type} #{value()!.osm_id}
              </p>
            </div>
          ) : (
            <p class="text-[var(--text-muted)] text-sm">None</p>
          )}
        </div>
      </div>
    )
  },
}

export const WithPlaceholder: Story = {
  render: () => {
    const [value, setValue] = createSignal<LocationResult | null>(null)

    return (
      <div class="max-w-md p-8">
        <LocationInput
          value={value()}
          onChange={setValue}
          placeholder="Where do you live?"
        />
      </div>
    )
  },
}

export const WithError: Story = {
  render: () => {
    const [value, setValue] = createSignal<LocationResult | null>(null)

    return (
      <div class="max-w-md p-8">
        <LocationInput
          value={value()}
          onChange={setValue}
          error="Please select a location from the list"
        />
      </div>
    )
  },
}

export const Disabled: Story = {
  render: () => {
    const [value, setValue] = createSignal<LocationResult | null>({
      provider: 'photon',
      osm_type: 'city',
      osm_id: 123456,
      label: 'Tokyo, Japan',
      lat: 35.6762,
      lng: 139.6503,
    })

    return (
      <div class="max-w-md p-8">
        <LocationInput value={value()} onChange={setValue} disabled />
      </div>
    )
  },
}

export const PrePopulated: Story = {
  render: () => {
    const [value, setValue] = createSignal<LocationResult | null>({
      provider: 'photon',
      osm_type: 'city',
      osm_id: 5128581,
      label: 'New York, New York, United States',
      lat: 40.7128,
      lng: -74.006,
    })

    return (
      <div class="max-w-md p-8">
        <LocationInput value={value()} onChange={setValue} />
        <div class="mt-4 p-3 bg-[var(--bg-highlight)] rounded-md">
          <p class="text-sm text-[var(--text-secondary)] mb-2">Selected location:</p>
          {value() ? (
            <div class="text-sm space-y-1">
              <p class="text-[var(--text-primary)] font-medium">{value()!.label}</p>
              <p class="text-[var(--text-muted)]">
                Lat: {value()!.lat.toFixed(4)}, Lng: {value()!.lng.toFixed(4)}
              </p>
            </div>
          ) : (
            <p class="text-[var(--text-muted)] text-sm">None</p>
          )}
        </div>
      </div>
    )
  },
}
