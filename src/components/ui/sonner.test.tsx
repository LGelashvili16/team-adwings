import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { toast } from 'sonner'
import { Toaster } from './sonner'

afterEach(() => {
  toast.dismiss()
})

it('displays Sonner notifications without a close button', async () => {
  render(<Toaster />)
  act(() => {
    toast.success('განრიგი შენახულია.')
  })
  expect(await screen.findByText('განრიგი შენახულია.')).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
