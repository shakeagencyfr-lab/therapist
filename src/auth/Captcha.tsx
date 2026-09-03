import { useRef, useState } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

/**
 * Le CAPTCHA de la porte d'entrée.
 *
 * IL NE S'AFFICHE QUE S'IL EST CONFIGURÉ. Sans `VITE_TURNSTILE_SITE_KEY`, ce
 * composant ne rend rien et la connexion fonctionne comme avant : c'est une
 * protection qu'on active le jour où on en a besoin, pas une dépendance de
 * plus à porter dès le premier jour.
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
const CLE = String(env.VITE_TURNSTILE_SITE_KEY ?? '').trim()

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
  const ref = useRef<TurnstileInstance | null>(null)

  return {
    jeton,
    reinitialiser: () => {
      setJeton(undefined)
      ref.current?.reset()
    },
    widget: CLE ? (
      <div style={{ marginTop: 14 }}>
        <Turnstile
          ref={ref}
          siteKey={CLE}
          options={{ language: 'fr', theme: 'light' }}
          onSuccess={setJeton}
          onExpire={() => setJeton(undefined)}
          onError={() => setJeton(undefined)}
        />
      </div>
    ) : null,
  }
}
