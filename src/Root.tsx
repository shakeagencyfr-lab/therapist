import { App } from './App'
import { SignIn } from './auth/SignIn'
import { SessionProvider, useAuth } from './auth/session'
import { Button } from './components/ui'
import { AppStoreProvider } from './state/store'
import s from './Root.module.css'

/** Adresse de l'espace patient — un site à part, pensé pour le téléphone. */
const ESPACE_PATIENT = '/mon'

function Attente() {
  return (
    <div className={s.center}>
      <span className={s.wait}>Vérification de votre accès…</span>
    </div>
  )
}

function Message({
  titre,
  texte,
  children,
}: {
  titre: string
  texte: string
  children?: React.ReactNode
}) {
  return (
    <div className={s.center}>
      <div className={s.card}>
        <h1 className={s.title}>{titre}</h1>
        <p className={s.text}>{texte}</p>
        {children}
      </div>
    </div>
  )
}

function Portail() {
  const { phase, context, seDeconnecter } = useAuth()

  // Sans base configurée, l'application tourne sur ses données de
  // démonstration : c'est ce qui permet de montrer les écrans sans compte.
  if (phase === 'sans-base') {
    return (
      <>
        <div className={s.demo}>
          Mode démonstration — données fictives, aucune base connectée.
        </div>
        <AppStoreProvider>
          <App />
        </AppStoreProvider>
      </>
    )
  }

  if (phase === 'chargement') return <Attente />

  if (phase === 'deconnecte') {
    return (
      <SignIn
        titre="Entrer dans votre espace"
        intro="Cet espace est réservé à la praticienne et à son cabinet. Entrez l'adresse à laquelle vous avez été invitée : vous recevrez un lien de connexion."
      />
    )
  }

  // Connecté, mais rien ne l'attendait.
  if (!context?.cabinet && !context?.reseller) {
    if (context?.patient) {
      return (
        <Message
          titre="Votre espace est ailleurs"
          texte="Ce site est celui de votre thérapeute. Le vôtre tient sur un téléphone : c'est là que vous retrouvez vos audios, vos tâches du jour et votre journal."
        >
          <Button variant="primary" onClick={() => (window.location.href = ESPACE_PATIENT)}>
            Ouvrir mon espace
          </Button>
        </Message>
      )
    }
    return (
      <Message
        titre="Aucun accès pour cette adresse"
        texte="Votre compte est bien créé, mais aucune fiche ni invitation ne l'attend. Demandez à votre cabinet, ou à votre revendeur, de vous inviter avec cette adresse."
      >
        <Button variant="secondary" onClick={seDeconnecter}>
          Utiliser une autre adresse
        </Button>
      </Message>
    )
  }

  // La marque du cabinet, dès la connexion.
  return (
    <AppStoreProvider
      initial={context.cabinet ? {} : { space: 'reseller' }}
    >
      <App />
    </AppStoreProvider>
  )
}

export function Root() {
  return (
    <SessionProvider>
      <Portail />
    </SessionProvider>
  )
}
