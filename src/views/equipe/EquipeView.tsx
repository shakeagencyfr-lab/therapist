import { useState } from 'react'
import { Button, Card, Notice, Overline, Pill, TextInput, Title } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { adressePlausible, echeanceDite, invitationExpiree, libelleRole, peutRetirer } from '@/lib/equipe'
import { plural } from '@/lib/format'
import { useEquipe, type InvitationEquipe, type Membre, type Resultat } from './useEquipe'
import s from './EquipeView.module.css'

/**
 * L'équipe du cabinet : qui y exerce, qui y est attendu.
 *
 * L'offre promettait « plusieurs praticiennes par cabinet » et aucun écran ne
 * permettait d'en faire entrer une seconde ; la base, elle, refusait de la
 * rattacher (0042 l'a corrigé). La titulaire invite, relance, annule et
 * retire ici. Les autres membres voient l'équipe, sans pouvoir la changer :
 * c'est la base qui le décide, cet écran ne fait que ne pas proposer ce
 * qu'elle refuserait.
 */
export function EquipeView() {
  const auth = useMaybeAuth()
  const cabinet = auth?.context?.cabinet ?? null
  const moi = auth?.context?.user_id ?? null
  const titulaire = cabinet?.role === 'owner'
  const equipe = useEquipe(cabinet?.id ?? null)

  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [enCours, setEnCours] = useState('')
  const [sortie, setSortie] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  /** La ligne dont le retrait attend sa confirmation. */
  const [aConfirmer, setAConfirmer] = useState<string | null>(null)

  const titulaires = equipe.membres.filter((m) => m.role === 'owner').length

  /** Un geste à la fois : deux relances croisées enverraient deux courriels. */
  async function agir(cle: string, geste: () => Promise<Resultat>): Promise<boolean> {
    if (enCours) return false
    setEnCours(cle)
    setSortie(null)
    const r = await geste()
    setEnCours('')
    if (r.message) setSortie({ tone: r.ok && !r.partiel ? 'ok' : 'warn', text: r.message })
    return r.ok
  }

  async function inviter() {
    if (!adressePlausible(email)) return
    const fait = await agir('inviter', () => equipe.inviter(nom, email))
    if (fait) {
      setNom('')
      setEmail('')
    }
  }

  async function retirer(membre: Membre) {
    await agir(`retirer-${membre.user_id}`, () => equipe.retirer(membre))
    setAConfirmer(null)
  }

  return (
    <div className={s.wrap}>
      <div className={s.crumb}>
        <Overline>Réglages du cabinet</Overline>
      </div>
      <h1 className={s.h1}>Équipe</h1>
      <p className={s.intro}>
        Les personnes qui exercent dans ce cabinet. Toutes voient les mêmes dossiers : chaque fiche,
        chaque séance, chaque journal partagé. N'invitez que qui travaille avec vous.
      </p>

      {!cabinet ? (
        <Card>
          <p className={s.muted}>Connectez-vous à votre cabinet pour voir et gérer son équipe.</p>
        </Card>
      ) : (
        <div className={s.grid}>
          {equipe.erreur ? <Notice tone="warn">{equipe.erreur}</Notice> : null}
          {sortie ? <Notice tone={sortie.tone}>{sortie.text}</Notice> : null}

          <Card className={s.bloc}>
            <div className={s.blocHead}>
              <Title large as="h2">
                Membres
              </Title>
              <span className={s.compte}>
                {equipe.chargement && !equipe.membres.length
                  ? 'Lecture…'
                  : plural(equipe.membres.length, 'personne', 'personnes')}
              </span>
            </div>
            <ul className={s.liste}>
              {equipe.membres.map((m) => {
                const retirable = peutRetirer(m, { user_id: moi, titulaire }, titulaires)
                const confirmer = aConfirmer === m.user_id
                return (
                  <li key={m.user_id} className={s.ligne}>
                    <span className={s.qui}>
                      <span className={s.nom}>
                        {m.display_name}
                        {m.user_id === moi ? <span className={s.vous}> · vous</span> : null}
                      </span>
                      <span className={s.adresse}>{m.email ?? '—'}</span>
                    </span>
                    <span className={s.gestes}>
                      <Pill tone={m.role === 'owner' ? 'accent' : 'neutral'}>{libelleRole(m.role)}</Pill>
                      {retirable && !confirmer ? (
                        <Button variant="ghost" disabled={enCours !== ''} onClick={() => setAConfirmer(m.user_id)}>
                          Retirer
                        </Button>
                      ) : null}
                      {retirable && confirmer ? (
                        <>
                          <Button variant="danger" disabled={enCours !== ''} onClick={() => void retirer(m)}>
                            {enCours === `retirer-${m.user_id}` ? 'Retrait…' : 'Confirmer le retrait'}
                          </Button>
                          <Button variant="ghost" onClick={() => setAConfirmer(null)}>
                            Garder
                          </Button>
                        </>
                      ) : null}
                    </span>
                    {confirmer ? (
                      <p className={s.avertissement}>
                        {m.display_name} n'aura plus accès au cabinet dès maintenant. Les dossiers,
                        eux, restent au cabinet avec tout leur historique.
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {!titulaire ? (
              <p className={s.muted}>
                Seule la titulaire du cabinet invite et retire des membres.
              </p>
            ) : null}
          </Card>

          <Card className={s.bloc}>
            <div className={s.blocHead}>
              <Title large as="h2">
                Invitations en attente
              </Title>
              <span className={s.compte}>{plural(equipe.invitations.length, 'invitation', 'invitations')}</span>
            </div>
            {equipe.invitations.length ? (
              <ul className={s.liste}>
                {equipe.invitations.map((i) => (
                  <InvitationLigne
                    key={i.id}
                    invitation={i}
                    titulaire={titulaire}
                    enCours={enCours}
                    onRelancer={() => void agir(`relancer-${i.id}`, () => equipe.relancer(i))}
                    onAnnuler={() => void agir(`annuler-${i.id}`, () => equipe.annuler(i))}
                  />
                ))}
              </ul>
            ) : (
              <p className={s.muted}>Aucune invitation en attente.</p>
            )}
          </Card>

          {titulaire ? (
            <Card className={s.bloc}>
              <Title large as="h2">
                Inviter quelqu'un
              </Title>
              <p className={s.texte}>
                La personne reçoit un lien de connexion, valable trente jours. En se connectant avec
                cette adresse, elle rejoint l'équipe du cabinet.
              </p>
              <div className={s.form}>
                <label className={s.field}>
                  <span className={s.label}>Nom</span>
                  <TextInput value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Chloé Martin" maxLength={120} />
                </label>
                <label className={s.field}>
                  <span className={s.label}>Adresse électronique</span>
                  <TextInput
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="chloe@cabinet.fr"
                  />
                </label>
                <Button
                  variant="primary"
                  disabled={enCours !== '' || !adressePlausible(email)}
                  onClick={() => void inviter()}
                >
                  {enCours === 'inviter' ? 'Invitation…' : 'Inviter'}
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** Une invitation en attente : à qui, jusqu'à quand, et ce que la titulaire peut en faire. */
function InvitationLigne({
  invitation,
  titulaire,
  enCours,
  onRelancer,
  onAnnuler,
}: {
  invitation: InvitationEquipe
  titulaire: boolean
  enCours: string
  onRelancer: () => void
  onAnnuler: () => void
}) {
  const echue = invitationExpiree(invitation.expires_at)
  /* L'invitation d'ouverture restée sans suite — le revendeur en avait posé
     deux, la première arrivée a pris la place. Elle ne peut plus aboutir
     telle quelle : la relancer en fait une invitation de membre. */
  const ouverture = invitation.role === 'owner'
  return (
    <li className={s.ligne}>
      <span className={s.qui}>
        <span className={s.nom}>{invitation.display_name || invitation.email}</span>
        <span className={s.adresse}>
          {invitation.display_name ? `${invitation.email} · ` : ''}
          <span className={echue ? s.echue : undefined}>{echeanceDite(invitation.expires_at)}</span>
          {ouverture ? ' · invitation d’ouverture, sans suite' : ''}
        </span>
      </span>
      {titulaire ? (
        <span className={s.gestes}>
          <Button disabled={enCours !== ''} onClick={onRelancer}>
            {enCours === `relancer-${invitation.id}` ? 'Envoi…' : 'Renvoyer'}
          </Button>
          <Button variant="ghost" disabled={enCours !== ''} onClick={onAnnuler}>
            {enCours === `annuler-${invitation.id}` ? 'Annulation…' : 'Annuler'}
          </Button>
        </span>
      ) : null}
    </li>
  )
}
