import { useState, type CSSProperties, type FormEvent } from 'react'
import { messageEnvoiLien } from '@/lib/messageAuth'
import { supabase } from '@/lib/supabase'
import { captchaConfigure, useCaptcha } from '@/auth/Captcha'
import type { SiteVitrine } from '@/lib/vitrine'
import { cheminEspacePatient } from '@/lib/domaine'
import { titreDuCabinet, useEnTete } from '@/lib/enTete'
import { pileTexte, pileTitres, policesAcharger, resoudreTheme } from '@/lib/themeVitrine'
import { AvisGoogle } from './AvisGoogle'
import s from './VitrinePage.module.css'

/**
 * La page d'accueil publique d'un cabinet.
 *
 * Elle sert deux personnes à la fois, et c'est tout son intérêt : celle qui
 * cherche une thérapeute et lit la page, et celle qui est déjà suivie et vient
 * seulement ouvrir son espace. La première trouve ce qu'une fiche Google
 * donne, en plus lisible ; la seconde trouve le champ d'adresse, en haut à
 * droite et rappelé en bas.
 *
 * Aucune donnée de santé n'y figure — la fonction qui l'alimente ne rend que
 * ce que la thérapeute a écrit et publié.
 *
 * Trois modèles se partagent ce composant : ils ne changent que la mise en
 * page, jamais les rubriques. Un changement de modèle ne doit rien perdre.
 */
/** Une couleur hexadécimale, ou undefined — jamais la chaîne telle quelle. */
function couleurSure(valeur: string | undefined): string | undefined {
  return valeur && /^#[0-9a-f]{3,8}$/i.test(valeur.trim()) ? valeur.trim() : undefined
}

export function VitrinePage({ site, apercu = false }: { site: SiteVitrine; apercu?: boolean }) {
  const b = site.branding
  /* Le thème est relu par la liste blanche à CHAQUE rendu, et pas seulement
     à l'écriture : ses valeurs deviennent des noms de classe et une
     `font-family` sur une page publique. Une chaîne recopiée telle quelle
     d'ici laisserait écrire du CSS dans la page d'un cabinet. */
  const theme = resoudreTheme(site.theme)
  const polices = policesAcharger(theme)

  /* LES COULEURS SONT VALIDÉES AVANT D'ENTRER DANS UNE VARIABLE CSS.
     Une propriété personnalisée accepte à peu près n'importe quoi, et
     `background: var(--c-accent)` la substitue telle quelle : une valeur du
     genre « red; background-image: url(https://tiers/x) » ferait charger une
     ressource chez un tiers depuis la page publique d'un cabinet. Le reste du
     produit interdit précisément cela. Une couleur hexadécimale, ou rien. */
  const couleurs = {
    '--c-accent': couleurSure(b?.accent),
    '--c-accent-hover': couleurSure(b?.accentHover),
    '--c-accent-deep': couleurSure(b?.accentDeep),
    '--c-dark': couleurSure(b?.dark),
    '--vitrine-titres': pileTitres(theme),
    '--vitrine-texte': pileTexte(theme),
  } as CSSProperties

  /* L'onglet porte le nom du cabinet, jamais le nôtre : sur son domaine, le
     titre est le dernier endroit par lequel le fournisseur se voyait encore.
     Dans l'aperçu de l'éditeur, on n'y touche pas — la thérapeute est dans son
     tableau de bord, pas sur sa page. */
  useEnTete(
    apercu ? '' : titreDuCabinet(site.name, site.titre || site.tagline),
    apercu ? undefined : (site.sous_titre || site.presentation || '').slice(0, 300),
  )

  const modele = ['sobre', 'chaleur', 'clinique'].includes(site.modele) ? site.modele : 'sobre'
  const couverture = site.photos[0] ?? null
  const autres = site.photos.slice(1)
  const joignable = site.adresse || site.telephone || site.horaires.some((h) => h.heures)

  return (
    <div
      className={[
        s.page,
        s[modele],
        s[`fond_${theme.fond}`],
        s[`carte_${theme.carte}`],
        s[`coins_${theme.coins}`],
        theme.anime ? s.anime : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={couleurs}
    >
      {/* Les polices non standard se chargent depuis la page elle-même : le
          document est commun aux trois surfaces, et chaque cabinet n'a pas à
          faire télécharger la police choisie par un autre. Le thème d'origine
          ne demande rien — ses deux polices sont déjà servies. */}
      {polices ? <link rel="stylesheet" href={polices} /> : null}
      <header className={s.entete}>
        <div className={s.marque}>
          {b?.logoUrl ? (
            <img className={s.logoImage} src={b.logoUrl} alt="" />
          ) : (
            <span className={s.logo}>{b?.logo ?? 'KL'}</span>
          )}
          <span className={s.noms}>
            <span className={s.nom}>{site.name}</span>
            <span className={s.surTitre}>{site.tagline || 'Espace thérapie'}</span>
          </span>
        </div>
        <a className={s.acces} href="#espace">
          Accéder à mon espace
        </a>
      </header>

      <section className={s.hero}>
        <div className={s.heroTexte}>
          <h1 className={s.titre}>{site.titre || site.name}</h1>
          {site.sous_titre ? <p className={s.sousTitre}>{site.sous_titre}</p> : null}
          {site.google_note !== null ? (
            <p className={s.note}>
              <span className={s.etoiles} aria-hidden>
                {'★'.repeat(Math.round(site.google_note))}
              </span>
              {site.google_note.toFixed(1).replace('.', ',')} sur 5
              {site.google_avis ? ` · ${site.google_avis} avis Google` : ''}
            </p>
          ) : null}

          <div className={s.heroActions}>
            <a className={s.bouton} href="#espace">
              Ouvrir mon espace
            </a>
            {site.telephone ? (
              <a className={s.lien} href={`tel:${site.telephone.replace(/\s+/g, '')}`}>
                {site.telephone}
              </a>
            ) : null}
          </div>
        </div>
        {couverture ? (
          <figure className={s.couverture}>
            <img src={couverture.url} alt={couverture.alt} />
            {couverture.attribution ? (
              <figcaption className={s.credit}>{couverture.attribution}</figcaption>
            ) : null}
          </figure>
        ) : null}
      </section>

      {site.presentation ? (
        <section className={s.section}>
          <h2 className={s.h2}>À propos</h2>
          {site.presentation.split(/\n{2,}/).map((paragraphe, i) => (
            <p key={i} className={s.texte}>
              {paragraphe}
            </p>
          ))}
        </section>
      ) : null}

      {site.services.length ? (
        <section className={s.section}>
          <h2 className={s.h2}>Ce que j'accompagne</h2>
          <ul className={s.services}>
            {site.services.map((service, i) => (
              <li key={i} className={s.service}>
                <h3 className={s.serviceTitre}>{service.titre}</h3>
                {service.texte ? <p className={s.texte}>{service.texte}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {joignable ? (
        <section className={s.section}>
          <h2 className={s.h2}>Me trouver</h2>
          <div className={s.pratique}>
            <div>
              {site.adresse ? <p className={s.texte}>{site.adresse}</p> : null}
              {site.telephone ? (
                <p className={s.texte}>
                  <a className={s.lien} href={`tel:${site.telephone.replace(/\s+/g, '')}`}>
                    {site.telephone}
                  </a>
                </p>
              ) : null}
              {site.site_web ? (
                <p className={s.texte}>
                  <a className={s.lien} href={site.site_web} target="_blank" rel="noreferrer">
                    {site.site_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </p>
              ) : null}
            </div>
            {site.horaires.some((h) => h.heures) ? (
              <dl className={s.horaires}>
                {site.horaires.map((h, i) => (
                  <div key={`${h.jour}-${i}`} className={s.horaire}>
                    <dt className={s.jour}>{h.jour}</dt>
                    <dd className={s.heures}>{h.heures || 'Fermé'}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>
      ) : null}

      {autres.length ? (
        <section className={`${s.section} ${s.pleine}`}>
          <div className={s.galerie}>
            {autres.map((p) => (
              <figure key={p.url} className={s.photo}>
                <img src={p.url} alt={p.alt} loading="lazy" />
                {p.attribution ? <figcaption className={s.credit}>{p.attribution}</figcaption> : null}
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {site.avis.length ? (
        <section className={s.section}>
          <h2 className={s.h2}>Ce qu'on en dit</h2>
          <AvisGoogle avis={site.avis} note={site.google_note} nombre={site.google_avis} />
        </section>
      ) : null}

      <AccesEspace cabinet={site.name} slug={site.slug} apercu={apercu} />

      <footer className={s.pied}>
        <span>
          © {site.name}
          {site.adresse ? ` · ${site.adresse}` : ''}
        </span>
      </footer>
    </div>
  )
}

/**
 * La porte de l'espace, posée dans la page.
 *
 * Le même geste qu'ailleurs : une adresse, un lien reçu, aucune application
 * montée ici. Tant que personne n'est connecté, cette page ne charge ni
 * dossier ni session.
 */
function AccesEspace({
  cabinet,
  slug,
  apercu,
}: {
  cabinet: string
  slug: string
  apercu?: boolean
}) {
  const [email, setEmail] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [envoye, setEnvoye] = useState('')
  const [erreur, setErreur] = useState('')
  const captcha = useCaptcha()

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    /* Dans l'aperçu, la porte se montre mais ne s'ouvre pas : une thérapeute
       qui règle sa page ne doit pas envoyer un vrai lien de connexion en
       cliquant sur le bouton pour voir à quoi il ressemble. */
    if (apercu) return
    const db = supabase()
    if (!db || !email.includes('@') || envoi) return
    setEnvoi(true)
    setErreur('')
    const { error } = await db.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}${cheminEspacePatient(slug)}`,
        captchaToken: captcha.jeton,
      },
    })
    setEnvoi(false)
    captcha.reinitialiser()
    if (error) {
      setErreur(messageEnvoiLien(error))
      return
    }
    setEnvoye(email.trim())
  }

  return (
    <section className={s.espace} id="espace">
      <h2 className={s.h2}>Votre espace entre les séances</h2>
      {envoye ? (
        <p className={s.texte}>
          Un lien vient de partir vers {envoye}. Ouvrez-le depuis votre téléphone : il vous
          connecte directement, sans mot de passe à retenir.
        </p>
      ) : (
        <>
          <p className={s.texte}>
            Vos exercices de la semaine, vos audios et votre journal. Entrez l'adresse que connaît
            {` ${cabinet}`} : vous recevrez un lien de connexion.
          </p>
          <form className={s.formulaire} onSubmit={soumettre}>
            {/* Dans l'aperçu, le champ se voit mais ne se remplit pas : une
                thérapeute qui tape son adresse pour essayer verrait le bouton
                s'activer, cliquerait, et rien ne se passerait. Un bouton mort
                est plus déroutant qu'un champ qu'on ne peut pas remplir. */}
            <input
              className={s.champ}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@adresse.fr"
              autoComplete="email"
              aria-label="Votre adresse électronique"
              readOnly={apercu}
              tabIndex={apercu ? -1 : undefined}
              required
            />
            <button
              className={s.bouton}
              type="submit"
              disabled={
                apercu ||
                envoi ||
                !email.includes('@') ||
                (captchaConfigure() && !captcha.jeton)
              }
            >
              {envoi ? 'Envoi…' : 'Recevoir mon lien'}
            </button>
          </form>
          {/* La même porte que l'application : la protéger ailleurs et pas
              ici laisserait la seule entrée publique ouverte. */}
          {apercu ? null : captcha.widget}
          {erreur ? <p className={s.erreur}>{erreur}</p> : null}
          <p className={s.mention}>
            Réservé aux personnes suivies par le cabinet. Sans fiche à cette adresse, le lien
            n'ouvre rien.
          </p>
        </>
      )}
    </section>
  )
}
