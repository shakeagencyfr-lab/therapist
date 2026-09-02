import { useState, type CSSProperties } from 'react'
import { Button, Card, FieldLabel, Notice, Overline, TextInput, Title } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { useMaybeCabinet } from '@/cabinet/context'
import { BRAND_PRESETS } from '@/data/reseller'
import { adresseCabinet } from '@/lib/domaine'
import type { CabinetBranding } from '@/types/reseller'
import s from './MarqueView.module.css'

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
const ORIGINE: CabinetBranding = {
  accent: '#A17A45',
  accentHover: '#856239',
  accentDeep: '#6E5230',
  dark: '#33291C',
  logo: 'CB',
}

/** Le brouillon en cours d'édition. */
interface Fiche {
  nom: string
  surTitre: string
  branding: CabinetBranding
}

function memeFiche(a: Fiche, b: Fiche): boolean {
  return (
    a.nom === b.nom &&
    a.surTitre === b.surTitre &&
    a.branding.accent === b.branding.accent &&
    a.branding.accentHover === b.branding.accentHover &&
    a.branding.accentDeep === b.branding.accentDeep &&
    a.branding.dark === b.branding.dark &&
    a.branding.logo === b.branding.logo
  )
}

/**
 * La marque du cabinet, réglée par la praticienne.
 *
 * Le revendeur a le même écran pour tous ses cabinets ; celui-ci ne montre
 * que le sien, et lui retire le sous-domaine — c'est l'adresse publique du
 * cabinet, elle se change chez le revendeur.
 *
 * L'édition se fait sur un brouillon : l'aperçu suit la frappe, la base n'est
 * touchée qu'à la publication. Après quoi le contexte est relu, et l'en-tête
 * de la page prend immédiatement les nouvelles couleurs.
 */
export function MarqueView() {
  const auth = useMaybeAuth()
  const cabinet = useMaybeCabinet()
  const identite = auth?.context?.cabinet ?? null

  const publie: Fiche = {
    nom: identite?.name ?? 'Votre cabinet',
    surTitre: identite?.tagline ?? 'Espace thérapie',
    branding: { ...ORIGINE, ...(identite?.branding ?? {}) },
  }

  return (
    <div className={s.wrap}>
      <div className={s.crumb}>
        <Overline>Réglages du cabinet</Overline>
      </div>
      <h1 className={s.h1}>Votre marque</h1>
      <p className={s.intro}>
        Le nom, les initiales et les couleurs de votre cabinet. Ils habillent votre espace et
        l'application de vos patientes. Le reste de l'interface — fonds, bordures, typographie —
        ne bouge pas : c'est ce qui garde les écrans lisibles.
      </p>

      {!identite || !cabinet?.reel ? (
        <Card>
          <p className={s.muted}>
            Démonstration. Connectez-vous à votre cabinet pour régler votre marque.
          </p>
        </Card>
      ) : (
        <Editeur key={identite.id} publie={publie} slug={identite.slug} />
      )}
    </div>
  )
}

function Editeur({ publie, slug }: { publie: Fiche; slug: string }) {
  const auth = useMaybeAuth()
  const cabinet = useMaybeCabinet()
  const [draft, setDraft] = useState<Fiche>(publie)
  const [publication, setPublication] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const branding = draft.branding
  const modifie = !memeFiche(draft, publie)

  function patch(next: Partial<CabinetBranding>, extra?: Partial<Omit<Fiche, 'branding'>>) {
    setDraft((prev) => ({ ...prev, ...extra, branding: { ...prev.branding, ...next } }))
    setNotice(null)
  }

  /** L'accent choisi donne ses deux variantes : survol et lien appuyé. */
  function setAccent(accent: string) {
    patch({ accent, accentHover: shade(accent, 0.84), accentDeep: shade(accent, 0.7) })
  }

  async function publier() {
    if (!cabinet || publication) return
    setPublication(true)
    setNotice(null)
    const r = await cabinet.enregistrerMarque({
      nom: draft.nom,
      surTitre: draft.surTitre,
      branding: draft.branding,
    })
    // L'en-tête lit la marque dans le contexte du compte : sans relecture, il
    // garderait l'ancienne jusqu'au prochain chargement de la page.
    if (r.ok) await auth?.rafraichir()
    setPublication(false)
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.message })
  }

  return (
    <div className={s.grid}>
      <Card className={s.panel}>
        <Title large as="h2">
          Votre identité
        </Title>

        <div className={s.field}>
          <FieldLabel>Nom affiché</FieldLabel>
          <TextInput value={draft.nom} onChange={(e) => patch({}, { nom: e.target.value })} />
          <span className={s.hint}>En haut de votre espace, et en haut de celui de vos patientes.</span>
        </div>

        <div className={s.field}>
          <FieldLabel>Sur-titre</FieldLabel>
          <TextInput
            value={draft.surTitre}
            onChange={(e) => patch({}, { surTitre: e.target.value })}
            placeholder="Espace thérapie"
          />
        </div>

        <div className={s.field}>
          <FieldLabel>Initiales</FieldLabel>
          <TextInput
            value={branding.logo}
            maxLength={3}
            onChange={(e) => patch({ logo: e.target.value.toUpperCase() })}
          />
          <span className={s.hint}>Deux ou trois lettres, en attendant votre vrai logo.</span>
        </div>

        <div className={s.field}>
          <FieldLabel>Adresse de votre espace</FieldLabel>
          <div className={s.readonly}>{adresseCabinet(slug)}</div>
          <span className={s.hint}>
            Fixée par votre revendeur : c'est l'adresse publique de votre cabinet.
          </span>
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

        {notice ? (
          <div className={s.noticeSlot}>
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </div>
        ) : null}

        {modifie ? (
          <p className={s.hint} style={{ margin: '0 0 10px' }}>
            Modifications non publiées : l'aperçu les montre, vos patientes pas encore.
          </p>
        ) : null}

        <div className={s.actions}>
          <Button variant="primary" disabled={publication || !modifie} onClick={() => void publier()}>
            {publication ? 'Publication…' : 'Publier ma marque'}
          </Button>
          <Button variant="ghost" disabled={publication} onClick={() => patch(ORIGINE)}>
            Revenir aux couleurs d'origine
          </Button>
        </div>
      </Card>

      {/* L'aperçu montre les deux endroits où la marque se voit vraiment :
          l'en-tête de l'espace, et le téléphone de la patiente. */}
      <section className={s.apercu}>
        <div className={s.preview}>
          <div className={s.previewHead}>
            <div className={s.previewLogo} style={{ background: branding.accent }}>
              {branding.logo}
            </div>
            <div>
              <div className={s.previewName}>{draft.nom || 'Nom du cabinet'}</div>
              <div className={s.previewTagline}>{draft.surTitre}</div>
            </div>
          </div>
          <div className={s.previewBody}>
            <span className={s.previewPrimary} style={{ background: branding.accent }}>
              Ajouter un module
            </span>
            <span className={s.previewSecondary}>Note de séance</span>
          </div>
        </div>

        <div className={s.phone} style={{ '--marque': branding.accent } as CSSProperties}>
          <div className={s.phoneHead} style={{ background: branding.dark }}>
            <div className={s.phoneName}>{draft.nom || 'Nom du cabinet'}</div>
            <div className={s.phoneDay}>Votre journée</div>
          </div>
          <div className={s.phoneBody}>
            <div className={s.phoneRow}>
              <span className={s.phoneCheck} style={{ borderColor: branding.accent }} aria-hidden />
              <span>Écouter l'ancrage du matin</span>
            </div>
            <div className={s.phoneRow}>
              <span
                className={s.phoneCheck}
                style={{ background: branding.accent, borderColor: branding.accent }}
                aria-hidden
              />
              <span>Noter où en est l'envie</span>
            </div>
            <div className={s.phoneLink} style={{ color: branding.accent }}>
              Ouvrir mon journal
            </div>
          </div>
        </div>
        <p className={s.muted}>
          Aperçu à contenus fictifs. Ni patiente, ni dossier : la marque se juge sur les couleurs.
        </p>
      </section>
    </div>
  )
}
