import { useState } from 'react'
import { Button, Card, Notice, Overline, Title } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { useStore } from '@/state/store'
import { DeconnexionAuto } from './DeconnexionAuto'
import { DoubleAuthentification } from './DoubleAuthentification'
import { MotDePasse } from './MotDePasse'
import s from './CompteView.module.css'

/**
 * Mon compte : ce qui appartient à la personne, pas au cabinet.
 *
 * Le mot de passe vivait dans « Intégrations », entre la clé Stripe et
 * l'agenda : personne ne va chercher son mot de passe parmi les services
 * reliés au cabinet. Il a ici sa page, que la thérapeute et le revendeur
 * ouvrent du même geste — le menu de leur compte, en haut à droite.
 *
 * La sécurité du compte y vit aussi : la double authentification, et la
 * déconnexion automatique d'un poste partagé.
 */
export function CompteView() {
  const auth = useMaybeAuth()
  const { state, set } = useStore()
  const [sortie, setSortie] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [enCours, setEnCours] = useState(false)

  const identite = auth?.context ?? null
  const email = identite?.email ?? auth?.session?.user.email ?? null
  const espaces = [
    identite?.cabinet ? `Cabinet ${identite.cabinet.name}` : null,
    identite?.reseller ? `Revendeur ${identite.reseller.name}` : null,
  ].filter((x): x is string => Boolean(x))

  async function fermerLesAutres() {
    if (!auth || enCours) return
    setEnCours(true)
    const r = await auth.deconnecterAilleurs()
    setEnCours(false)
    setSortie({ tone: r.ok ? 'ok' : 'warn', text: r.message })
  }

  return (
    <div className={s.wrap}>
      <div className={s.crumb}>
        <button
          type="button"
          className={s.retour}
          onClick={() => set({ mode: 'therapist' })}
        >
          ← {state.space === 'reseller' ? "Retour à l'espace revendeur" : 'Retour aux patients'}
        </button>
      </div>
      <Overline>Votre compte</Overline>
      <h1 className={s.h1}>Mon compte</h1>
      <p className={s.intro}>
        Ce qui vous appartient à vous, et non au cabinet : votre adresse, votre mot de passe, la
        protection de vos connexions, et les appareils où votre session est ouverte.
      </p>

      {!auth?.session ? (
        <Card>
          <p className={s.muted}>Connectez-vous pour régler votre compte.</p>
        </Card>
      ) : (
        <div className={s.grid}>
          <Card className={s.bloc}>
            <Title large as="h2">
              Identité
            </Title>
            <dl className={s.infos}>
              <div className={s.ligne}>
                <dt>Adresse de connexion</dt>
                <dd>{email ?? '—'}</dd>
              </div>
              {espaces.length ? (
                <div className={s.ligne}>
                  <dt>{espaces.length > 1 ? 'Vos espaces' : 'Votre espace'}</dt>
                  <dd>{espaces.join(' · ')}</dd>
                </div>
              ) : null}
            </dl>
            {/* Changer d'adresse n'est pas un geste en libre-service : l'adresse
                relie aussi les invitations, l'équipe et les fiches. La
                praticienne passe par son revendeur ; le revendeur, par nous. */}
            <p className={s.muted}>
              C'est à cette adresse qu'arrivent vos liens de connexion.{' '}
              {identite?.cabinet
                ? 'Pour en changer, écrivez à votre revendeur : elle relie aussi vos invitations et vos patients.'
                : 'Pour en changer, écrivez au support de la plateforme : elle relie aussi vos cabinets et leurs invitations.'}
            </p>
          </Card>

          <MotDePasse />

          <DoubleAuthentification />

          <DeconnexionAuto />

          <Card className={s.bloc}>
            <Title large as="h2">
              Vos appareils
            </Title>
            <p className={s.texte}>
              Un ordinateur de cabinet partagé, un téléphone perdu, une tablette prêtée : vous
              pouvez fermer d'un geste toutes vos sessions ouvertes ailleurs. Celle-ci reste
              ouverte.
            </p>
            {sortie ? <Notice tone={sortie.tone}>{sortie.text}</Notice> : null}
            <div className={s.actions}>
              <Button variant="primary" disabled={enCours} onClick={() => void fermerLesAutres()}>
                {enCours ? 'Déconnexion…' : 'Déconnecter mes autres appareils'}
              </Button>
              <Button onClick={() => void auth.seDeconnecter()}>Me déconnecter ici</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
