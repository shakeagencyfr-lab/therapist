import { useEffect, useState, type FormEvent } from 'react'
import { messageEnvoiLien } from '@/lib/messageAuth'
import { supabase } from '@/lib/supabase'
import { captchaConfigure, useCaptcha } from '@/auth/Captcha'
import { variablesDeMarque } from '@/lib/couleurs'
import { cheminEspacePatient } from '@/lib/domaine'
import { lireVitrine, slugEmbed, type Vitrine } from '@/lib/vitrine'
import s from './EmbedSignIn.module.css'

/**
 * Où mène le lien reçu : l'espace du patient, À LA PORTE DE SON CABINET.
 *
 * `/mon` tout court perdait le cabinet en chemin : le patient qui venait de
 * s'inscrire depuis le site de sa thérapeute, à ses couleurs, ouvrait son
 * lien sur une porte aux couleurs de Klaro — et c'est cette adresse-là que
 * son téléphone installait. `/son-identifiant/mon` ouvre le même espace,
 * avec la marque du cabinet.
 */
function destination(slug: string | null): string {
  return `${window.location.origin}${cheminEspacePatient(slug ?? '')}`
}

/**
 * Le widget que la thérapeute pose sur son propre site.
 *
 * Une seule chose à faire : entrer son adresse, recevoir son lien. Rien de
 * l'application n'est monté ici — ni dossier, ni session ouverte, ni le code
 * de l'espace cabinet. C'est ce qui permet à cette page d'être encadrée par
 * un site tiers alors que le reste de Klaro ne l'est pas : encadrer une
 * application connectée, c'est offrir ses clics à qui l'encadre.
 *
 * Le lien de connexion, lui, ouvre l'espace en pleine page. Il arrive par
 * courriel : le patient le lira sur son téléphone, pas dans le cadre.
 */
export function EmbedSignIn() {
  const slug = typeof window === 'undefined' ? null : slugEmbed(window.location.pathname)
  const [vitrine, setVitrine] = useState<Vitrine | null>(null)
  const [chargement, setChargement] = useState(true)
  const [email, setEmail] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [envoye, setEnvoye] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    if (!slug) {
      setChargement(false)
      return
    }
    let vivant = true
    void lireVitrine(slug).then((v) => {
      if (!vivant) return
      setVitrine(v)
      setChargement(false)
    })
    return () => {
      vivant = false
    }
  }, [slug])

  const captcha = useCaptcha()

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    const db = supabase()
    if (!db || !email.includes('@') || envoi) return
    setEnvoi(true)
    setErreur('')
    const { error } = await db.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Seulement un identifiant qui désigne bien un cabinet : sinon, `/mon`.
        emailRedirectTo: destination(vitrine ? slug : null),
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

  const b = vitrine?.branding
  /* Validées avant de devenir des variables : sur le site d'une thérapeute,
     une couleur mal formée rendrait le seul bouton du cadre transparent. */
  const couleurs = variablesDeMarque(b)

  if (chargement) return <div className={s.carte} />

  return (
    <div className={s.carte} style={couleurs}>
      <div className={s.marque}>
        {b?.logoUrl ? (
          <img className={s.logoImage} src={b.logoUrl} alt="" />
        ) : (
          <div className={s.logo}>{b?.logo ?? 'KL'}</div>
        )}
        <div>
          <div className={s.nom}>{vitrine?.name ?? 'Votre espace'}</div>
          <div className={s.surTitre}>{vitrine?.tagline || 'Suivi entre les séances'}</div>
        </div>
      </div>

      {envoye ? (
        <>
          <p className={s.texte}>
            Le lien est parti vers <strong>{envoye}</strong>.
          </p>
          <p className={s.aide}>
            Ouvrez-le depuis votre téléphone : il vous connectera directement. Il est valable une
            heure, et ne fonctionne qu'une fois.
          </p>
        </>
      ) : (
        <>
          <p className={s.texte}>
            Entrez l'adresse que connaît votre thérapeute : vous recevrez un lien qui vous connecte,
            sans mot de passe à retenir.
          </p>
          <form className={s.form} onSubmit={soumettre}>
            <input
              className={s.champ}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              aria-label="Votre adresse électronique"
            />
            <button
              className={s.bouton}
              type="submit"
              disabled={envoi || !email.includes('@') || (captchaConfigure() && !captcha.jeton)}
            >
              {envoi ? 'Envoi…' : 'Recevoir mon lien'}
            </button>
          </form>
          {captcha.widget}
          {erreur ? <p className={s.erreur}>{erreur}</p> : null}
          <p className={s.aide}>
            Pas encore de fiche à votre nom ? Demandez à votre thérapeute de vous inviter.
          </p>
        </>
      )}
    </div>
  )
}
