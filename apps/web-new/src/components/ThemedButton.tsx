import type { Component } from 'solid-js'

interface ThemedButtonProps {
  label: string
  onClick: () => void
}

export const ThemedButton: Component<ThemedButtonProps> = (props) => {
  return (
    <button class="themed-button" type="button" onClick={props.onClick}>
      {props.label}
    </button>
  )
}
