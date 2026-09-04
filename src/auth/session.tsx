/**
 * Session et rôle du compte connecté.
 *
 * L'accès se fait par lien magique : pas de mot de passe, donc rien à
 * stocker ni à réinitialiser. Après la connexion, deux appels :
 *   claim_access()  rattache le compte à la fiche ou à l'invitation qui
 *                   l'attendait — se connecter ne donne aucun accès en soi ;
 *   my_context()    dit quel espace ouvrir.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { messageEnvoiLien } from '@/lib/messageAuth'
import { isConfigured, supabase } from '@/lib/supabase'
import type { CabinetBranding } from '@/types/reseller'

export interface CabinetIdentity {
  id: string
  name: string
  slug: string
  tagline: string
  branding: CabinetBranding
  role: string
  display_name: string
}

export interface ResellerIdentity {
  id: string
  name: string
  slug: string
  role: string
}

export interface PatientIdentity {
  id: string
  cabinet_id: string
  display_name: string
  cabinet_name: string
  branding: CabinetBranding
}

export interface AccountContext {
  user_id: string | null
  email: string | null
  reseller: ResellerIdentity | null
  cabinet: CabinetIdentity | null
  patient: PatientIdentity | null
}

export type AuthPhase = 'chargement' | 'deconnecte' | 'connecte' | 'sans-base'

export interface AuthState {
  phase: AuthPhase
  session: Session | null
  context: AccountContext | null
  /** Message d'erreur en français, s'il y a lieu. */
  error: string
  /** Le lien magique vient d'être envoyé à cette adresse. */
  sent: string
  envoyerLien: (email: string, captchaToken?: string) => Promise<void>
  /** Connexion classique, pour qui a posé un mot de passe. */
  connecterParMotDePasse: (email: string, motDePasse: string, captchaToken?: string) => Promise<void>
  /** Pose ou remplace le mot de passe du compte connecté. */
  definirMotDePasse: (motDePasse: string) => Promise<{ ok: boolean; message: string }>
  seDeconnecter: () => Promise<void>
  /**
   * Relit le rôle et la marque du compte connecté.
   *
   * Le contexte est lu une fois à la connexion : il ne bouge pas tout seul.
   * Quand l'écran vient de changer ce qu'il contient — la marque du cabinet,
   * par exemple — il faut le redemander, sinon l'en-tête garde l'ancien nom
   * jusqu'au prochain rechargement de la page.
   */
  rafraichir: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * La longueur minimale d'un mot de passe, et le SEUL endroit qui la décide.
 *
 * Elle était écrite trois fois : dix ici, huit dans le placeholder de l'espace
 * patient, huit dans la garde de son bouton. Le patient tapait donc neuf
 * caractères, le bouton s'activait, l'enregistrement était refusé — et le
 * champ était vidé au passage, sans qu'il puisse relire ce qu'il avait mis.
 */
export const LONGUEUR_MOT_DE_PASSE = 10

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>(isConfigured() ? 'chargement' : 'sans-base')
  const [session, setSession] = useState<Session | null>(null)
  const [context, setContext] = useState<AccountContext | null>(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  /** Rattache puis lit le rôle. Les deux vont ensemble. */
  const charger = useCallback(async (): Promise<void> => {
    const db = supabase()
    if (!db) return
    const { error: claimError } = await db.rpc('claim_access')
    if (claimError) {
      // Un rattachement qui échoue n'empêche pas de lire un accès déjà acquis.
      console.warn('[auth] rattachement impossible :', claimError.message)
    }
    const { data, error: ctxError } = await db.rpc('my_context')
    if (ctxError) {
      setError("Impossible de lire votre accès. Réessayez dans un instant.")
      return
    }
    setContext(data as AccountContext)
  }, [])

  useEffect(() => {
    const db = supabase()
    if (!db) return

    let vivant = true

    db.auth.getSession().then(async ({ data }) => {
      if (!vivant) return
      setSession(data.session)
      if (data.session) await charger()
      if (vivant) setPhase(data.session ? 'connecte' : 'deconnecte')
    })

    const { data: sub } = db.auth.onAuthStateChange(async (_event, next) => {
      if (!vivant) return
      setSession(next)
      if (next) {
        await charger()
        setPhase('connecte')
      } else {
        setContext(null)
        setPhase('deconnecte')
      }
    })

    return () => {
      vivant = false
      sub.subscription.unsubscribe()
    }
  }, [charger])

  const envoyerLien = useCallback(async (email: string, captchaToken?: string) => {
    const db = supabase()
    if (!db) {
      setError("L'application n'est pas reliée à sa base de données.")
      return
    }
    setError('')
    const { error: err } = await db.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
        /* Le jeton du CAPTCHA, quand il y en a un. Supabase le vérifie côté
           serveur avec la clé secrète posée dans son tableau de bord ; s'il
           est absent alors que la protection est active, il refuse. */
        captchaToken,
      },
    })
    if (err) {
      setError(messageEnvoiLien(err))
      return
    }
    setSent(email.trim())
  }, [])

  /**
   * La porte de secours.
   *
   * Le lien magique reste la voie normale, et la meilleure : rien à retenir,
   * rien à voler. Mais il dépend du courriel, qui peut mettre du temps,
   * finir dans les indésirables, ou buter sur le quota d'envoi du service —
   * c'est arrivé en production. Une praticienne qui a un patient en face
   * d'elle ne peut pas attendre.
   *
   * Le mot de passe n'est donc jamais imposé : il se pose depuis l'espace,
   * une fois connectée, par qui le souhaite.
   */
  const connecterParMotDePasse = useCallback(async (email: string, motDePasse: string, captchaToken?: string) => {
    const db = supabase()
    if (!db) {
      setError("L'application n'est pas reliée à sa base de données.")
      return
    }
    setError('')
    const { error: err } = await db.auth.signInWithPassword({
      email: email.trim(),
      password: motDePasse,
      options: { captchaToken },
    })
    if (err) {
      // On ne distingue jamais « adresse inconnue » de « mot de passe faux » :
      // ce serait dire à un inconnu quelles adresses existent chez nous.
      setError(
        err.status === 400
          ? "Adresse ou mot de passe incorrect. Vous pouvez aussi demander un lien de connexion."
          : messageEnvoiLien(err),
      )
    }
  }, [])

  const definirMotDePasse = useCallback(
    async (motDePasse: string): Promise<{ ok: boolean; message: string }> => {
      const db = supabase()
      if (!db) return { ok: false, message: "L'application n'est pas reliée à sa base." }
      if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
        return { ok: false, message: 'Choisissez un mot de passe d’au moins dix caractères.' }
      }
      const { error: err } = await db.auth.updateUser({ password: motDePasse })
      if (err) {
        return {
          ok: false,
          message:
            err.message && /weak|password/i.test(err.message)
              ? 'Ce mot de passe est trop faible. Allongez-le, ou mélangez-y des mots sans rapport.'
              : "Le mot de passe n'a pas pu être enregistré. Réessayez.",
        }
      }
      return { ok: true, message: '' }
    },
    [],
  )

  const seDeconnecter = useCallback(async () => {
    await supabase()?.auth.signOut()
    setSent('')
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      phase,
      session,
      context,
      error,
      sent,
      envoyerLien,
      connecterParMotDePasse,
      definirMotDePasse,
      seDeconnecter,
      rafraichir: charger,
    }),
    [
      phase,
      session,
      context,
      error,
      sent,
      envoyerLien,
      connecterParMotDePasse,
      definirMotDePasse,
      seDeconnecter,
      charger,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth doit être utilisé dans <SessionProvider>')
  return value
}

/**
 * La session quand elle existe, null sinon.
 *
 * Certains composants — l'en-tête, par exemple — sont rendus aussi bien dans
 * l'application connectée que dans la démonstration publique et le banc de
 * rendu, qui n'ont pas de fournisseur de session. Ceux-là demandent sans
 * exiger.
 */
export function useMaybeAuth(): AuthState | null {
  return useContext(AuthContext)
}
