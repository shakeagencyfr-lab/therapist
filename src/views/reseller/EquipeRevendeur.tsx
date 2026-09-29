import { useState } from 'react'
import { Button, Chip, FieldLabel, Notice, Pill, TextInput } from '@/components/ui'
import { adressePlausible, echeanceDite, invitationExpiree } from '@/lib/equipe'
import { dateLongue, plural } from '@/lib/format'
import {
  CE_QUE_PEUT_LE_ROLE,
  NOM_MAX,
  libelleRoleRevendeur,
  nombreDeProprietaires,
  peutRetirerDuRevendeur,
  phraseDeContact,
  problemeCoordonnees,
  problemeInvitation,
  type Coordonnees,
  type InvitationRevendeur,
  type MembreRevendeur,
  type RoleRevendeur,
} from '@/lib/revendeur'
import { useEquipeRevendeur } from '@/reseller/useEquipeRevendeur'
import type { Resultat } from '@/reseller/useReseller'
import s from './EquipeRevendeur.module.css'

/**
 * L'onglet « Équipe » de l'espace revendeur : qui y travaille, qui y est
 * attendu, et à qui les praticiennes écrivent.
 *
 * Le compte revendeur n'avait qu'une personne, et aucun moyen d'en faire
 * entrer une seconde : la base connaissait les invitations d'équipe depuis
 * 0006, aucun écran ne les posait. Le propriétaire invite, relance, annule et
 * retire ici ; il règle aussi les coordonnées que la praticienne lit dans son
 * bandeau de contrat. Les autres membres voient l'équipe sans la changer —
 * c'est la base qui en décide (0057), l'écran ne fait que ne pas proposer ce
 * qu'elle refuserait.
 *
 * Aucune donnée de santé ici : des adresses de collègues, un nom d'enseigne.
 */
export function EquipeRevendeur() {
  const equipe = useEquipeRevendeur()
  const [enCours, setEnCours] = useState('')
  const [sortie, setSortie] = useState<{ ton: 'ok' | 'warn'; texte: string } | null>(null)

  /** Un geste à la fois : deux relances croisées enverraient deux courriels. */
  async function agir(cle: string, geste: () => Promise<Resultat>): Promise<boolean> {
    if (enCours) return false
    setEnCours(cle)
    setSortie(null)
    const r = await geste()
    setEnCours('')
    if (r.message) setSortie({ ton: r.ok && !r.partiel ? 'ok' : 'warn', texte: r.message })
    return r.ok
  }

  return (
    <>
      {!equipe.reel && !equipe.chargement ? (
        <p className={s.demo}>Équipe de démonstration : connectez-vous pour voir et gérer la vôtre.</p>
      ) : null}
      {equipe.erreur ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          {equipe.erreur}
        </Notice>
      ) : null}
      {sortie ? (
        <Notice tone={sortie.ton} style={{ marginBottom: 18 }}>
          {sortie.texte}
        </Notice>
      ) : null}

      <div className={s.grid}>
        <div className={s.colonne}>
          <Membres
            membres={equipe.membres}
            proprietaire={equipe.proprietaire}
            chargement={equipe.chargement}
            enCours={enCours}
            onRetirer={(m) => agir(`retirer-${m.user_id}`, () => equipe.retirer(m))}
          />
          <Invitations
            invitations={equipe.invitations}
            proprietaire={equipe.proprietaire}
            enCours={enCours}
            onRelancer={(i) => void agir(`relancer-${i.id}`, () => equipe.relancer(i))}
            onAnnuler={(i) => void agir(`annuler-${i.id}`, () => equipe.annuler(i))}
          />
        </div>

        <div className={s.colonne}>
          <CoordonneesDeSupport
            // Une relecture de la base repart des coordonnées enregistrées.
            key={`${equipe.organisation?.nom ?? ''}|${equipe.organisation?.courriel ?? ''}`}
            publie={{ nom: equipe.organisation?.nom ?? '', courriel: equipe.organisation?.courriel ?? '' }}
            proprietaire={equipe.proprietaire}
            chargement={equipe.chargement}
            enCours={enCours === 'coordonnees'}
            onEnregistrer={(c) => agir('coordonnees', () => equipe.enregistrer(c))}
          />
          {equipe.proprietaire ? (
            <Inviter
              membres={equipe.membres}
              invitations={equipe.invitations}
              enCours={enCours}
              onInviter={(email, role) => agir('inviter', () => equipe.inviter(email, role))}
            />
          ) : (
            <section className={s.panel}>
              <h2 className={s.panelTitle}>Qui règle quoi</h2>
              {ROLES.map((r) => (
                <p key={r.code} className={s.panelSub} style={{ marginBottom: 8 }}>
                  <strong>{r.label}</strong> — {CE_QUE_PEUT_LE_ROLE[r.code]}
                </p>
              ))}
            </section>
          )}
        </div>
      </div>
    </>
  )
}

/* ---- Les membres ------------------------------------------------------- */

function Membres({
  membres,
  proprietaire,
  chargement,
  enCours,
  onRetirer,
}: {
  membres: MembreRevendeur[]
  proprietaire: boolean
  chargement: boolean
  enCours: string
  onRetirer: (m: MembreRevendeur) => Promise<boolean>
}) {
  /** La ligne dont le retrait attend sa confirmation. */
  const [aConfirmer, setAConfirmer] = useState<string | null>(null)
  const proprietaires = nombreDeProprietaires(membres)

  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Membres</h2>
        <span className={s.compte}>
          {chargement && !membres.length ? 'Lecture de votre équipe…' : plural(membres.length, 'personne', 'personnes')}
        </span>
      </div>
      <p className={s.panelSub}>
        Toutes ces personnes voient vos cabinets, leurs contrats et leurs compteurs — jamais un
        patient ni un dossier.
      </p>
      {membres.length ? (
        <ul className={s.liste}>
          {membres.map((m) => {
            const retirable = peutRetirerDuRevendeur(m, proprietaire, proprietaires)
            const confirmer = aConfirmer === m.user_id
            return (
              <li key={m.user_id} className={s.ligne}>
                <span className={s.qui}>
                  <span className={s.nom}>
                    {m.email}
                    {m.moi ? <span className={s.vous}> · vous</span> : null}
                  </span>
                  <span className={s.detail}>Depuis le {dateLongue(m.created_at)}</span>
                </span>
                <span className={s.gestes}>
                  <Pill tone={m.role === 'owner' ? 'accent' : 'neutral'}>{libelleRoleRevendeur(m.role)}</Pill>
                  {retirable && !confirmer ? (
                    <Button variant="ghost" disabled={enCours !== ''} onClick={() => setAConfirmer(m.user_id)}>
                      Retirer
                    </Button>
                  ) : null}
                  {retirable && confirmer ? (
                    <>
                      <Button
                        variant="danger"
                        disabled={enCours !== ''}
                        onClick={async () => {
                          await onRetirer(m)
                          setAConfirmer(null)
                        }}
                      >
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
                    {m.email} n'aura plus accès à l'espace revendeur dès maintenant, et les invitations
                    envoyées depuis ce compte seront annulées. Vos cabinets, eux, ne changent pas.
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : chargement ? null : (
        <p className={s.muted}>Aucun membre lisible pour ce compte. Rechargez la page dans un instant.</p>
      )}
    </section>
  )
}

/* ---- Les invitations en attente --------------------------------------- */

function Invitations({
  invitations,
  proprietaire,
  enCours,
  onRelancer,
  onAnnuler,
}: {
  invitations: InvitationRevendeur[]
  proprietaire: boolean
  enCours: string
  onRelancer: (i: InvitationRevendeur) => void
  onAnnuler: (i: InvitationRevendeur) => void
}) {
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Invitations en attente</h2>
        <span className={s.compte}>{plural(invitations.length, 'invitation', 'invitations')}</span>
      </div>
      {invitations.length ? (
        <ul className={s.liste}>
          {invitations.map((i) => {
            const echue = invitationExpiree(i.expires_at)
            return (
              <li key={i.id} className={s.ligne}>
                <span className={s.qui}>
                  <span className={s.nom}>{i.email}</span>
                  <span className={s.detail}>
                    {libelleRoleRevendeur(i.role)} ·{' '}
                    <span className={echue ? s.echue : undefined}>{echeanceDite(i.expires_at)}</span>
                    {echue ? ' : le lien ne donne plus accès. Renvoyez-la pour trente jours de plus.' : ''}
                  </span>
                </span>
                {proprietaire ? (
                  <span className={s.gestes}>
                    <Button disabled={enCours !== ''} onClick={() => onRelancer(i)}>
                      {enCours === `relancer-${i.id}` ? 'Envoi…' : 'Renvoyer'}
                    </Button>
                    <Button variant="ghost" disabled={enCours !== ''} onClick={() => onAnnuler(i)}>
                      {enCours === `annuler-${i.id}` ? 'Annulation…' : 'Annuler'}
                    </Button>
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className={s.muted}>Aucune invitation en attente.</p>
      )}
    </section>
  )
}

/* ---- Inviter ------------------------------------------------------------ */

const ROLES: Array<{ code: RoleRevendeur; label: string }> = [
  { code: 'staff', label: "Membre de l'équipe" },
  { code: 'owner', label: 'Propriétaire du compte' },
]

function Inviter({
  membres,
  invitations,
  enCours,
  onInviter,
}: {
  membres: MembreRevendeur[]
  invitations: InvitationRevendeur[]
  enCours: string
  onInviter: (email: string, role: RoleRevendeur) => Promise<boolean>
}) {
  const [email, setEmail] = useState('')
  // Le moins de droits par défaut : un propriétaire se choisit, il ne s'hérite pas.
  const [role, setRole] = useState<RoleRevendeur>('staff')
  const probleme = problemeInvitation(email, membres, invitations)
  const pret = adressePlausible(email) && !probleme

  async function inviter() {
    if (!pret || enCours) return
    if (await onInviter(email, role)) {
      setEmail('')
      setRole('staff')
    }
  }

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Inviter quelqu'un</h2>
      <p className={s.panelSub}>
        La personne reçoit un lien de connexion, valable trente jours. En se connectant avec cette
        adresse, elle rejoint votre espace revendeur.
      </p>
      <div className={s.form}>
        <label className={s.champ}>
          <FieldLabel>Adresse électronique</FieldLabel>
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@votre-societe.fr"
            aria-invalid={Boolean(probleme)}
          />
          {probleme ? <span className={s.probleme}>{probleme}</span> : null}
        </label>
        <div className={s.champ}>
          <FieldLabel>Rôle</FieldLabel>
          <div className={s.roles} role="group" aria-label="Rôle de la personne invitée">
            {ROLES.map((r) => (
              <Chip key={r.code} on={role === r.code} onClick={() => setRole(r.code)}>
                {r.label}
              </Chip>
            ))}
          </div>
          <p className={s.aide}>{CE_QUE_PEUT_LE_ROLE[role]}</p>
        </div>
        <div className={s.actions}>
          <Button variant="primary" disabled={!pret || enCours !== ''} onClick={() => void inviter()}>
            {enCours === 'inviter' ? 'Invitation…' : 'Inviter'}
          </Button>
        </div>
      </div>
    </section>
  )
}

/* ---- Les coordonnées de support ---------------------------------------- */

function CoordonneesDeSupport({
  publie,
  proprietaire,
  chargement,
  enCours,
  onEnregistrer,
}: {
  publie: Coordonnees
  proprietaire: boolean
  chargement: boolean
  enCours: boolean
  onEnregistrer: (c: Coordonnees) => Promise<boolean>
}) {
  const [brouillon, setBrouillon] = useState<Coordonnees>(publie)
  const probleme = problemeCoordonnees(brouillon)
  const modifie = brouillon.nom.trim() !== publie.nom.trim() || brouillon.courriel.trim() !== publie.courriel.trim()

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Coordonnées de support</h2>
      <p className={s.panelSub}>
        Ce que vos praticiennes lisent quand leur contrat s'arrête ou approche de sa fin : le nom de
        votre organisation, et l'adresse où vous écrire.
      </p>

      {chargement && !publie.nom ? <p className={s.muted}>Lecture de vos coordonnées…</p> : null}

      {proprietaire ? (
        <div className={s.form}>
          <label className={s.champ}>
            <FieldLabel>Nom affiché</FieldLabel>
            <TextInput
              value={brouillon.nom}
              maxLength={NOM_MAX}
              onChange={(e) => setBrouillon((b) => ({ ...b, nom: e.target.value }))}
              placeholder="Votre société"
            />
          </label>
          <label className={s.champ}>
            <FieldLabel>Adresse de support</FieldLabel>
            <TextInput
              type="email"
              value={brouillon.courriel}
              onChange={(e) => setBrouillon((b) => ({ ...b, courriel: e.target.value }))}
              placeholder="support@votre-societe.fr"
            />
            <span className={s.aide}>Facultative. Sans elle, vos praticiennes ne lisent que le nom.</span>
          </label>
          {probleme ? <p className={s.probleme}>{probleme}</p> : null}
          <div className={s.champ}>
            <FieldLabel>Ce qu'elles liront</FieldLabel>
            <p className={s.apercu}>« {phraseDeContact(brouillon)} »</p>
          </div>
          <div className={s.actions}>
            <Button
              variant="primary"
              disabled={!modifie || Boolean(probleme) || enCours}
              onClick={() => void onEnregistrer(brouillon)}
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            {modifie && !enCours ? (
              <Button variant="ghost" onClick={() => setBrouillon(publie)}>
                Annuler
              </Button>
            ) : null}
          </div>
        </div>
      ) : publie.nom ? (
        <div className={s.lecture}>
          <span>{publie.nom}</span>
          <span className={s.detail}>{publie.courriel || 'Aucune adresse de support.'}</span>
          <p className={s.muted}>Seul un propriétaire du compte règle ces coordonnées.</p>
        </div>
      ) : null}
    </section>
  )
}
