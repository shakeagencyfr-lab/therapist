/**
 * Session et rôle du compte connecté.
 *
 * L'accès se fait par le courriel de connexion — son lien, ou le code à six
 * chiffres qu'il porte aussi — ou par mot de passe, pour qui en a choisi un
 * depuis « Mon compte ». Après la connexion, deux appels :
 *   claim_access()  rattache le compte à la fiche ou à l'invitation qui
 *                   l'attendait — se connecter ne donne aucun accès en soi ;
 *   my_context()    dit quel espace ouvrir.
 *
 * Pour la praticienne et le revendeur, une troisième question : le compte
 * a-t-il activé la double authentification ? Si oui, et tant que la session
 * n'a pas donné le code de l'application, la porte (Root.tsx) le demande
 * avant d'ouvrir l'espace. L'espace patient ne pose pas la question.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { oublierLesBrouillons } from '@/lib/brouillon'
import { normaliserCode } from '@/lib/codeConnexion'
import { aUnFacteurVerifie, niveauDuJeton, type Niveau } from '@/lib/doubleAuthentification'
import { messageCode, messageConnexionMotDePasse, messageEnvoiLien } from '@/lib/messageAuth'
import { refusDuNouveau } from '@/lib/motDePasse'
import { isConfigured, supabase } from '@/lib/supabase'
import type { CabinetBranding } from '@/types/reseller'
import { avantDelai, decisionRelecture, roleAGarder } from './relecture'

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

/**
 * La double authentification du compte, telle que le service la dit.
 *
 * « attente » tant qu'on ne sait pas : la porte n'ouvre rien pendant ce
 * temps. Dans l'espace patient, qui ne pose pas la question, c'est
 * « absent » d'emblée.
 */
export type EtatSecondFacteur = 'attente' | 'absent' | 'inscrit'

export interface AuthState {
  phase: AuthPhase
  session: Session | null
  context: AccountContext | null
  /** Message d'erreur en français, s'il y a lieu. */
  error: string
  /** Le lien magique vient d'être envoyé à cette adresse. */
  sent: string
  /** Le compte a-t-il une application d'authentification reliée ? */
  secondFacteur: EtatSecondFacteur
  /** Le niveau de la session : « aal2 » une fois le code donné. */
  niveau: Niveau
  /**
   * Relit au service si le compte a une application reliée — après l'avoir
   * activée ou désactivée depuis « Mon compte ».
   */
  relireSecondFacteur: () => Promise<void>
  /**
   * La lecture du rôle a-t-elle abouti ?
   *
   * « echec » N'EST PAS « aucun accès ». Sans cette distinction, une panne de
   * lecture d'une seconde annonçait à une praticienne qui a bien un cabinet
   * qu'aucun accès n'existe pour son adresse — et l'envoyait chercher une
   * faute de frappe inexistante.
   */
  lecture: 'attente' | 'faite' | 'echec'
  /**
   * La vérification de session a-t-elle dépassé son délai ?
   *
   * Sert à la porte d'entrée : elle dit alors, en une phrase, que l'espace
   * s'ouvrira tout seul si une session finit par revenir.
   */
  verificationLente: boolean
  envoyerLien: (email: string, captchaToken?: string) => Promise<void>
  /**
   * Entrer avec le code à six chiffres du courriel — celui de connexion comme
   * celui d'invitation.
   *
   * C'est la seule voie qui marche depuis l'espace installé sur un iPhone :
   * le lien, lui, s'ouvre dans Safari, dont la session n'est pas celle de
   * l'application.
   */
  connecterParCode: (email: string, code: string) => Promise<void>
  /** Revenir à la porte après un envoi : autre adresse, ou nouveau courriel. */
  recommencer: () => void
  /** Connexion classique, pour qui a posé un mot de passe. */
  connecterParMotDePasse: (email: string, motDePasse: string, captchaToken?: string) => Promise<void>
  /**
   * Pose ou remplace le mot de passe du compte connecté, par le serveur.
   *
   * `ancien` est vide quand on n'en a pas, ou qu'on vient d'entrer par un
   * lien : le serveur décide si cela suffit (src/lib/motDePasse.ts).
   */
  changerMotDePasse: (ancien: string, nouveau: string) => Promise<{ ok: boolean; message: string }>
  /** Ferme toutes les sessions du compte, sauf celle-ci. */
  deconnecterAilleurs: () => Promise<{ ok: boolean; message: string }>
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

/** La longueur minimale : décidée dans src/lib/motDePasse.ts, et là seulement. */
export { LONGUEUR_MOT_DE_PASSE } from '@/lib/motDePasse'

/**
 * Au-delà de ce délai, l'écran cesse d'attendre.
 *
 * RIEN NE DOIT RETENIR LA PAGE SANS FIN.
 * La reprise de session appartient à @supabase/auth-js, et elle peut durer :
 * quand le rafraîchissement du jeton échoue pour une raison réseau,
 * `_refreshAccessToken()` réessaie avec un recul qui double à chaque fois —
 * 200 ms, 400, 800, 1600… — tant que le prochain essai tient dans les trente
 * secondes de AUTO_REFRESH_TICK_DURATION_MS. Pendant tout ce temps,
 * `getSession()` ne rend pas la main et l'événement INITIAL_SESSION n'arrive
 * pas : l'application restait donc sur « Vérification de votre accès… »,
 * page blanche, jusqu'à une demi-minute — puis affichait la porte d'entrée,
 * puisque la reprise avait échoué.
 *
 * Quatre secondes : une reprise saine tient en un aller-retour, bien en deçà.
 * Passé ce délai, on montre la porte. Si une session finit malgré tout par
 * revenir, `onAuthStateChange` la rattrape et l'espace s'ouvre — la porte
 * n'aura été qu'un passage.
 */
const DELAI_VERIFICATION_MS = 4_000

/**
 * Au-delà de ce délai, la lecture du rôle est tenue pour manquée.
 *
 * LE DÉLAI CI-DESSUS NE COUVRAIT QUE LA REPRISE DE SESSION. Venaient ensuite
 * `claim_access` puis `my_context`, sans aucune borne — et chaque requête du
 * client attend elle-même `getSession()`, donc la même reprise qui peut
 * durer trente secondes. L'écran restait sur « Vérification de votre
 * accès… » tout ce temps.
 *
 * Huit secondes : deux allers-retours, dont une écriture, et un éventuel
 * rafraîchissement du jeton. Passé ce délai, on dit que la lecture a manqué
 * (sans effacer un rôle déjà lu) ; la lecture continue derrière, et si elle
 * finit par aboutir, l'espace s'ouvre tout seul.
 */
const DELAI_LECTURE_MS = 8_000

/** Ce qu'on dit quand le rôle n'a pas pu être lu. */
const MESSAGE_LECTURE =
  "Vos accès n'ont pas pu être lus — ce n'est pas votre adresse qui est en cause. Rechargez la page dans un instant."

/**
 * Au-delà de ce délai, on cesse d'attendre le service pour savoir si le
 * compte a une application reliée : on se fie à ce que la session gardée en
 * dit. La porte ne reste pas fermée sur une question.
 */
const DELAI_SECOND_FACTEUR_MS = 5_000

/** Ce que rend une lecture du rôle, réussie ou non. */
interface LectureRole {
  data: unknown
  error: { message: string } | null
}

export function SessionProvider({
  children,
  doubleAuthentification = false,
}: {
  children: ReactNode
  /**
   * Demander, pour cet espace, si le compte a activé la double
   * authentification. Vrai pour l'espace de la praticienne et du revendeur ;
   * l'espace patient ne le passe pas, et n'en fait aucun appel de plus.
   */
  doubleAuthentification?: boolean
}) {
  const [phase, setPhase] = useState<AuthPhase>(isConfigured() ? 'chargement' : 'sans-base')
  const [session, setSession] = useState<Session | null>(null)
  const [context, setContext] = useState<AccountContext | null>(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  /** La lecture du rôle a-t-elle abouti ? « echec » n'est pas « aucun accès ». */
  const [lecture, setLecture] = useState<'attente' | 'faite' | 'echec'>('attente')
  /** La reprise de session a-t-elle dépassé son délai ? */
  const [verificationLente, setVerificationLente] = useState(false)
  const facteurInitial: EtatSecondFacteur = doubleAuthentification ? 'attente' : 'absent'
  const [secondFacteur, setSecondFacteur] = useState<EtatSecondFacteur>(facteurInitial)
  /* Lisibles hors rendu : la session courante, pour relire sur demande, et
     l'état déjà su, pour ne pas l'oublier sur une relecture qui échoue. */
  const sessionCourante = useRef<Session | null>(null)
  const facteurSu = useRef<EtatSecondFacteur>(facteurInitial)
  const derniereLectureFacteur = useRef(0)

  /* Le compte dont le rôle est lu, ou en cours de lecture. C'est à lui qu'on
     compare chaque session reçue pour décider s'il faut relire. */
  const lu = useRef<string | null>(null)
  /* Le rôle affiché, lisible hors rendu : une relecture qui échoue le garde. */
  const contexteLu = useRef<AccountContext | null>(null)
  /* Le numéro de la dernière lecture lancée. Une lecture dépassée — par une
     autre, ou par une déconnexion — ne décide plus de rien en arrivant. */
  const derniereLecture = useRef(0)

  const poserContexte = useCallback((c: AccountContext | null) => {
    contexteLu.current = c
    setContext(c)
  }, [])

  const poserSecondFacteur = useCallback((e: EtatSecondFacteur) => {
    facteurSu.current = e
    setSecondFacteur(e)
  }, [])

  /**
   * Le compte a-t-il une application reliée ? On le demande au service.
   *
   * La session gardée par le navigateur le dit aussi, mais elle peut dater :
   * une application activée depuis un autre appareil n'y figure pas. Le
   * jeton est passé explicitement : la lecture ne prend pas le verrou de la
   * session, et peut partir de l'écouteur d'événements sans rien bloquer.
   *
   * `garderSiEchec` : sur une relecture (retour sur l'onglet), une réponse
   * manquée garde ce qu'on savait ; sur une première lecture, on retombe sur
   * ce que dit la session gardée — la porte ne reste pas fermée.
   */
  const lireSecondFacteur = useCallback(
    async (courante: Session | null, garderSiEchec: boolean): Promise<void> => {
      const db = supabase()
      if (!doubleAuthentification || !db || !courante) return
      const numero = ++derniereLectureFacteur.current
      const repli: EtatSecondFacteur = aUnFacteurVerifie(courante.user.factors) ? 'inscrit' : 'absent'
      let lu: EtatSecondFacteur | null = null
      try {
        const issue = await avantDelai(db.auth.getUser(courante.access_token), DELAI_SECOND_FACTEUR_MS)
        if (issue.aTemps && !issue.valeur.error && issue.valeur.data.user) {
          lu = aUnFacteurVerifie(issue.valeur.data.user.factors) ? 'inscrit' : 'absent'
        }
      } catch {
        lu = null
      }
      if (numero !== derniereLectureFacteur.current) return
      if (lu) poserSecondFacteur(lu)
      else if (!garderSiEchec || facteurSu.current === 'attente') poserSecondFacteur(repli)
    },
    [doubleAuthentification, poserSecondFacteur],
  )

  const relireSecondFacteur = useCallback(
    () => lireSecondFacteur(sessionCourante.current, false),
    [lireSecondFacteur],
  )

  /** Rattache puis lit le rôle. Les deux vont ensemble. */
  const charger = useCallback(async (): Promise<void> => {
    const db = supabase()
    if (!db) return
    const numero = ++derniereLecture.current
    const utilisateur = lu.current

    const enCours: Promise<LectureRole> = (async () => {
      const { error: claimError } = await db.rpc('claim_access')
      if (claimError) {
        // Un rattachement qui échoue n'empêche pas de lire un accès déjà acquis.
        console.warn('[auth] rattachement impossible :', claimError.message)
      }
      const { data, error } = await db.rpc('my_context')
      return { data, error }
    })().catch((err: unknown) => ({ data: null, error: { message: String(err) } }))

    const echouer = () => {
      if (numero !== derniereLecture.current) return
      /* UNE RELECTURE QUI ÉCHOUE NE PROUVE PAS QUE LE RÔLE A CHANGÉ.
         Elle arrivait à chaque retour sur l'onglet, et chaque échec démontait
         l'espace entier — séance comprise. Le rôle déjà lu pour ce compte
         reste donc en place ; seul un premier échec se dit. */
      if (roleAGarder(contexteLu.current, utilisateur)) {
        console.warn('[auth] relecture du rôle impossible : le rôle déjà lu est gardé')
        return
      }
      /* NE PAS CONFONDRE « pas d'accès » ET « on n'a pas pu lire l'accès ».
         En sortant d'ici sans contexte, l'écran d'après concluait « Aucun
         accès pour cette adresse » : une praticienne qui a bien un cabinet se
         voyait accusée d'avoir tapé la mauvaise adresse, et allait chercher
         une faute inexistante, pendant qu'il suffisait de recharger. */
      setError(MESSAGE_LECTURE)
      poserContexte(null)
      setLecture('echec')
    }

    const recevoir = ({ data, error: ctxError }: LectureRole) => {
      if (numero !== derniereLecture.current) return
      if (ctxError) {
        echouer()
        return
      }
      setError((e) => (e === MESSAGE_LECTURE ? '' : e))
      setLecture('faite')
      poserContexte(data as AccountContext)
    }

    const issue = await avantDelai(enCours, DELAI_LECTURE_MS)
    if (issue.aTemps) {
      recevoir(issue.valeur)
      return
    }
    echouer()
    /* La lecture continue derrière le délai. Si elle finit par aboutir,
       l'espace s'ouvre tout seul : l'écran d'échec n'aura été qu'un passage. */
    void enCours.then(recevoir)
  }, [poserContexte])

  useEffect(() => {
    const db = supabase()
    if (!db) return

    let vivant = true

    /* Le délai n'annule rien : la reprise continue derrière. Il décide
       seulement de ne plus retenir l'écran, et de montrer la porte — qui
       est, dans l'immense majorité des cas, ce que la reprise finira par
       conclure. */
    const minuteur = window.setTimeout(() => {
      if (!vivant) return
      setVerificationLente(true)
      setPhase((p) => (p === 'chargement' ? 'deconnecte' : p))
    }, DELAI_VERIFICATION_MS)

    /** La reprise a parlé : le délai n'a plus rien à décider. */
    function tranche() {
      window.clearTimeout(minuteur)
      setVerificationLente(false)
    }

    /**
     * Une session arrive, part, ou se rafraîchit.
     *
     * `getSession()` et `onAuthStateChange` passent tous deux par ici, et
     * apportent la même session au démarrage : la décision évite de la lire
     * deux fois. Elle est prise, et `lu` posé, AVANT toute attente — sans
     * quoi les deux voies se croiseraient et liraient chacune de leur côté.
     */
    async function suivre(evenement: AuthChangeEvent, suivante: Session | null) {
      if (!vivant) return
      tranche()
      setSession(suivante)
      sessionCourante.current = suivante
      const utilisateur = suivante?.user.id ?? null
      const decision = decisionRelecture(evenement, utilisateur, lu.current)

      if (decision === 'oublier') {
        derniereLectureFacteur.current++
        poserSecondFacteur(doubleAuthentification ? 'attente' : 'absent')
        lu.current = null
        // Une lecture en cours ne rouvrira pas l'espace d'un compte parti.
        derniereLecture.current++
        poserContexte(null)
        setLecture('attente')
        setError((e) => (e === MESSAGE_LECTURE ? '' : e))
        setPhase('deconnecte')
        return
      }

      /* Même compte, session seulement rafraîchie — le retour sur l'onglet,
         le jeton de l'heure. Le rôle lu reste le bon, et la phase n'est pas
         touchée : si une lecture court encore, c'est elle qui la posera. */
      if (decision === 'garder') {
        if (doubleAuthentification && suivante) {
          /* Une application reliée depuis, que la session nouvelle porte (le
             code d'activation vient d'être donné) : on le sait tout de suite. */
          if (aUnFacteurVerifie(suivante.user.factors)) poserSecondFacteur('inscrit')
          /* Au retour sur l'onglet, on redemande au service : une application
             activée depuis un autre appareil doit fermer celui-ci aussi. */
          if (evenement === 'SIGNED_IN') void lireSecondFacteur(suivante, true)
        }
        return
      }

      if (utilisateur !== lu.current) {
        /* Un autre compte : le rôle du précédent ne doit ni s'afficher une
           seconde de plus, ni servir de repli si la lecture échoue. */
        lu.current = utilisateur
        poserContexte(null)
        setLecture('attente')
        setPhase((p) => (p === 'connecte' ? 'chargement' : p))
        /* Le second facteur d'un autre compte ne vaut rien pour celui-ci :
           on le redemande, sans attendre — la porte patiente sur « attente ». */
        if (doubleAuthentification) {
          poserSecondFacteur('attente')
          void lireSecondFacteur(suivante, false)
        }
      }
      await charger()
      if (vivant && lu.current === utilisateur) setPhase('connecte')
    }

    void db.auth.getSession().then(({ data }) => suivre('INITIAL_SESSION', data.session))

    const { data: sub } = db.auth.onAuthStateChange((evenement, suivante) => suivre(evenement, suivante))

    return () => {
      vivant = false
      window.clearTimeout(minuteur)
      sub.subscription.unsubscribe()
    }
  }, [charger, poserContexte, doubleAuthentification, lireSecondFacteur, poserSecondFacteur])

  const niveau = useMemo(() => niveauDuJeton(session?.access_token), [session])

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
   * Le code du courriel, vérifié par le service.
   *
   * `type: 'email'` couvre les deux codes qu'on peut avoir reçus : celui d'un
   * courriel de connexion, et celui d'une invitation — le service les cherche
   * l'un après l'autre. La session ouverte arrive ensuite par
   * `onAuthStateChange`, comme après un lien : rattachement, rôle, espace.
   *
   * PAS DE CAPTCHA ICI, et ce n'est pas un oubli. Le service ne le vérifie
   * que sur les routes qui ENVOIENT un courriel ou éprouvent un mot de passe
   * (/otp, /token, /signup…) ; /verify ne le lit pas, il est borné par sa
   * propre limite d'essais. Le code, lui, n'est parti qu'après la case
   * franchie : demander une seconde case pour le saisir n'arrêterait
   * personne et ferait tout recommencer à qui attend d'entrer.
   */
  const connecterParCode = useCallback(async (email: string, code: string) => {
    const db = supabase()
    if (!db) {
      setError("L'application n'est pas reliée à sa base de données.")
      return
    }
    setError('')
    const { error: err } = await db.auth.verifyOtp({
      email: email.trim(),
      token: normaliserCode(code),
      type: 'email',
    })
    if (err) {
      setError(messageCode(err))
      return
    }
    setSent('')
  }, [])

  const recommencer = useCallback(() => {
    setSent('')
    setError('')
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
    if (err) setError(messageConnexionMotDePasse(err))
  }, [])

  const changerMotDePasse = useCallback(
    async (ancien: string, nouveau: string): Promise<{ ok: boolean; message: string }> => {
      const db = supabase()
      if (!db) return { ok: false, message: "L'application n'est pas reliée à sa base." }
      const refus = refusDuNouveau(nouveau, session?.user.email)
      if (refus) return { ok: false, message: refus }
      /* PAR LE SERVEUR, PLUS PAR LE NAVIGATEUR. `updateUser` acceptait le
         changement de n'importe quelle session ouverte, sans rien demander :
         un ordinateur de cabinet resté allumé suffisait à prendre le compte.
         Le serveur exige l'ancien mot de passe, ou une entrée par lien toute
         récente — et déconnecte les autres appareils une fois le changement
         fait. */
      const { data } = await db.auth.getSession()
      const jeton = data.session?.access_token
      if (!jeton) return { ok: false, message: 'Votre session a expiré. Reconnectez-vous.' }
      try {
        const reponse = await fetch('/api/compte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
          body: JSON.stringify({ geste: 'mot-de-passe', ancien, nouveau }),
        })
        const lu = (await reponse.json().catch(() => ({}))) as { message?: string }
        if (!reponse.ok) {
          return { ok: false, message: lu.message ?? "Le mot de passe n'a pas pu être enregistré. Réessayez." }
        }
        return { ok: true, message: lu.message ?? 'Mot de passe enregistré.' }
      } catch {
        return { ok: false, message: 'Le serveur est injoignable. Réessayez dans un instant.' }
      }
    },
    [session],
  )

  const deconnecterAilleurs = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const db = supabase()
    if (!db) return { ok: false, message: "L'application n'est pas reliée à sa base." }
    const { error: err } = await db.auth.signOut({ scope: 'others' })
    return err
      ? { ok: false, message: "Les autres appareils n'ont pas pu être déconnectés. Réessayez." }
      : {
          ok: true,
          message:
            'Vos autres appareils sont déconnectés. Ils vous redemanderont un lien ou votre mot de passe.',
        }
  }, [])

  const seDeconnecter = useCallback(async () => {
    /* CET APPAREIL SEULEMENT. Sans portée, `signOut()` vaut 'global' : se
       déconnecter du poste du cabinet fermait aussi la session du téléphone,
       et la patiente perdait son application installée sans rien avoir
       demandé. Fermer les autres appareils est un geste à part, nommé
       comme tel : `deconnecterAilleurs`. */
    await supabase()?.auth.signOut({ scope: 'local' })
    setSent('')
    /* Les brouillons de l'espace patient partent avec la session : un
       appareil prêté ne garde pas une page de journal inachevée pour la
       personne suivante. */
    oublierLesBrouillons()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      phase,
      session,
      context,
      error,
      sent,
      secondFacteur,
      niveau,
      relireSecondFacteur,
      lecture,
      verificationLente,
      envoyerLien,
      connecterParCode,
      recommencer,
      connecterParMotDePasse,
      changerMotDePasse,
      deconnecterAilleurs,
      seDeconnecter,
      rafraichir: charger,
    }),
    [
      phase,
      session,
      context,
      error,
      sent,
      secondFacteur,
      niveau,
      relireSecondFacteur,
      lecture,
      verificationLente,
      envoyerLien,
      connecterParCode,
      recommencer,
      connecterParMotDePasse,
      changerMotDePasse,
      deconnecterAilleurs,
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
