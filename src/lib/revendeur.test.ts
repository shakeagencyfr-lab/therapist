import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { phraseDuJournal, type EntreeJournal } from './contrat'
import {
  consequencesFermeture,
  dejaDansLEquipe,
  depenseAnalyseDite,
  fermetureDite,
  libelleRoleRevendeur,
  messageFermeture,
  messageRetraitRevendeur,
  nombreDeProprietaires,
  peutRetirerDuRevendeur,
  phraseDeContact,
  problemeCoordonnees,
  problemeInvitation,
  praticiennesDites,
  refusInvitationRevendeur,
  separerFermes,
  versLigneCoordonnees,
} from './revendeur'

/**
 * Le revendeur : son équipe, la fermeture de ses cabinets, ses coordonnées
 * de support (0057).
 *
 * La base tient les droits (supabase/tests/revendeur_equipe_et_fermeture.sql) ;
 * ici, ce que les écrans en disent, et les gardes qui empêchent de montrer un
 * bouton qu'elle refuserait.
 */

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lire = (...chemin: string[]) => readFileSync(join(racine, ...chemin), 'utf8')

describe('les rôles du compte revendeur', () => {
  it('se disent sans genre', () => {
    expect(libelleRoleRevendeur('owner')).toBe('Propriétaire du compte')
    expect(libelleRoleRevendeur('staff')).toBe("Membre de l'équipe")
    // Un rôle inconnu ne se lit pas comme un propriétaire.
    expect(libelleRoleRevendeur('autre')).toBe("Membre de l'équipe")
  })

  it('comptent les propriétaires', () => {
    expect(nombreDeProprietaires([{ role: 'owner' }, { role: 'staff' }, { role: 'owner' }])).toBe(2)
    expect(nombreDeProprietaires([])).toBe(0)
  })
})

describe('retirer quelqu’un de l’équipe', () => {
  const membre = (role: string, moi = false) => ({ role, moi })

  it('ne se propose qu’au propriétaire, jamais sur sa propre ligne', () => {
    expect(peutRetirerDuRevendeur(membre('staff'), true, 1)).toBe(true)
    expect(peutRetirerDuRevendeur(membre('staff'), false, 1)).toBe(false)
    expect(peutRetirerDuRevendeur(membre('owner', true), true, 3)).toBe(false)
  })

  it('ne retire jamais le dernier propriétaire', () => {
    expect(peutRetirerDuRevendeur(membre('owner'), true, 1)).toBe(false)
    expect(peutRetirerDuRevendeur(membre('owner'), true, 2)).toBe(true)
  })

  it('traduit chaque mot de la base, et ne peint en vert que la réussite', () => {
    const qui = 'commercial@exemple.fr'
    expect(messageRetraitRevendeur('ok', qui)).toEqual({
      ok: true,
      message: expect.stringContaining('ne fait plus partie de votre équipe'),
    })
    for (const code of ['pas_proprietaire', 'soi_meme', 'dernier_proprietaire', 'inconnu', null, 'autre']) {
      expect(messageRetraitRevendeur(code, qui).ok).toBe(false)
    }
    expect(messageRetraitRevendeur('soi_meme', qui).message).toMatch(/Un autre propriétaire/)
    expect(messageRetraitRevendeur(null, qui).message).toMatch(/Réessayez/)
  })
})

describe('inviter dans l’équipe', () => {
  const membres = [{ email: 'Direction@exemple.fr' }]
  const attente = [{ email: 'accompagnement@exemple.fr' }]

  it('reconnaît une adresse déjà membre, casse et espaces compris', () => {
    expect(dejaDansLEquipe('  direction@EXEMPLE.fr ', membres)).toBe(true)
    expect(dejaDansLEquipe('autre@exemple.fr', membres)).toBe(false)
    expect(dejaDansLEquipe('', membres)).toBe(false)
  })

  it('dit pourquoi l’invitation ne peut pas partir, avant d’écrire', () => {
    expect(problemeInvitation('', membres, attente)).toBeNull()
    expect(problemeInvitation('pas-une-adresse', membres, attente)).toMatch(/ne ressemble pas/)
    expect(problemeInvitation('direction@exemple.fr', membres, attente)).toMatch(/déjà partie de votre équipe/)
    expect(problemeInvitation('ACCOMPAGNEMENT@exemple.fr', membres, attente)).toMatch(/relancez-la/)
    expect(problemeInvitation('nouvelle@exemple.fr', membres, attente)).toBeNull()
  })

  it('traduit les refus de la base', () => {
    expect(refusInvitationRevendeur('42501')).toMatch(/Seul un propriétaire/)
    expect(refusInvitationRevendeur('23505')).toMatch(/attend déjà cette adresse/)
    expect(refusInvitationRevendeur(undefined)).toMatch(/Réessayez/)
  })
})

describe('les coordonnées de support', () => {
  it('suivent les bornes de la base : deux à quatre-vingts caractères, une adresse bien formée', () => {
    expect(problemeCoordonnees({ nom: ' A ', courriel: '' })).toMatch(/au moins deux/)
    expect(problemeCoordonnees({ nom: 'x'.repeat(81), courriel: '' })).toMatch(/80 caractères/)
    expect(problemeCoordonnees({ nom: 'Shake', courriel: 'support@' })).toMatch(/ne ressemble pas/)
    expect(problemeCoordonnees({ nom: 'Shake', courriel: '' })).toBeNull()
    expect(problemeCoordonnees({ nom: 'Shake', courriel: 'support@exemple.fr' })).toBeNull()
  })

  it('s’écrivent sans espaces, et une adresse vide devient une absence', () => {
    expect(versLigneCoordonnees({ nom: '  Shake ', courriel: '  ' })).toEqual({ name: 'Shake', support_email: null })
    expect(versLigneCoordonnees({ nom: 'Shake', courriel: ' aide@exemple.fr ' })).toEqual({
      name: 'Shake',
      support_email: 'aide@exemple.fr',
    })
  })

  it('se prévisualisent dans la phrase exacte du bandeau de la praticienne', () => {
    expect(phraseDeContact({ nom: 'Shake', courriel: 'aide@exemple.fr' })).toBe(
      "Écrivez à votre revendeur, Shake, pour réactiver l'offre : aide@exemple.fr.",
    )
    expect(phraseDeContact({ nom: 'Shake', courriel: '' })).toBe(
      "Adressez-vous à votre revendeur, Shake, pour réactiver l'offre.",
    )
    expect(phraseDeContact({ nom: '', courriel: '' })).toBe("Adressez-vous à votre revendeur pour réactiver l'offre.")
  })

  it('reste la même phrase que ContactRevendeur : l’aperçu ne doit pas mentir', () => {
    const bandeau = lire('src', 'components', 'layout', 'BandeauContrat.tsx')
    expect(bandeau).toContain('Écrivez à votre revendeur, {revendeur.nom}, {pour} :')
    expect(bandeau).toContain('Adressez-vous à votre revendeur, {revendeur.nom}, {pour}.')
    expect(bandeau).toContain('Adressez-vous à votre revendeur {pour}.')
    expect(bandeau).toContain('pour="pour réactiver l\'offre"')
  })
})

describe('fermer un cabinet', () => {
  it('dit ce que la fermeture coupe, avant, et au bon nombre', () => {
    const douze = consequencesFermeture('Cabinet Fontaine', 12)
    expect(douze).toContain('ses 12 patients, qui ne pourront plus s')
    expect(douze).toContain("Rien n'est effacé")
    expect(douze).toMatch(/rouvrir le cabinet à tout moment/)
    expect(consequencesFermeture('C', 1)).toContain('son patient, qui ne pourra plus')
    expect(consequencesFermeture('C', 0)).toContain("l'espace de ses patients,")
  })

  it('traduit chaque mot de la base', () => {
    expect(messageFermeture('ok', 'Cabinet Fontaine', true)).toEqual({
      ok: true,
      message: expect.stringMatching(/^Cabinet Fontaine est fermé\./),
    })
    expect(messageFermeture('ok', 'Cabinet Fontaine', false).message).toMatch(/est rouvert/)
    // Déjà dans l'état voulu : ce n'est pas un échec, la liste relue le montrera.
    expect(messageFermeture('deja_ferme', 'C', true).ok).toBe(true)
    expect(messageFermeture('deja_ouvert', 'C', false).ok).toBe(true)
    expect(messageFermeture('pas_proprietaire', 'C', true)).toEqual({ ok: false, message: expect.stringMatching(/propriétaire/) })
    expect(messageFermeture('inconnu', 'C', true).ok).toBe(false)
    expect(messageFermeture(null, 'C', true).message).toMatch(/n'a pas pu être fermé/)
    expect(messageFermeture(null, 'C', false).message).toMatch(/n'a pas pu être rouvert/)
  })

  it('date la fermeture quand la base l’a datée', () => {
    expect(fermetureDite('2026-10-03T09:00:00Z')).toBe('Fermé depuis le 3 octobre 2026')
    expect(fermetureDite(null)).toBe('Fermé')
  })

  it('sort les cabinets fermés du portefeuille, sans rien perdre', () => {
    const rows = [
      { id: 'a', cabinet: { archived: false } },
      { id: 'b', cabinet: { archived: true } },
      { id: 'c', cabinet: { archived: false } },
    ]
    const { ouverts, fermes } = separerFermes(rows)
    expect(ouverts.map((r) => r.id)).toEqual(['a', 'c'])
    expect(fermes.map((r) => r.id)).toEqual(['b'])
  })

  it('entre au journal des contrats, en français', () => {
    const entree = (action: string): EntreeJournal => ({
      quand: '2026-10-03T09:00:00Z',
      action,
      cabinetId: 'k',
      cabinet: 'Cabinet Fontaine',
      meta: {},
      auteur: 'vous',
    })
    expect(phraseDuJournal(entree('cabinet.ferme'), (c) => c)).toBe('Cabinet Fontaine : cabinet fermé.')
    expect(phraseDuJournal(entree('cabinet.rouvert'), (c) => c)).toBe('Cabinet Fontaine : cabinet rouvert.')
  })
})

describe('les chiffres de la fiche', () => {
  it('arrondissent la dépense d’analyse au centime, sans jamais afficher de négatif', () => {
    expect(depenseAnalyseDite(1234.56)).toBe('12,35 €')
    expect(depenseAnalyseDite(null)).toBe('0,00 €')
    expect(depenseAnalyseDite(-3)).toBe('0,00 €')
    expect(depenseAnalyseDite(Number.NaN)).toBe('0,00 €')
  })

  it('comptent les praticiennes au pluriel juste', () => {
    expect(praticiennesDites(0)).toBe('Aucune praticienne')
    expect(praticiennesDites(1)).toBe('1 praticienne')
    expect(praticiennesDites(3)).toBe('3 praticiennes')
  })
})

describe('0057, lue dans son texte', () => {
  const migration = lire('supabase', 'migrations', '0057_le_revendeur_tient_son_equipe_et_ses_cabinets.sql')
  // Les commentaires disent POURQUOI ; seul le code compte ici.
  const code = migration.replace(/--[^\n]*/g, '')

  it('ne réévalue jamais l’appelant à chaque ligne dans une politique', () => {
    const politiques = code.match(/create policy[\s\S]*?;/g) ?? []
    expect(politiques.length).toBeGreaterThanOrEqual(6)
    for (const p of politiques) {
      expect(p.replace(/\(select auth\.uid\(\)\)/g, '')).not.toMatch(/auth\.uid\(\)/)
    }
  })

  it('laisse la praticienne dans son cabinet fermé : ses dossiers sont à elle', () => {
    // is_cabinet_member() est centrale et gardée par 0056 : 0057 n'y touche pas.
    expect(code).not.toMatch(/function public\.is_cabinet_member/)
    expect(code).not.toMatch(/function public\.est_titulaire_du_cabinet/)
  })

  it('ne rouvre au navigateur que deux colonnes de resellers', () => {
    expect(code).toMatch(/revoke insert, update, delete on public\.resellers from authenticated;/)
    expect(code).toMatch(/grant update \(name, support_email\) on public\.resellers to authenticated;/)
    expect(code).not.toMatch(/grant update[^;]*accueille_demandes/)
  })

  it('garde un index sous la clé étrangère des invitations d’équipe', () => {
    expect(code).toMatch(/create index if not exists reseller_invitations_reseller_idx\s+on public\.reseller_invitations \(reseller_id\)/)
  })

  it('ne touche pas aux fonctions de rappels que 0055 redéfinit', () => {
    // Les redéfinir ici écraserait 0055, appliquée avant : c'est à elle d'ajouter la condition.
    for (const f of ['rappels_a_pousser', 'declencher_rappels', 'rappels_du_soir_a_pousser', 'soirs_dus', 'generer_rappels_recurrents']) {
      expect(code).not.toMatch(new RegExp(`function public\\.${f}\\b`))
    }
  })
})

describe('les écrans, lus dans leur texte', () => {
  it('le portefeuille ouvre la fiche du cabinet, plus l’éditeur de marque', () => {
    const portefeuille = lire('src', 'views', 'reseller', 'CabinetPortfolio.tsx')
    expect(portefeuille).toMatch(/set\(\{ rSel: id, rView: 'fiche', rNotice: '' \}\)/)
  })

  it('le serveur n’envoie une invitation d’équipe qu’au propriétaire, dans la fonction existante', () => {
    const serveur = lire('server', 'invitations.ts')
    expect(serveur).toMatch(/demande === 'collaborateur'/)
    expect(serveur).toMatch(/appelant\.rpc\('is_reseller_owner'/)
    // Un cabinet fermé n'accepte personne : le serveur ne l'envoie pas non plus.
    expect(serveur).toMatch(/Ce cabinet est fermé/)
  })
})
