import type { ReactNode } from 'react'
import s from './PhoneFrame.module.css'

/**
 * Cadre du téléphone : 390 × 844, rayon 38, cadre sombre et ombre douce —
 * la seule ombre portée de l'interface (voir README, « Ombres »).
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className={s.frame}>
      <div className={s.screen}>
        <div className={s.status}>
          <span className={s.time}>9:41</span>
          <span className={s.notch} aria-hidden />
          <span className={s.icons} aria-hidden>
            <span className={s.battery} />
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
