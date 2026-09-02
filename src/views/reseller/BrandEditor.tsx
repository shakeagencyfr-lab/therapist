import { useState } from 'react'
import { Button, Chip, FieldLabel, Notice, TextInput } from '@/components/ui'
import { BRAND_PRESETS } from '@/data/reseller'
import { adresseCabinet } from '@/lib/domaine'
import { useResellerData } from '@/reseller/context'
import { slugify } from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import type { Cabinet, CabinetBranding, PortfolioRow } from '@/types/reseller'
import s from './BrandEditor.module.css'

/** Éclaircit ou assombrit une couleur hexadécimale d'un facteur donné. */
function shade(hex: string, factor: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const parts = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16))
  return `#${parts
    .map((v) => Math.max(0, Math.min(255, Math.round(v * factor))))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Les couleurs livrées avec un cabinet neuf. */
const ORIGINE = {
  accent: '#A17A45',
  accentHover: '#856239',
  accentDeep: '#6E5230',
  dark: '#33291C',
}

/** Ce qui s'édite ici, et qui part tel quel à `enregistrerMarque`. */
interface Fiche {
  name: string
  slug: string
  tagline: string
  branding: CabinetBranding
}

function ficheDe(cabinet: Cabinet): Fiche {
  return {
    name: cabinet.name,
    slug: cabinet.slug,
    tagline: cabinet.tagline,
    branding: { ...cabinet.branding },
  }
}

/** Vrai quand le brouillon dit exactement ce qui est déjà publié. */
function memeFiche(a: Fiche, b: Fiche): boolean {
  return (
    a.name === b.name &&
    a.slug === b.slug &&
    a.tagline === b.tagline &&
    a.branding.accent === b.branding.accent &&
    a.branding.accentHover === b.branding.accentHover &&
    a.branding.accentDeep === b.branding.accentDeep &&
    a.branding.dark === b.branding.dark &&
    a.branding.logo === b.branding.logo
  )
}

export function BrandEditor() {
  const { rows, chargement, erreur } = useResellerData()
  const { state } = useStore()
  const row = rows.find((r) => r.cabinet.id === state.rSel) ?? rows[0]

  return (
    <>
      {chargement ? <p className={s.hint}>Chargement de vos cabinets…</p> : null}
      {erreur ? (
        <Notice tone="warn" style={{ marginBottom: 14 }}>
          {erreur}
        </Notice>
      ) : null}
      {row ? (
        /* Changer de cabinet repart de sa fiche publiée : la clé jette le
           brouillon du précédent plutôt que de le traîner d'un cabinet à
           l'autre. */
        <Editeur key={row.cabinet.id} row={row} />
      ) : chargement || erreur ? null : (
        <p className={s.hint}>Aucun cabinet à régler pour le moment.</p>
      )}
    </>
  )
}

/**
 * L'édition se fait sur un brouillon local : l'aperçu suit la frappe, la base
 * n'est touchée qu'à la publication.
 */
function Editeur({ row }: { row: PortfolioRow }) {
  const { rows, reel, enregistrerMarque } = useResellerData()
  const { state, set } = useStore()
  const publie = ficheDe(row.cabinet)
  const [draft, setDraft] = useState<Fiche>(publie)
  const [publication, setPublication] = useState(false)
  const [echec, setEchec] = useState('')
  const cabinet = draft
  const branding = draft.branding
  const modifie = !memeFiche(draft, publie)

  /** Applique un correctif de marque au brouillon ouvert. */
  function patch(next: Partial<CabinetBranding>, extra?: Partial<{ name: string; slug: string; tagline: string }>) {
    setDraft((prev) => ({ ...prev, ...extra, branding: { ...prev.branding, ...next } }))
    setEchec('')
    if (state.rNotice) set({ rNotice: '' })
  }

  /** L'accent choisi donne ses deux variantes : survol et lien appuyé. */
  function setAccent(accent: string) {
    patch({
      accent,
      accentHover: shade(accent, 0.84),
      accentDeep: shade(accent, 0.7),
    })
  }

  async function publier() {
    if (publication) return
    setPublication(true)
    setEchec('')
    // La réussite précédente ne doit pas rester affichée à côté d'un échec.
    if (state.rNotice) set({ rNotice: '' })
    const res = await enregistrerMarque(row.cabinet.id, {
      name: draft.name,
      slug: draft.slug,
      tagline: draft.tagline,
      branding: draft.branding,
    })
    setPublication(false)
    if (res.ok) set({ rNotice: res.message })
    else setEchec(res.message)
  }

  return (
    <div className={s.grid}>
      <section className={s.panel}>
        <h2 className={s.panelTitle}>{row.cabinet.name}</h2>
        <p className={s.panelSub}>
          {row.cabinet.therapist} · {row.cabinet.since}
        </p>

        {!reel ? (
          <p className={s.hint}>
            Démonstration : ces cabinets sont fictifs. Connectez-vous pour régler la marque des vôtres.
          </p>
        ) : null}

        <div className={s.field}>
          <FieldLabel>Cabinet à régler</FieldLabel>
          <div className={s.presets}>
            {rows.map((r) => (
              <Chip
                key={r.cabinet.id}
                on={r.cabinet.id === row.cabinet.id}
                onClick={() => set({ rSel: r.cabinet.id, rNotice: '' })}
              >
                <span className={s.swatch} style={{ background: r.cabinet.branding.accent }} aria-hidden />
                {r.cabinet.name}
              </Chip>
            ))}
          </div>
        </div>

        <div className={s.field}>
          <FieldLabel>Nom affiché</FieldLabel>
          <TextInput
            value={cabinet.name}
            onChange={(e) => patch({}, { name: e.target.value })}
          />
        </div>

        <div className={s.field}>
          <FieldLabel>Sur-titre</FieldLabel>
          <TextInput
            value={cabinet.tagline}
            onChange={(e) => patch({}, { tagline: e.target.value })}
          />
        </div>

        <div className={s.field}>
          <FieldLabel>Identifiant du cabinet</FieldLabel>
          <TextInput
            value={cabinet.slug}
            onChange={(e) => patch({}, { slug: slugify(e.target.value) })}
          />
          <p className={s.panelSub} style={{ margin: '6px 0 0' }}>
            {adresseCabinet(cabinet.slug || 'identifiant')}
          </p>
        </div>

        <div className={s.field}>
          <FieldLabel>Logo</FieldLabel>
          <TextInput
            value={branding.logo}
            maxLength={3}
            onChange={(e) => patch({ logo: e.target.value.toUpperCase() })}
          />
          <p className={s.panelSub} style={{ margin: '6px 0 0' }}>
            Deux ou trois initiales, en attendant le vrai logo du cabinet.
          </p>
        </div>

        <FieldLabel>Palettes</FieldLabel>
        <div className={s.presets}>
          {BRAND_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={preset.accent === branding.accent ? `${s.preset} ${s.presetOn}` : s.preset}
              aria-pressed={preset.accent === branding.accent}
              onClick={() =>
                patch({
                  accent: preset.accent,
                  accentHover: preset.accentHover,
                  accentDeep: preset.accentDeep,
                  dark: preset.dark,
                })
              }
            >
              <span className={s.swatch} style={{ background: preset.accent }} aria-hidden />
              {preset.label}
            </button>
          ))}
        </div>

        <div className={s.colors}>
          <div>
            <FieldLabel>Accent</FieldLabel>
            <div className={s.colorField}>
              <input
                type="color"
                className={s.colorInput}
                value={branding.accent}
                onChange={(e) => setAccent(e.target.value.toUpperCase())}
                aria-label="Couleur d'accent"
              />
              <input
                className={s.colorText}
                value={branding.accent}
                onChange={(e) => {
                  const v = e.target.value
                  patch({ accent: v })
                  if (HEX.test(v)) setAccent(v.toUpperCase())
                }}
                aria-label="Code hexadécimal de l'accent"
              />
            </div>
          </div>
          <div>
            <FieldLabel>Sombre</FieldLabel>
            <div className={s.colorField}>
              <input
                type="color"
                className={s.colorInput}
                value={branding.dark}
                onChange={(e) => patch({ dark: e.target.value.toUpperCase() })}
                aria-label="Couleur sombre"
              />
              <input
                className={s.colorText}
                value={branding.dark}
                onChange={(e) => patch({ dark: e.target.value })}
                aria-label="Code hexadécimal du sombre"
              />
            </div>
          </div>
        </div>

        {state.rNotice ? (
          <Notice tone="ok" style={{ marginBottom: 14 }}>
            {state.rNotice}
          </Notice>
        ) : null}

        {echec ? (
          <Notice tone="warn" style={{ marginBottom: 14 }}>
            {echec}
          </Notice>
        ) : null}

        {modifie ? (
          <p className={s.hint} style={{ margin: '0 0 10px' }}>
            Modifications non publiées : l'aperçu les montre, l'espace du cabinet pas encore.
          </p>
        ) : null}

        <div className={s.actions}>
          <Button variant="primary" disabled={publication} onClick={() => void publier()}>
            {publication ? 'Publication…' : 'Publier la marque'}
          </Button>
          <Button variant="ghost" onClick={() => patch(ORIGINE)}>
            Revenir aux couleurs d'origine
          </Button>
        </div>
      </section>

      {/* L'aperçu montre exactement ce que change la marque : l'accent et le
          sombre. Fonds, bordures et typographie ne bougent pas.
          Les contenus sont des marques de réserve, jamais un patient : rien
          d'un dossier n'a sa place dans un écran revendeur, pas même en
          illustration. */}
      <section>
        <div className={s.preview}>
          <div className={s.previewHead}>
            <div className={s.previewBrand}>
              <div className={s.previewLogo} style={{ background: branding.accent }}>
                {branding.logo}
              </div>
              <div>
                <div className={s.previewName}>{cabinet.name || 'Nom du cabinet'}</div>
                <div className={s.previewTagline}>{cabinet.tagline}</div>
              </div>
            </div>
            <div className={s.previewTabs} aria-hidden>
              <span className={`${s.previewTab} ${s.previewTabOn}`}>Tableau d&apos;évolution</span>
              <span className={s.previewTab}>Séance</span>
              <span className={s.previewTab}>Audios</span>
            </div>
          </div>

          <div className={s.previewBody}>
            <div>
              <h3 className={s.previewH1}>Prénom N.</h3>
              <div className={s.previewPills}>
                <span
                  className={s.previewPill}
                  style={{ background: branding.accent + '26', color: branding.accent }}
                >
                  Programme
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--c-text-muted)' }}>
                  Semaine 3 sur 6 · aperçu, contenus fictifs
                </span>
              </div>
            </div>

            <div className={s.previewCard}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>Profil psychologique</div>
              <div className={s.previewAxis}>
                <div className={s.previewAxisHead}>
                  <span style={{ fontWeight: 500 }}>Premier axe du profil</span>
                  <span style={{ color: 'var(--c-text-muted)' }}>± 17 points</span>
                </div>
                <div className={s.previewTrack}>
                  <div className={s.previewBand} style={{ left: '61%', width: '34%' }} />
                  <div className={s.previewMark} style={{ left: '78%', background: branding.accent }} />
                </div>
              </div>
            </div>

            <div className={s.previewButtons}>
              <span className={s.previewPrimary} style={{ background: branding.accent }}>
                Ajouter un module
              </span>
              <span className={s.previewSecondary}>Note de séance</span>
            </div>

            <div className={s.previewDark} style={{ background: branding.dark }}>
              <div>
                <div className={s.previewDarkTitle}>Envoyer au patient</div>
                <div className={s.previewDarkText}>Trois modules et deux audios</div>
              </div>
              <span
                className={s.previewPrimary}
                style={{ background: branding.accent, whiteSpace: 'nowrap' }}
              >
                Envoyer
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
