import { useRef, useState } from 'react'
import HCaptcha from '@hcaptcha/react-hcaptcha'

/**
 * Le CAPTCHA de la porte d'entrée.
 *
 * IL NE S'AFFICHE QUE S'IL EST CONFIGURÉ. Sans `VITE_HCAPTCHA_SITE_KEY`, ce
 * composant ne rend rien et la connexion fonctionne comme avant : c'est une
 * protection qu'on active le jour où on en a besoin, pas une dépendance de
 * plus à porter dès le premier jour.
 *
 * POURQUOI hCaptcha. Supabase n'en vérifie que deux : hCaptcha et Cloudflare
 * Turnstile. Le second suppose un compte Cloudflare ; le premier s'ouvre en
 * cinq minutes sans rien d'autre. C'est le seul motif du choix — la clé
 * secrète se pose au même endroit dans les deux cas, et le code appelant ne
 * voit aucune différence.
 *
 * LA CLÉ DE SITE EST PUBLIQUE, PAR CONSTRUCTION — elle est lue par le
 * navigateur de chaque visiteur, c'est son rôle. Le préfixe `VITE_` est donc
 * correct ici, et il l'est SEULEMENT ici : la clé SECRÈTE, elle, se pose dans
 * le tableau de bord Supabase, qui vérifie le jeton côté serveur. Elle
 * n'entre jamais dans ce dépôt.
 *
 * CE QUE ÇA PROTÈGE, ET CE QUE ÇA NE PROTÈGE PAS. Le formulaire de connexion
 * envoie un courriel à chaque tentative : sans garde, on peut faire partir
 * des milliers de messages depuis notre domaine, épuiser le quota d'envoi —
 * c'est déjà arrivé ici — et se servir de nous pour importuner des adresses.
 * Le CAPTCHA arrête cela. Il n'ajoute rien contre quelqu'un qui possède déjà
 * le lien reçu par courriel : c'est le lien qui ouvre, pas ce formulaire.
 */
// `import.meta.env` n'existe que sous Vite : hors du navigateur — banc de
// rendu, épreuves — il vaut undefined, et le lire directement fait tomber
// tout ce qui importe ce fichier.
const env = import.meta.env ?? {}
const CLE = String(env.VITE_HCAPTCHA_SITE_KEY ?? '').trim()

export function captchaConfigure(): boolean {
  return Boolean(CLE)
}

export interface Captcha {
  /** Le jeton à passer à Supabase, ou undefined si le CAPTCHA est absent. */
  jeton: string | undefined
  /** À rendre dans le formulaire. Ne rend rien si le CAPTCHA n'est pas réglé. */
  widget: React.ReactNode
  /** Après chaque tentative : un jeton ne sert qu'une fois. */
  reinitialiser: () => void
}

export function useCaptcha(): Captcha {
  const [jeton, setJeton] = useState<string | undefined>(undefined)
  /* UN CAPTCHA QUI NE SE CHARGE PAS LAISSAIT LA PORTE FERMÉE, SANS UN MOT.
     Le bouton « Recevoir mon lien » est grisé tant qu'il n'y a pas de jeton :
     réseau d'entreprise qui bloque hcaptcha.com, bloqueur de traceurs, panne
     du service — et l'écran ne montrait qu'un bouton mort et un cadre vide.
     La patiente en conclut que le produit est cassé, ou que son adresse n'est
     pas la bonne. On dit ce qui se passe et ce qu'elle peut faire. */
  const [panne, setPanne] = useState(false)
  const ref = useRef<HCaptcha | null>(null)

  return {
    jeton,
    reinitialiser: () => {
      setJeton(undefined)
      ref.current?.resetCaptcha()
    },
    widget: CLE ? (
      <div style={{ marginTop: 14 }}>
        <HCaptcha
          ref={ref}
          sitekey={CLE}
          languageOverride="fr"
          onVerify={(t) => {
            setPanne(false)
            setJeton(t)
          }}
          onExpire={() => setJeton(undefined)}
          onError={() => {
            setJeton(undefined)
            setPanne(true)
          }}
        />
        {panne ? (
          <p
            role="status"
            style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5, color: 'var(--c-warn-text-2)' }}
          >
            La vérification anti-robot n'a pas pu se charger. Elle est parfois bloquée par un
            réseau d'entreprise ou une extension du navigateur : réessayez depuis votre téléphone,
            en données mobiles, ou demandez le lien à votre thérapeute.
          </p>
        ) : null}
      </div>
    ) : null,
  }
}
