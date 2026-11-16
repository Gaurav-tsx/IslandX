import { useEffect, useState } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { listen } from '@tauri-apps/api/event'
import { desktop, native } from './native'

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section'
  blur?: 'standard' | 'high'
}

export function GlassCard({ as: Tag = 'div', blur, className = '', ...props }: CardProps) {
  return <Tag {...props} className={`glass-card ${className}`} data-blur={blur} />
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>
type Variant = 'control' | 'primary' | 'icon' | 'tab' | 'pill' | 'bare'
const buttonClasses: Record<Variant, string> = {
  control: 'control',
  primary: 'control primary',
  icon: 'icon-button',
  tab: 'nav-button',
  pill: 'pill',
  bare: '',
}

export function GlassButton({ variant = 'control', className = '', type = 'button', ...props }: ButtonProps & { variant?: Variant }) {
  return <button {...props} type={type} className={`glass-button ${buttonClasses[variant]} ${className}`} />
}

export function GlassTile({ className = '', type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={`glass-button glass-tile tile ${className}`} />
}

type Backdrop = { acrylic: boolean; transparencyAllowed: boolean }

export function useGlassBackdrop(enabled: boolean) {
  const [backdrop, setBackdrop] = useState<Backdrop>({ acrylic: false, transparencyAllowed: !desktop })
  const [reduce, setReduce] = useState(() => window.matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active)').matches)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active)')
    const update = () => setReduce(query.matches)
    query.addEventListener('change', update)
    if (!desktop) return () => query.removeEventListener('change', update)
    const events = listen<Backdrop>('island-glass', ({ payload }) => setBackdrop(payload))
    return () => {
      query.removeEventListener('change', update)
      void events.then(unlisten => unlisten()).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!desktop) return
    let mounted = true
    void native<Backdrop>('set_glass', { enabled: enabled && !reduce }).then(result => {
      if (mounted) setBackdrop(result)
    }).catch(() => {
      if (mounted) setBackdrop({ acrylic: false, transparencyAllowed: false })
    })
    return () => { mounted = false }
  }, [enabled, reduce])

  const available = !reduce && backdrop.transparencyAllowed
  return { available, translucent: enabled && available && (!desktop || backdrop.acrylic) }
}
