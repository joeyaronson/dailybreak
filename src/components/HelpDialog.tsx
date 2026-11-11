import { useEffect, useRef } from 'react'
import { ModeInstructions } from './ModeIntro'
import type { Mode } from './ModeIntro'

export function HelpDialog({ mode, open, onDismiss }: { mode: Mode; open: boolean; onDismiss: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (open && !dialog?.open) dialog?.showModal()
    else if (!open && dialog?.open) dialog.close()
    return () => { if (dialog?.open) dialog.close() }
  }, [open])

  return (
    <dialog ref={dialogRef} className="round-summary instructions-panel help-dialog" aria-labelledby="help-title"
      onCancel={(event) => { event.preventDefault(); onDismiss() }}>
      <h2 id="help-title">How to play</h2>
      <ModeInstructions mode={mode} />
      <button className="launch-button" type="button" onClick={onDismiss}>Close</button>
    </dialog>
  )
}
