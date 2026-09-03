/**
 * Point d'entrée de l'espace patient.
 *
 * Un site à part, servi sur sa propre adresse : le patient n'atteint jamais
 * l'outil de sa thérapeute, et son téléchargement ne contient pas une ligne
 * du code de l'espace cabinet.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionProvider, useAuth } from './auth/session'
import { SignIn } from './auth/SignIn'
import { PatientSpace } from './patient/PatientSpace'
import { applyTheme, defaultTheme } from './theme/theme'
import './styles/global.css'

applyTheme(defaultTheme)

function Portail() {
  const { phase, context } = useAuth()

  if (phase === 'sans-base') {
    return (
      <SignIn
        titre="Espace non configuré"
        intro="Cette installation n'est pas encore reliée à sa base de données. Prévenez votre cabinet."
      />
    )
  }

  if (phase === 'chargement') return null

  if (phase === 'deconnecte') {
    return (
      <SignIn
        titre="Votre espace"
        intro="Entrez l'adresse que vous avez donnée à votre thérapeute : vous recevrez un lien qui vous connecte, sans mot de passe à retenir."
      />
    )
  }

  /* Deux situations mènent ici, et l'une n'est pas une erreur : le suivi
     s'est terminé, sa fiche a été close, et l'espace se ferme avec elle. Lui
     dire que son adresse est fausse serait lui faire chercher une faute qui
     n'existe pas. */
  if (!context?.patient) {
    return (
      <SignIn
        titre="Aucun suivi en cours à cette adresse"
        intro="Votre compte existe. Si votre suivi vient de se terminer, c'est normal : votre espace se ferme avec lui, et votre thérapeute peut le rouvrir. Sinon, vérifiez avec elle l'adresse qu'elle a enregistrée."
      />
    )
  }

  return <PatientSpace />
}

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <Portail />
    </SessionProvider>
  </StrictMode>,
)
