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

const reducedTransparency = '(prefers-reduced-transparency: reduce), (forced-colors: active)'

export function useTransparency() {
  const [allowed, setAllowed] = useState(!desktop)
  const [reduce, setReduce] = useState(() => matchMedia(reducedTransparency).matches)

  useEffect(() => {
    const query = matchMedia(reducedTransparency)
    const update = () => setReduce(query.matches)
    query.addEventListener('change', update)
    let mounted = true
    let changed = false
    const events = desktop ? listen<boolean>('island-transparency', ({ payload }) => {
      changed = true
      if (mounted) setAllowed(payload)
    }) : undefined
    void events?.then(() => native<boolean>('transparency_allowed')).then(value => {
      if (mounted && !changed) setAllowed(value)
    }).catch(() => {})
    return () => {
      mounted = false
      query.removeEventListener('change', update)
      void events?.then(unlisten => unlisten()).catch(() => {})
    }
  }, [])

  return !reduce && allowed
}
