import { useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode, TextareaHTMLAttributes, InputHTMLAttributes } from 'react'
import s from './ui.module.css'

const cx = (...parts: Array<string | false | undefined | null>) => parts.filter(Boolean).join(' ')

/* Carte ------------------------------------------------------------- */

export function Card({
  children,
  padded = true,
  flush = false,
  className,
  style,
}: {
  children: ReactNode
  /** Padding standard 20/22/18. Mettre à false pour gérer le padding soi-même. */
  padded?: boolean
  /** Contenu à bords perdus (listes séparées par des bordures). */
  flush?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <section
      className={cx(s.card, padded && s.cardPad, flush && s.cardFlush, className)}
      style={style}
    >
      {children}
    </section>
  )
}

export function CardHead({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={s.cardHead} style={style}>
      {children}
    </div>
  )
}

export function Title({
  children,
  large = false,
  as: Tag = 'h2',
  style,
}: {
  children: ReactNode
  large?: boolean
  as?: 'h1' | 'h2' | 'h3'
  style?: CSSProperties
}) {
  return (
    <Tag className={cx(s.title, large && s.titleLg)} style={style}>
      {children}
    </Tag>
  )
}

export function Sub({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p className={s.sub} style={style}>
      {children}
    </p>
  )
}

export function Overline({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className={s.overline} style={style}>
      {children}
    </span>
  )
}

export function Meta({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className={s.meta} style={style}>
      {children}
    </span>
  )
}

/* Boutons ------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  block = false,
  big = false,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  block?: boolean
  big?: boolean
}) {
  return (
    <button
      type="button"
      className={cx(s.btn, s[variant], block && s.block, big && s.big, className)}
      {...rest}
    />
  )
}

/* Pilules et filtres --------------------------------------------------- */

export type PillTone = 'accent' | 'neutral' | 'kind' | 'warn' | 'ok'

export function Pill({
  children,
  tone = 'neutral',
  style,
}: {
  children: ReactNode
  tone?: PillTone
  style?: CSSProperties
}) {
  const tones: Record<PillTone, string> = {
    accent: s.pillAccent,
    neutral: s.pillNeutral,
    kind: s.pillKind,
    warn: s.pillWarn,
    ok: s.pillOk,
  }
  return (
    <span className={cx(s.pill, tones[tone])} style={style}>
      {children}
    </span>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/** Commutateur en pilules (en-tête, bascules de vue). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className={s.segmented}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(s.segment, o.value === value && s.segmentOn)}
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Filtre en pilule bordée (catégories, programmes, situations). */
export function Chip({
  children,
  on = false,
  onClick,
  title,
  style,
}: {
  children: ReactNode
  on?: boolean
  onClick?: () => void
  title?: string
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      className={cx(s.chip, on && s.chipOn)}
      onClick={onClick}
      aria-pressed={on}
      title={title}
      style={style}
    >
      {children}
    </button>
  )
}

/* Cases à cocher -------------------------------------------------------- */

export function RoundCheck({
  on,
  onClick,
  label,
  style,
}: {
  on: boolean
  onClick?: () => void
  label: string
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      className={cx(s.check, s.round, on && s.roundOn)}
      onClick={onClick}
      style={style}
    >
      {on ? '✓' : ''}
    </button>
  )
}

export function SquareCheck({
  on,
  onClick,
  label,
  style,
}: {
  on: boolean
  onClick?: () => void
  label: string
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      className={cx(s.check, s.square, on && s.squareOn)}
      onClick={onClick}
      style={style}
    >
      {on ? '✓' : ''}
    </button>
  )
}

/* Progression et statistiques -------------------------------------------- */

export function ProgressBar({ value, style }: { value: number; style?: CSSProperties }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className={s.track}
      style={style}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={s.fill} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function StatCard({
  label,
  value,
  unit,
  progress,
}: {
  label: string
  value: string | number
  unit?: string
  /** Remplissage de la barre, 0–100. */
  progress: number
}) {
  return (
    <div className={s.stat}>
      <Overline>{label}</Overline>
      <div className={s.statValue}>
        {value}
        {unit ? <span className={s.statUnit}>{unit}</span> : null}
      </div>
      <ProgressBar value={progress} />
    </div>
  )
}

/* États vides et encarts ---------------------------------------------------- */

export function EmptyState({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={s.empty} style={style}>
      {children}
    </div>
  )
}

export type NoticeTone = 'warn' | 'ok' | 'hot'

export function Notice({
  children,
  tone = 'warn',
  style,
}: {
  children: ReactNode
  tone?: NoticeTone
  style?: CSSProperties
}) {
  const tones: Record<NoticeTone, string> = {
    warn: s.noticeWarn,
    ok: s.noticeOk,
    hot: s.noticeHot,
  }
  return (
    <div className={cx(s.notice, tones[tone])} style={style}>
      {children}
    </div>
  )
}

/* Avatar ---------------------------------------------------------------------- */

export function Avatar({
  initials,
  on = false,
  size = 30,
  style,
}: {
  initials: string
  on?: boolean
  size?: number
  style?: CSSProperties
}) {
  return (
    <span
      className={cx(s.avatar, on && s.avatarOn)}
      style={{ width: size, height: size, ...style }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

/* Champs ------------------------------------------------------------------------ */

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className={s.label}>{children}</span>
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(s.input, className)} {...rest} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(s.textarea, className)} {...rest} />
}

/**
 * La marque d'un cabinet : son logo s'il en a déposé un, ses initiales sinon.
 *
 * Le même carré partout — en-tête, page de connexion, aperçu, portefeuille —
 * pour qu'un cabinet se reconnaisse d'un écran à l'autre. L'image couvre le
 * carré sans le déformer ; une image qui ne charge pas laisse les initiales,
 * plutôt qu'un carré vide.
 */
export function Marque({
  logo,
  url,
  className,
  style,
}: {
  logo: string
  url?: string | null
  className?: string
  style?: CSSProperties
}) {
  const [casse, setCasse] = useState(false)
  const image = url && !casse
  return (
    <div className={className} style={image ? { ...style, background: 'none', padding: 0 } : style}>
      {image ? (
        <img className={s.marqueImage} src={url} alt="" onError={() => setCasse(true)} />
      ) : (
        logo
      )}
    </div>
  )
}
