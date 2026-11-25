import { useEffect, useState } from 'react'
import { Sheet } from '#/components/ui/sheet'
import type { ComponentProps } from 'react'

export function DraftSheet({
  open,
  ...props
}: Omit<ComponentProps<typeof Sheet>, 'open'> & { open: boolean }) {
  const [ready, setReady] = useState(!open)
  useEffect(() => {
    if (ready) return
    // A draft can mount already open. Give Base UI one closed commit so its
    // native starting style runs when the popup opens on the next frame.
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [ready])
  return <Sheet {...props} open={ready && open} />
}
