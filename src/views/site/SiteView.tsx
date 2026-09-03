import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  FieldLabel,
  Notice,
  Overline,
  TextArea,
  TextInput,
  Title,
} from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { lienCabinet } from '@/lib/domaine'
import { supabase } from '@/lib/supabase'
import {
  chercherFiche,
  enregistrerSite,
  importerFiche,
  lireSite,
  type EtatSite,
  type FicheTrouvee,
  type HoraireSite,
  type PhotoSite,
  type ServiceSite,
  type Site,
} from '@/services/cabinet'
import s from './SiteView.module.css'

/**
 * Le site vitrine du cabinet.
 *
 * Une page d'accueil publique, à l'adresse du cabinet, avec l'accès à
 * l'espace des patientes posé dedans. Elle se remplit en une fois depuis la
 * fiche Google — nom, adresse, horaires, photos, avis — et se corrige
 * ensuite : une fiche Google est souvent incomplète ou datée, et c'est la
 * thérapeute qui sait, pas Google.
 *
 * Rien n'est publié tant qu'elle ne l'a pas décidé. Un brouillon ne se voit
 * pas de l'extérieur, même en connaissant l'adresse.
 */
export function SiteView() {
  const auth = useMaybeAuth()
  const identite = auth?.context?.cabinet ?? null
  const [etat, setEtat] = useState<EtatSite | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [chargement, setChargement] = useState(true)
  const [occupe, setOccupe] = useState('')
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let vivant = true
    lireSite()
      .then((e) => {
        if (!vivant) return
        setEtat(e)
        setSite(e.site)
      })
      .catch((err: Error) => vivant && setErreur(err.message))
      .finally(() => vivant && setChargement(false))
    return () => {
      vivant = false
    }
  }, [])

  function patch(champs: Partial<Site>) {
    setSite((prev) => (prev ? { ...prev, ...champs } : prev))
    setMessage('')
  }

  async function enregistrer(publie?: boolean) {
    if (!site || occupe) return
    setOccupe('enregistrer')
    setErreur('')
    setMessage('')
    try {
      const suite = await enregistrerSite({ ...site, publie: publie ?? site.publie })
      setEtat(suite)
      setSite(suite.site)
      setMessage(
        suite.site.publie
          ? 'Enregistré et en ligne : vos modifications sont visibles à votre adresse publique.'
          : 'Brouillon enregistré. Rien n’est visible de l’extérieur tant que vous ne publiez pas.',
      )
    } catch (err) {
      setErreur((err as Error).message)
    }
    setOccupe('')
  }

  if (chargement) {
    return (
      <div className={s.wrap}>
        <p className={s.muted}>Chargement de votre site…</p>
      </div>
    )
  }

  if (!identite) {
    return (
      <div className={s.wrap}>
        <h1 className={s.h1}>Votre site vitrine</h1>
        <Card>
          <p className={s.muted}>Démonstration. Connectez-vous à votre cabinet pour régler votre site.</p>
        </Card>
      </div>
    )
  }

  if (etat && !etat.droit) {
    return (
      <div className={s.wrap}>
        <div className={s.crumb}>
          <Overline>Réglages du cabinet</Overline>
        </div>
        <h1 className={s.h1}>Votre site vitrine</h1>
        <Card>
          <p className={s.muted}>
            Le site vitrine ne fait pas partie de votre offre{etat.offre ? ` « ${etat.offre} »` : ''}.
            Votre revendeur peut l'ouvrir depuis son espace — vos réglages actuels seront conservés.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className={s.wrap}>
      <div className={s.crumb}>
        <Overline>Réglages du cabinet</Overline>
      </div>
      <h1 className={s.h1}>Votre site vitrine</h1>
      <p className={s.intro}>
        Une page d'accueil publique à votre adresse, avec l'accès à l'espace de vos patientes
        dedans. Remplissez-la depuis votre fiche Google, corrigez ce qui a bougé, publiez.
      </p>

      {erreur ? <Notice tone="warn">{erreur}</Notice> : null}
      {message ? <Notice tone="ok">{message}</Notice> : null}

      {site ? (
        <>
          <ImportGoogle
            possible={etat?.google ?? false}
            importeLe={site.importeLe}
            occupe={occupe}
            setOccupe={setOccupe}
            onImport={(suite) => {
              setEtat(suite)
              setSite(suite.site)
              setMessage('Fiche importée. Relisez : ce qui était déjà écrit chez vous a été gardé.')
            }}
            onErreur={setErreur}
          />

          <Card className={s.panel}>
            <Title large as="h2">
              Le modèle
            </Title>
            <p className={s.hint}>
              Même contenu, trois mises en page. Changer de modèle ne perd rien de ce que vous avez
              écrit.
            </p>
            <div className={s.modeles}>
              {(etat?.modeles ?? []).map((m) => (
                <button
                  key={m.code}
                  type="button"
                  className={site.modele === m.code ? `${s.modele} ${s.modeleOn}` : s.modele}
                  onClick={() => patch({ modele: m.code })}
                  aria-pressed={site.modele === m.code}
                >
                  <span className={s.modeleNom}>{m.label}</span>
                  <span className={s.modeleDetail}>{m.detail}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className={s.panel}>
            <Title large as="h2">
              Ce qu'on lit en arrivant
            </Title>
            <div className={s.field}>
              <FieldLabel>Titre</FieldLabel>
              <TextInput
                value={site.titre}
                onChange={(e) => patch({ titre: e.target.value })}
                placeholder={identite.name}
              />
            </div>
            <div className={s.field}>
              <FieldLabel>Sous-titre</FieldLabel>
              <TextInput
                value={site.sousTitre}
                onChange={(e) => patch({ sousTitre: e.target.value })}
                placeholder="Hypnothérapie et accompagnement du changement"
              />
            </div>
            <div className={s.field}>
              <FieldLabel>Présentation</FieldLabel>
              <TextArea
                rows={6}
                value={site.presentation}
                onChange={(e) => patch({ presentation: e.target.value })}
                placeholder="Qui vous êtes, ce que vous accompagnez, comment se passe une séance."
              />
            </div>
          </Card>

          <Card className={s.panel}>
            <Title large as="h2">
              Vous joindre
            </Title>
            <div className={s.deux}>
              <div className={s.field}>
                <FieldLabel>Adresse</FieldLabel>
                <TextInput value={site.adresse} onChange={(e) => patch({ adresse: e.target.value })} />
              </div>
              <div className={s.field}>
                <FieldLabel>Téléphone</FieldLabel>
                <TextInput value={site.telephone} onChange={(e) => patch({ telephone: e.target.value })} />
              </div>
            </div>
            <div className={s.field}>
              <FieldLabel>Votre site actuel</FieldLabel>
              <TextInput
                value={site.siteWeb}
                onChange={(e) => patch({ siteWeb: e.target.value })}
                placeholder="https://votre-cabinet.fr"
              />
            </div>

            <Horaires horaires={site.horaires} onChange={(horaires) => patch({ horaires })} />
          </Card>

          <Card className={s.panel}>
            <Title large as="h2">
              Ce que vous proposez
            </Title>
            <p className={s.hint}>
              Trois ou quatre lignes suffisent. Ce sont les motifs pour lesquels on vous appelle,
              pas la liste de vos diplômes.
            </p>
            <Services services={site.services} onChange={(services) => patch({ services })} />
          </Card>

          <Photos
            cabinetId={identite.id}
            photos={site.photos}
            onChange={(photos) => patch({ photos })}
            onErreur={setErreur}
          />

          {site.avis.length ? (
            <Card className={s.panel}>
              <Title large as="h2">
                Vos avis
              </Title>
              <p className={s.hint}>
                Repris de votre fiche Google
                {site.googleNote !== null
                  ? ` — ${site.googleNote.toFixed(1).replace('.', ',')} sur 5, ${site.googleAvis ?? 0} avis`
                  : ''}
                . Vous pouvez en retirer, pas en écrire : un avis qu'on rédige soi-même n'est plus
                un avis.
              </p>
              <ul className={s.avis}>
                {site.avis.map((a, i) => (
                  <li key={`${a.auteur}-${i}`} className={s.avisItem}>
                    <div className={s.avisTete}>
                      <span className={s.avisAuteur}>{a.auteur || 'Anonyme'}</span>
                      <span className={s.avisNote}>{'★'.repeat(Math.round(a.note))}</span>
                      <span className={s.avisDate}>{a.date}</span>
                      <button
                        type="button"
                        className={s.retirer}
                        onClick={() => patch({ avis: site.avis.filter((_, j) => j !== i) })}
                      >
                        Retirer
                      </button>
                    </div>
                    <p className={s.avisTexte}>{a.texte}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className={s.panel}>
            <Title large as="h2">
              Publication
            </Title>
            <p className={s.hint}>
              Votre page répondra à {lienCabinet(identite.slug)} — et à votre domaine, si vous en
              avez posé un. L'accès à l'espace de vos patientes y est intégré : elles entrent leur
              adresse, elles reçoivent leur lien.
            </p>
            <div className={s.actions}>
              <Button variant="primary" disabled={occupe !== ''} onClick={() => void enregistrer(true)}>
                {occupe === 'enregistrer' ? 'Enregistrement…' : site.publie ? 'Publier les modifications' : 'Publier'}
              </Button>
              {/* Sur un site déjà en ligne, « enregistrer » publie forcément :
                  promettre le contraire ferait croire à un brouillon. Le
                  bouton ne le dit donc que lorsque c'est vrai. */}
              <Button variant="secondary" disabled={occupe !== ''} onClick={() => void enregistrer()}>
                {site.publie ? 'Enregistrer le brouillon en ligne' : 'Enregistrer sans publier'}
              </Button>
              {site.publie ? (
                <>
                  <a className={s.lien} href={lienCabinet(identite.slug)} target="_blank" rel="noreferrer">
                    Voir ma page ↗
                  </a>
                  <Button variant="ghost" disabled={occupe !== ''} onClick={() => void enregistrer(false)}>
                    Dépublier
                  </Button>
                </>
              ) : null}
            </div>
            {!site.publie ? (
              <p className={s.note}>
                Tant que la page n'est pas publiée, votre adresse continue d'ouvrir directement la
                porte de connexion, comme aujourd'hui.
              </p>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  )
}

/* ---- L'import depuis Google -------------------------------------------- */

function ImportGoogle({
  possible,
  importeLe,
  occupe,
  setOccupe,
  onImport,
  onErreur,
}: {
  possible: boolean
  importeLe: string | null
  occupe: string
  setOccupe: (v: string) => void
  onImport: (etat: EtatSite) => void
  onErreur: (message: string) => void
}) {
  const [requete, setRequete] = useState('')
  const [fiches, setFiches] = useState<FicheTrouvee[] | null>(null)

  async function chercher() {
    if (requete.trim().length < 3 || occupe) return
    setOccupe('chercher')
    onErreur('')
    try {
      setFiches(await chercherFiche(requete))
    } catch (err) {
      onErreur((err as Error).message)
    }
    setOccupe('')
  }

  async function importer(placeId: string) {
    if (occupe) return
    setOccupe('importer')
    onErreur('')
    try {
      onImport(await importerFiche(placeId))
      setFiches(null)
      setRequete('')
    } catch (err) {
      onErreur((err as Error).message)
    }
    setOccupe('')
  }

  return (
    <Card className={s.panel}>
      <Title large as="h2">
        Depuis votre fiche Google
      </Title>
      {possible ? (
        <>
          <p className={s.hint}>
            Cherchez votre cabinet comme une patiente le chercherait : votre nom et votre ville.
            L'import remplit ce qui est vide et ne remplace jamais ce que vous avez écrit.
            {importeLe ? ` Dernier import le ${new Date(importeLe).toLocaleDateString('fr-FR')}.` : ''}
          </p>
          <div className={s.recherche}>
            <TextInput
              value={requete}
              onChange={(e) => setRequete(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void chercher()
              }}
              placeholder="Cabinet Laetitia Ollivier, Nantes"
            />
            <Button
              variant="secondary"
              disabled={requete.trim().length < 3 || occupe !== ''}
              onClick={() => void chercher()}
            >
              {occupe === 'chercher' ? 'Recherche…' : 'Chercher'}
            </Button>
          </div>

          {fiches?.length === 0 ? (
            <p className={s.note}>
              Aucune fiche trouvée. Essayez avec l'adresse exacte, ou remplissez la page à la main :
              tout y est modifiable.
            </p>
          ) : null}

          {fiches?.length ? (
            <ul className={s.fiches}>
              {fiches.map((f) => (
                <li key={f.placeId} className={s.fiche}>
                  <span>
                    <span className={s.ficheNom}>{f.nom}</span>
                    <span className={s.ficheAdresse}>{f.adresse}</span>
                  </span>
                  <span className={s.ficheDroite}>
                    {f.note !== null ? (
                      <span className={s.ficheNote}>
                        {f.note.toFixed(1).replace('.', ',')} ★ · {f.avis ?? 0}
                      </span>
                    ) : null}
                    <Button
                      variant="secondary"
                      disabled={occupe !== ''}
                      onClick={() => void importer(f.placeId)}
                    >
                      {occupe === 'importer' ? 'Import…' : 'Importer'}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className={s.hint}>
          L'import depuis Google n'est pas configuré sur ce serveur. Vous pouvez remplir votre page
          à la main : tout ce qui suit est modifiable, et le résultat est le même.
        </p>
      )}
    </Card>
  )
}

/* ---- Horaires, services, photos ---------------------------------------- */

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function Horaires({
  horaires,
  onChange,
}: {
  horaires: HoraireSite[]
  onChange: (h: HoraireSite[]) => void
}) {
  const lignes = horaires.length ? horaires : JOURS.map((jour) => ({ jour, heures: '' }))
  return (
    <div className={s.bloc}>
      <FieldLabel>Horaires</FieldLabel>
      <div className={s.horaires}>
        {lignes.map((h, i) => (
          <div key={`${h.jour}-${i}`} className={s.horaire}>
            <span className={s.jour}>{h.jour}</span>
            <TextInput
              value={h.heures}
              placeholder="Fermé"
              onChange={(e) =>
                onChange(lignes.map((l, j) => (j === i ? { ...l, heures: e.target.value } : l)))
              }
              aria-label={`Horaires du ${h.jour}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function Services({
  services,
  onChange,
}: {
  services: ServiceSite[]
  onChange: (s: ServiceSite[]) => void
}) {
  return (
    <div className={s.bloc}>
      {services.map((service, i) => (
        <div key={i} className={s.service}>
          <TextInput
            value={service.titre}
            placeholder="Arrêt du tabac"
            onChange={(e) =>
              onChange(services.map((x, j) => (j === i ? { ...x, titre: e.target.value } : x)))
            }
            aria-label={`Titre du service ${i + 1}`}
          />
          <TextArea
            rows={2}
            value={service.texte}
            placeholder="En quoi consiste l'accompagnement, en deux phrases."
            onChange={(e) =>
              onChange(services.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)))
            }
            aria-label={`Description du service ${i + 1}`}
          />
          <button
            type="button"
            className={s.retirer}
            onClick={() => onChange(services.filter((_, j) => j !== i))}
          >
            Retirer
          </button>
        </div>
      ))}
      {services.length < 12 ? (
        <Button variant="ghost" onClick={() => onChange([...services, { titre: '', texte: '' }])}>
          Ajouter
        </Button>
      ) : null}
    </div>
  )
}

function Photos({
  cabinetId,
  photos,
  onChange,
  onErreur,
}: {
  cabinetId: string
  photos: PhotoSite[]
  onChange: (p: PhotoSite[]) => void
  onErreur: (message: string) => void
}) {
  const fichier = useRef<HTMLInputElement>(null)
  const [depot, setDepot] = useState(false)

  /**
   * Déposer une photo.
   *
   * Elle va dans le compartiment public `sites`, rangée par cabinet : les
   * politiques de stockage vérifient que le chemin commence par l'identifiant
   * du cabinet de qui dépose.
   */
  async function deposer(f: File) {
    const db = supabase()
    if (!db || depot) return
    if (f.size > 5_000_000) {
      onErreur('Cette photo dépasse 5 Mo. Réduisez-la et réessayez.')
      return
    }
    setDepot(true)
    onErreur('')
    const extension = (f.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const chemin = `${cabinetId}/site/${crypto.randomUUID()}.${extension}`
    const { error } = await db.storage
      .from('sites')
      .upload(chemin, f, { contentType: f.type || 'image/jpeg', upsert: false })
    setDepot(false)
    if (error) {
      onErreur(
        /mime|type/i.test(error.message)
          ? "Ce format n'est pas accepté : PNG, JPEG ou WebP."
          : "La photo n'a pas pu être déposée. Réessayez.",
      )
      return
    }
    const { data } = db.storage.from('sites').getPublicUrl(chemin)
    onChange([...photos, { url: data.publicUrl, alt: '', attribution: '' }])
  }

  return (
    <Card className={s.panel}>
      <Title large as="h2">
        Vos photos
      </Title>
      <p className={s.hint}>
        Celles de votre fiche Google ont été recopiées ici : les adresses que Google donne
        expirent, les nôtres non. Leur attribution les suit — elle s'affiche sur la page, c'est
        Google qui l'exige et c'est la moindre des choses.
      </p>

      <div className={s.photos}>
        {photos.map((p, i) => (
          <div key={p.url} className={s.photo}>
            <img className={s.vignette} src={p.url} alt={p.alt} loading="lazy" />
            <TextInput
              value={p.alt}
              placeholder="Ce que montre la photo"
              onChange={(e) => onChange(photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
              aria-label={`Description de la photo ${i + 1}`}
            />
            {p.attribution ? <span className={s.attribution}>{p.attribution}</span> : null}
            <button
              type="button"
              className={s.retirer}
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
            >
              Retirer
            </button>
          </div>
        ))}
      </div>

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
      <div className={s.actions}>
        <Button variant="secondary" disabled={depot} onClick={() => fichier.current?.click()}>
          {depot ? 'Dépôt…' : 'Ajouter une photo'}
        </Button>
      </div>
    </Card>
  )
}
