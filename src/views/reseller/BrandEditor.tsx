import { Button, Chip, FieldLabel, Notice, TextInput } from '@/components/ui'
import { BRAND_PRESETS } from '@/data/reseller'
import { cabinetById, portfolio, slugify } from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import type { CabinetBranding } from '@/types/reseller'
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

export function BrandEditor() {
  const { state, set } = useStore()
  const rows = portfolio(state)
  const cabinet = cabinetById(state, state.rSel)
  const branding = cabinet.branding

  /** Applique un correctif de marque au cabinet ouvert. */
  function patch(next: Partial<CabinetBranding>, extra?: Partial<{ name: string; slug: string; tagline: string }>) {
    set((prev) => ({
      rCabinets: prev.rCabinets.map((c) =>
        c.id === cabinet.id
          ? { ...c, ...extra, branding: { ...c.branding, ...next } }
          : c,
      ),
      rNotice: '',
    }))
  }

  /** L'accent choisi donne ses deux variantes : survol et lien appuyé. */
  function setAccent(accent: string) {
    patch({
      accent,
      accentHover: shade(accent, 0.84),
      accentDeep: shade(accent, 0.7),
    })
  }

  return (
    <div className={s.grid}>
      <section className={s.panel}>
        <h2 className={s.panelTitle}>{cabinet.name}</h2>
        <p className={s.panelSub}>
          {cabinet.therapist} · {cabinet.since}
        </p>

        <div className={s.field}>
          <FieldLabel>Cabinet à régler</FieldLabel>
          <div className={s.presets}>
            {rows.map((row) => (
              <Chip
                key={row.cabinet.id}
                on={row.cabinet.id === cabinet.id}
                onClick={() => set({ rSel: row.cabinet.id, rNotice: '' })}
              >
                <span className={s.swatch} style={{ background: row.cabinet.branding.accent }} aria-hidden />
                {row.cabinet.name}
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
          <FieldLabel>Sous-domaine</FieldLabel>
          <TextInput
            value={cabinet.slug}
            onChange={(e) => patch({}, { slug: slugify(e.target.value) })}
          />
          <p className={s.panelSub} style={{ margin: '6px 0 0' }}>
            {cabinet.slug || 'sous-domaine'}.entre-seances.fr
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

        <div className={s.actions}>
          <Button
            variant="primary"
            onClick={() =>
              set({
                rNotice: `La marque de ${cabinet.name} est publiée. Elle s'applique à l'espace de la thérapeute et à l'application de ses patients.`,
              })
            }
          >
            Publier la marque
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              patch({
                accent: '#A17A45',
                accentHover: '#856239',
                accentDeep: '#6E5230',
                dark: '#33291C',
              })
            }
          >
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
              <span className={`${s.previewTab} ${s.previewTabOn}`}>Vue thérapeute</span>
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
