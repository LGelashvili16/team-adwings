import { useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { useModal } from '#/hooks/use-modal'

export function ConfirmModalContent({
  body,
  confirmLabel,
  cancelLabel = 'გაუქმება',
  confirmVariant = 'default',
  submitting,
  onConfirm,
}: {
  body?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  confirmVariant?: 'default' | 'destructive' | 'warning'
  submitting?: RefObject<boolean>
  onConfirm: () => Promise<boolean>
}) {
  const { closeModal } = useModal()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    if (pending || submitting?.current) return
    if (submitting) submitting.current = true
    setPending(true)
    setError('')
    try {
      const ok = await onConfirm()
      if (submitting) submitting.current = false
      if (ok) closeModal()
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'მოქმედება ვერ შესრულდა. სცადეთ ხელახლა.',
      )
    } finally {
      if (submitting) submitting.current = false
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {body}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          depth="raised"
          disabled={pending}
          onClick={closeModal}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant}
          depth="raised"
          disabled={pending}
          aria-busy={pending}
          onClick={() => void handleConfirm()}
        >
          {pending ? <Spinner aria-hidden="true" /> : null}
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
