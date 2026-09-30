import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Card, FieldLabel, Marque, Notice, Overline, TextInput, Title } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { useMaybeCabinet } from '@/cabinet/context'
import { BRAND_PRESETS } from '@/data/reseller'
import { MarqueBlanche } from './MarqueBlanche'
import {
  adresseCabinet,
  adresseEspacePatient,
  codeEmbed,
  lienCabinet,
  lienEmbed,
  lienEspacePatient,
} from '@/lib/domaine'
import {
  COULEURS_ORIGINE,
  NOM_COULEUR,
  couleurValide,
  couleursInvalides,
  nuance,
} from '@/lib/couleurs'
import { enumeration } from '@/lib/format'
import { effacerDuStockage } from '@/lib/stockage'
import { lireDomaine } from '@/services/cabinet'
import type { CabinetBranding } from '@/types/reseller'
import s from './MarqueView.module.css'

/**
 * La marque d'un cabinet qui n'en a pas encore réglé une : les couleurs
 * livrées, et des initiales de repli pour l'aperçu.
 */
const ORIGINE: CabinetBranding = {
  ...COULEURS_ORIGINE,
  logo: 'CB',
  logoUrl: null,
}

/** Un nom affiché se lit : deux caractères au moins, comme la base l'exige (0048). */
const NOM_MIN = 2

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
    a.branding.logo === b.branding.logo &&
    (a.branding.logoUrl ?? null) === (b.branding.logoUrl ?? null)
  )
}

/**
 * La marque du cabinet, réglée par la praticienne.
 *
 * Le revendeur a le même écran pour tous ses cabinets ; celui-ci ne montre
 * que le sien, et lui retire l'identifiant — c'est l'adresse publique du
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
        l'application de vos patients. Le reste de l'interface — fonds, bordures, typographie —
        ne bouge pas : c'est ce qui garde les écrans lisibles.
      </p>

      {!identite || !cabinet?.reel ? (
        <Card>
          <p className={s.muted}>
            Démonstration. Connectez-vous à votre cabinet pour régler votre marque.
          </p>
        </Card>
      ) : (
        <>
          <Editeur key={identite.id} publie={publie} slug={identite.slug} cabinetId={identite.id} />
          <SurVotreSite slug={identite.slug} />
          <MarqueBlanche key={`mb-${identite.id}`} slug={identite.slug} />
        </>
      )}
    </div>
  )
}

function Editeur({ publie, slug, cabinetId }: { publie: Fiche; slug: string; cabinetId: string }) {
  const auth = useMaybeAuth()
  const cabinet = useMaybeCabinet()
  const [draft, setDraft] = useState<Fiche>(publie)
  const [publication, setPublication] = useState(false)
  const [depot, setDepot] = useState(false)
  const fichier = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const branding = draft.branding
  const modifie = !memeFiche(draft, publie)

  /* CE QUI EMPÊCHE DE PUBLIER, nommé. « Publier » ne se désactivait que
     pendant la publication : un code incomplet (« #A17A4 ») ou un champ
     vidé partait en base et rendait transparents les boutons de l'espace,
     de l'application des patients et du widget. */
  const invalides = couleursInvalides(branding)
  const nomTropCourt = draft.nom.trim().length < NOM_MIN
  const publiable = invalides.length === 0 && !nomTropCourt

  function patch(next: Partial<CabinetBranding>, extra?: Partial<Omit<Fiche, 'branding'>>) {
    setDraft((prev) => ({ ...prev, ...extra, branding: { ...prev.branding, ...next } }))
    setNotice(null)
  }

  /** L'accent choisi donne ses deux variantes : survol et lien appuyé. */
  function setAccent(accent: string) {
    patch({ accent, accentHover: nuance(accent, 0.84), accentDeep: nuance(accent, 0.7) })
  }

  /**
   * Un logo déposé dans le brouillon puis abandonné — remplacé ou retiré
   * avant publication — est effacé tout de suite : il est public dès son
   * dépôt, et rien d'autre ne le référence. Le logo PUBLIÉ, lui, reste
   * jusqu'à la publication suivante : c'est elle qui l'efface, une fois la
   * nouvelle marque en place.
   */
  function abandonnerLogo(url: string | null | undefined) {
    if (url && url !== (publie.branding.logoUrl ?? null)) void effacerDuStockage('logos', url, cabinetId)
  }

  /**
   * Déposer un logo. Le fichier part tout de suite dans le compartiment, mais
   * la marque n'en tient compte qu'à la publication : c'est le brouillon qui
   * change, comme pour une couleur, et l'aperçu le montre avant de s'engager.
   */
  async function deposer(f: File) {
    if (!cabinet || depot) return
    setDepot(true)
    setNotice(null)
    const r = await cabinet.televerserLogo(f)
    setDepot(false)
    if (r.ok && r.url) {
      abandonnerLogo(branding.logoUrl)
      patch({ logoUrl: r.url })
      setNotice({ tone: 'ok', text: r.message })
      return
    }
    setNotice({ tone: 'warn', text: r.message })
  }

  async function publier() {
    if (!cabinet || publication || !publiable) return
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
          <span className={s.hint}>
            {nomTropCourt
              ? 'Le nom doit compter au moins deux caractères : il s’affiche en haut de chaque écran.'
              : 'En haut de votre espace, et en haut de celui de vos patients.'}
          </span>
        </div>

        <div className={s.field}>
          <FieldLabel>Sur-titre</FieldLabel>
          <TextInput
            dictee
            value={draft.surTitre}
            onChange={(e) => patch({}, { surTitre: e.target.value })}
            placeholder="Espace thérapie"
          />
        </div>

        <div className={s.field}>
          <FieldLabel>Logo</FieldLabel>
          <div className={s.logoRow}>
            <Marque className={s.logoApercu} logo={branding.logo} url={branding.logoUrl} />
            <div className={s.logoActions}>
              <input
                ref={fichier}
                type="file"
                className={s.fichier}
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  // Réarmer le champ : redéposer deux fois le même fichier doit
                  // marcher, or un input file ne change pas de valeur.
                  e.target.value = ''
                  if (f) void deposer(f)
                }}
              />
              <Button variant="secondary" disabled={depot} onClick={() => fichier.current?.click()}>
                {depot ? 'Dépôt…' : branding.logoUrl ? 'Remplacer le logo' : 'Choisir un fichier'}
              </Button>
              {branding.logoUrl ? (
                <Button
                  variant="ghost"
                  disabled={depot}
                  onClick={() => {
                    abandonnerLogo(branding.logoUrl)
                    patch({ logoUrl: null })
                  }}
                >
                  Retirer
                </Button>
              ) : null}
            </div>
          </div>
          <span className={s.hint}>PNG, JPEG ou WebP, 1 Mo au plus. Un carré donne le meilleur résultat.</span>
        </div>

        <div className={s.field}>
          <FieldLabel>Initiales</FieldLabel>
          <TextInput
            value={branding.logo}
            maxLength={3}
            onChange={(e) => patch({ logo: e.target.value.toUpperCase() })}
          />
          <span className={s.hint}>
            Affichées tant qu'aucun logo n'est déposé, et si l'image ne charge pas.
          </span>
        </div>

        <div className={s.field}>
          <FieldLabel>Adresse de votre espace</FieldLabel>
          <a className={s.readonly} href={lienCabinet(slug)} target="_blank" rel="noreferrer">
            {adresseCabinet(slug)} ↗
          </a>
          <span className={s.hint}>
            Votre page publique : elle ouvre une présentation à votre nom et à vos couleurs, avant
            même qu'on se connecte. Elle est fixée par votre revendeur.
          </span>
        </div>

        <div className={s.field}>
          <FieldLabel>Adresse de vos patients</FieldLabel>
          <a
            className={s.readonly}
            href={lienEspacePatient(slug)}
            target="_blank"
            rel="noreferrer"
          >
            {adresseEspacePatient(slug)} ↗
          </a>
          <span className={s.hint}>
            Celle-ci ouvre directement leur espace, à votre marque. C'est l'adresse à donner et à
            mettre en favori sur leur téléphone — elle marche aujourd'hui, sans domaine à acheter
            ni réglage à faire.
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
                value={couleurValide(branding.accent) ? branding.accent : COULEURS_ORIGINE.accent}
                onChange={(e) => setAccent(e.target.value.toUpperCase())}
                aria-label="Couleur d'accent"
              />
              <input
                className={s.colorText}
                value={branding.accent}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  if (couleurValide(v)) setAccent(v.toUpperCase())
                  else patch({ accent: v })
                }}
                aria-invalid={!couleurValide(branding.accent)}
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
                value={couleurValide(branding.dark) ? branding.dark : COULEURS_ORIGINE.dark}
                onChange={(e) => patch({ dark: e.target.value.toUpperCase() })}
                aria-label="Couleur sombre"
              />
              <input
                className={s.colorText}
                value={branding.dark}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  patch({ dark: couleurValide(v) ? v.toUpperCase() : v })
                }}
                aria-invalid={!couleurValide(branding.dark)}
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

        {invalides.length ? (
          <p className={s.hint} style={{ margin: '0 0 10px' }} role="alert">
            Pour publier, écrivez {enumeration(invalides.map((c) => NOM_COULEUR[c]))} sous la forme
            #RRGGBB — un dièse et six caractères, par exemple #A17A45.
          </p>
        ) : null}

        {modifie ? (
          <p className={s.hint} style={{ margin: '0 0 10px' }}>
            Modifications non publiées : l'aperçu les montre, vos patients pas encore.
          </p>
        ) : null}

        <div className={s.actions}>
          <Button
            variant="primary"
            disabled={publication || !modifie || !publiable}
            onClick={() => void publier()}
          >
            {publication ? 'Publication…' : 'Publier ma marque'}
          </Button>
          {/* Les COULEURS seulement : le logo et les initiales sont à elle, et
              les remettre à « CB » lui faisait perdre les siens pour avoir
              voulu annuler un essai de teinte. */}
          <Button variant="ghost" disabled={publication} onClick={() => patch(COULEURS_ORIGINE)}>
            Revenir aux couleurs d'origine
          </Button>
        </div>
      </Card>

      {/* L'aperçu montre les deux endroits où la marque se voit vraiment :
          l'en-tête de l'espace, et le téléphone du patient. */}
      <section className={s.apercu}>
        <div className={s.preview}>
          <div className={s.previewHead}>
            <Marque
              className={s.previewLogo}
              style={{ background: branding.accent }}
              logo={branding.logo}
              url={branding.logoUrl}
            />
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
          Aperçu à contenus fictifs. Ni patient, ni dossier : la marque se juge sur les couleurs.
        </p>
      </section>
    </div>
  )
}

/**
 * Le widget à poser sur le site de la thérapeute.
 *
 * Un cadre qui ne contient qu'un champ d'adresse : ses patients entrent la
 * leur et reçoivent leur lien, sans quitter son site. Rien de l'application
 * n'y est monté — c'est ce qui permet à cette page d'être encadrée alors que
 * le reste de l'application ne l'est pas.
 */
function SurVotreSite({ slug }: { slug: string }) {
  /* Le domaine du cabinet, s'il est vérifié et que l'offre le couvre : le
     widget renvoie ses patients sur l'adresse qui l'a servi, et c'est la
     sienne qu'ils doivent voir, pas la nôtre. Faute de le savoir — lecture en
     échec, pas de domaine —, le code reste celui de notre adresse, qui marche
     partout. */
  const [domaine, setDomaine] = useState<string | null>(null)
  useEffect(() => {
    let vivant = true
    lireDomaine()
      .then((e) => {
        if (vivant && e.droit && e.verifie && e.domaine) setDomaine(e.domaine)
      })
      .catch(() => undefined)
    return () => {
      vivant = false
    }
  }, [])

  const code = codeEmbed(slug, domaine)
  const [copie, setCopie] = useState(false)

  async function copier() {
    try {
      await navigator.clipboard.writeText(code)
      setCopie(true)
      window.setTimeout(() => setCopie(false), 2500)
    } catch {
      // Presse-papiers refusé : le code reste sélectionnable à la main.
      setCopie(false)
    }
  }

  return (
    <Card className={`${s.panel} ${s.site}`}>
      <Title large as="h2">
        Sur votre site
      </Title>
      <p className={s.hint} style={{ marginBottom: 14 }}>
        Collez ce code sur votre site : vos patients y entrent leur adresse et reçoivent leur lien
        de connexion, sans quitter votre page. Le cadre porte votre nom et vos couleurs, et se met
        à jour tout seul quand vous les changez.
        {domaine
          ? ` Il vit sur ${domaine} : vos patients restent sur votre adresse du début à la fin. Si vous aviez collé le code avant de poser ce domaine, recollez celui-ci.`
          : ''}
      </p>

      <textarea className={s.code} value={code} readOnly rows={5} spellCheck={false} />

      <div className={s.actions} style={{ marginTop: 12 }}>
        <Button variant="secondary" onClick={() => void copier()}>
          {copie ? 'Copié' : 'Copier le code'}
        </Button>
        <a className={s.lien} href={lienEmbed(slug, domaine)} target="_blank" rel="noreferrer">
          Voir le widget ↗
        </a>
      </div>
    </Card>
  )
}
