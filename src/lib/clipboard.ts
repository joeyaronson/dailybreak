function copyWithSelection(text: string) {
  const previous = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.setAttribute('aria-label', 'Copy results')
  Object.assign(textarea.style, {
    position: 'fixed', left: '-9999px', top: '0',
    fontSize: '16px', userSelect: 'text', webkitUserSelect: 'text',
  })
  document.body.appendChild(textarea)
  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    // Fallback for phone previews served over local-network HTTP.
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true })
  }
}

export async function copyToClipboard(text: string) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Some browsers deny clipboard permission but still allow a user-initiated copy.
    }
  }
  return copyWithSelection(text)
}
