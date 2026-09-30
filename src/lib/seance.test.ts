import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { consentPoints } from '@/data/session'
import {
  AUCUN_CHOIX,
  DELAI_PURGE_JOURS,
  aSauver,
  brouillonAvecChoix,
  choixAGarder,
  separerChoix,
  ceQuiAEtePris,
  momentDuMessage,
  seanceEnCours,
} from './seance'

const ici = dirname(fileURLToPath(import.meta.url))
const lire = (chemin: string) => readFileSync(join(ici, chemin), 'utf8')
/**
 * Le texte que l'écran peut afficher, sans les commentaires : ceux-ci citent
 * volontiers l'ancienne promesse pour expliquer pourquoi elle est partie.
 */
const affichable = (chemin: string) =>
  lire(chemin)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const vide = { consent: false, transcript: '', sessionNotes: '', draft: null, sent: false }

describe('seanceEnCours', () => {
  it('rien de commencé : une séance neuve peut partir', () => {
    expect(seanceEnCours(vide)).toBe(false)
  })

  it('un consentement signé, un mot dicté ou un brouillon : on rejoint la séance', () => {
    expect(seanceEnCours({ ...vide, consent: true })).toBe(true)
    expect(seanceEnCours({ ...vide, transcript: 'bonjour' })).toBe(true)
    expect(seanceEnCours({ ...vide, sessionNotes: 'vigilance' })).toBe(true)
    expect(seanceEnCours({ ...vide, draft: { synthese: 'x' } })).toBe(true)
  })

  it('une séance envoyée n’est plus en cours, même avec tout encore à l’écran', () => {
    // Le défaut : « Nouvelle séance » ramenait au brouillon déjà envoyé.
    expect(
      seanceEnCours({ consent: true, transcript: 't', sessionNotes: 'n', draft: { synthese: 'x' }, sent: true }),
    ).toBe(false)
  })
})

describe('aSauver', () => {
  it('rien à écrire tant que rien n’a été pris', () => {
    expect(aSauver({ transcript: '', notes: '  ' }, null)).toBe(false)
  })

  it('la première matière s’écrit', () => {
    expect(aSauver({ transcript: 'bonjour', notes: '' }, null)).toBe(true)
  })

  it('un texte inchangé ne se réécrit pas, même si le minuteur a tourné', () => {
    const t = { transcript: 'bonjour', notes: 'note' }
    expect(aSauver({ ...t }, t)).toBe(false)
  })

  it('une phrase de plus, une note de plus : on écrit', () => {
    const avant = { transcript: 'bonjour', notes: '' }
    expect(aSauver({ transcript: 'bonjour\nça va', notes: '' }, avant)).toBe(true)
    expect(aSauver({ transcript: 'bonjour', notes: 'mot du patient' }, avant)).toBe(true)
  })

  it('un texte effacé à l’écran s’efface aussi en base', () => {
    expect(aSauver({ transcript: '', notes: '' }, { transcript: 'bonjour', notes: '' })).toBe(true)
  })
})

describe('momentDuMessage', () => {
  it('avant 20 h : le soir même, à 20 h', () => {
    const m = momentDuMessage(new Date('2026-09-28T15:10:00'))
    expect(m.quand.getDate()).toBe(28)
    expect(m.quand.getHours()).toBe(20)
    expect(m.immediat).toBe(false)
    expect(m.dit).toBe('ce soir à 20 h')
  })

  it('entre 20 h et 22 h : tout de suite, c’est encore le soir', () => {
    const maintenant = new Date('2026-09-28T20:40:00')
    const m = momentDuMessage(maintenant)
    expect(m.immediat).toBe(true)
    expect(m.quand.getTime()).toBe(maintenant.getTime())
  })

  it('passé 22 h : le lendemain matin, pas au milieu de la nuit', () => {
    const m = momentDuMessage(new Date('2026-09-28T22:30:00'))
    expect(m.quand.getDate()).toBe(29)
    expect(m.quand.getHours()).toBe(8)
    expect(m.immediat).toBe(false)
  })

  it('jamais dans le passé : une notification en retard ne part pas', () => {
    for (const h of ['08:00', '19:59', '20:00', '21:59', '22:00', '23:59']) {
      const maintenant = new Date(`2026-09-28T${h}:00`)
      expect(momentDuMessage(maintenant).quand.getTime()).toBeGreaterThanOrEqual(maintenant.getTime())
    }
  })
})

describe('ceQuiAEtePris', () => {
  it('nomme ce que la séance contient', () => {
    expect(ceQuiAEtePris({ transcript: 'un deux trois', notes: 'n', aUnBrouillon: true })).toBe(
      '3 mots transcrits, vos notes et un brouillon déjà rédigé',
    )
  })

  it('accorde au singulier', () => {
    expect(ceQuiAEtePris({ transcript: 'bonjour', notes: '', aUnBrouillon: false })).toBe('1 mot transcrit')
  })

  it('les notes seules', () => {
    expect(ceQuiAEtePris({ transcript: ' ', notes: 'vigilance', aUnBrouillon: false })).toBe('vos notes')
  })
})

/**
 * Le consentement est lu au patient avant d'enregistrer. Il a menti deux
 * fois sur le trajet du son et du texte : ces gardes, sur le texte même,
 * empêchent qu'une réécriture le fasse mentir de nouveau sans que personne
 * le voie.
 */
describe('le consentement dit le vrai trajet des données', () => {
  const points = consentPoints('Marc').join('\n')

  it('ne prétend plus que le son n’est « stocké nulle part » ni « détruit »', () => {
    expect(points).not.toMatch(/nulle part/i)
    expect(points).not.toMatch(/détruit/i)
  })

  it('nomme l’éditeur du navigateur, qui reçoit la voix', () => {
    expect(points).toMatch(/navigateur/)
    expect(points).toMatch(/Google/)
    expect(points).toMatch(/Microsoft/)
    expect(points).toMatch(/Apple/)
  })

  it('dit que le texte part chez Anthropic, aux États-Unis', () => {
    expect(points).toMatch(/Anthropic, aux États-Unis/)
  })

  it('situe la base à Paris sans revendiquer d’agrément HDS', () => {
    expect(points).toMatch(/Paris/)
    expect(points).not.toMatch(/hébergé en France/i)
    expect(points).toMatch(/Aucune certification d'hébergeur de données de santé \(HDS\) n'est revendiquée/)
  })

  it('annonce le délai de purge que la base applique', () => {
    expect(points).toContain(`${DELAI_PURGE_JOURS} jours`)
    const migration = lire('../../supabase/migrations/0043_la_seance_se_referme.sql')
    expect(migration).toContain(`interval '${DELAI_PURGE_JOURS} days'`)
  })

  it('n’impose pas de genre à qui mène la séance', () => {
    expect(points).not.toMatch(/sa thérapeute|la thérapeute/)
  })
})

describe("l'écran de séance ne promet plus ce qu'il ne fait pas", () => {
  const captation = affichable('../views/session/RecordStep.tsx')
  const vue = affichable('../views/session/SessionView.tsx')
  const brouillon = affichable('../views/session/DraftStep.tsx')

  it('plus de séance d’exemple, qui n’existe pas', () => {
    expect(captation).not.toMatch(/séance d'exemple/)
    expect(affichable('../../server/ai.ts')).not.toMatch(/séance d'exemple/)
  })

  it('plus de segments de quinze minutes « envoyés au fur et à mesure »', () => {
    expect(captation).not.toMatch(/segments de quinze minutes/)
  })

  it('plus de « texte chiffré » ni de « Modifiez librement »', () => {
    expect(vue).not.toMatch(/Seul le texte, chiffré/)
    expect(vue).not.toMatch(/Modifiez librement/)
  })

  it('plus de taux de réalisation doublé, que rien n’établit', () => {
    expect(brouillon).not.toMatch(/double le taux/)
  })

  it('l’envoi passe par la fonction qui refuse une séance déjà close', () => {
    const cabinet = lire('../cabinet/useCabinet.ts')
    expect(cabinet).toContain("rpc('cabinet_envoyer_seance'")
  })

  /* LA RÈGLE DU MICRO. Pendant une séance sans transcription, rien n'est
     enregistré ; le champ des notes a un micro quand le consentement est
     signé (la praticienne dicte ses propres notes), aucun dans une séance
     ouverte sans enregistrement (le patient peut être là). Après la séance,
     les champs du brouillon gardent le leur : c'est elle qui dicte. Aucun
     écran ne promet donc « pas de micro » : il promet que rien de la séance
     ne s'enregistre. */
  it('une séance sans transcription promet « rien n’est enregistré », pas « pas de micro »', () => {
    const consentement = affichable('../views/session/ConsentStep.tsx')
    for (const texte of [vue, captation, consentement]) {
      expect(texte).not.toMatch(/Pas de micro/i)
      expect(texte).not.toMatch(/Aucun micro/i)
      expect(texte).not.toMatch(/micro reste fermé/i)
    }
    expect(vue).toMatch(/Rien n'est enregistré pendant la\s+séance/)
    expect(consentement).toMatch(/Rien n'est enregistré pendant la\s+séance/)
    expect(captation).toMatch(/Rien n'est enregistré pendant la\s+séance/)
  })

  it('le champ des notes n’a pas de micro dans une séance ouverte sans enregistrement', () => {
    expect(lire('../views/session/RecordStep.tsx')).toContain('dictee={state.sansEnregistrement ? undefined : !state.recording}')
  })
})

/* Un champ démonté après « Garder en brouillon » annonce encore la fin de
   sa dictée : le magasin est déjà vidé. Ses choix par défaut ne doivent pas
   écraser ceux qu'elle vient de garder. */
describe('choixAGarder — les choix d’une écriture tardive', () => {
  const siens = { proposalOff: { 1: true }, sugOff: { a1: true }, syntheseOk: true }
  const rendu = { sessionId: 's1', ...siens }

  it('le magasin fait foi tant qu’il est sur la même séance', () => {
    const courant = { sessionId: 's1', draft: {} as never, proposalOff: { 2: true }, sugOff: {}, syntheseOk: false }
    expect(choixAGarder(courant, rendu)).toEqual({ proposalOff: { 2: true }, sugOff: {}, syntheseOk: false })
  })

  it('le magasin vidé (nouvelleSeance) : les choix du rendu, pas les défauts', () => {
    const vide = { sessionId: null, draft: null, ...AUCUN_CHOIX }
    expect(choixAGarder(vide, rendu)).toEqual(siens)
  })

  it('le brouillon retiré (« Reprendre ») : les choix du rendu', () => {
    const sansBrouillon = { sessionId: 's1', draft: null, ...AUCUN_CHOIX }
    expect(choixAGarder(sansBrouillon, rendu)).toEqual(siens)
  })
})

/* Un brouillon gardé pour plus tard garde ce que la praticienne a écarté :
   repris, il ne doit pas reproposer, cochés, les modules qu'elle refusait. */
describe('brouillonAvecChoix / separerChoix — les choix voyagent avec le brouillon', () => {
  const draft = { synthese: 'S', message: 'M', propositions: [] } as never

  it('aller et retour : les choix reviennent, et le brouillon rendu n’en porte plus trace', () => {
    const garde = brouillonAvecChoix(draft, { proposalOff: { 1: true, 2: false }, sugOff: { a1: true }, syntheseOk: true })
    const { draft: relu, choix } = separerChoix(garde)
    expect(choix).toEqual({ proposalOff: { 1: true }, sugOff: { a1: true }, syntheseOk: true })
    expect(relu).toEqual(draft)
    expect(Object.keys(relu as object)).not.toContain('choix_praticienne')
  })

  it('un brouillon d’avant, sans choix : aucun choix', () => {
    expect(separerChoix(draft)).toEqual({ draft, choix: AUCUN_CHOIX })
    expect(separerChoix(null)).toEqual({ draft: null, choix: AUCUN_CHOIX })
  })

  it('des choix mal formés sont ignorés, pas crus', () => {
    const bizarre = { ...(draft as object), choix_praticienne: { proposalOff: { x: true, 3: 'oui', 4: true }, sugOff: [1], syntheseOk: 'vrai' } } as never
    expect(separerChoix(bizarre).choix).toEqual({ proposalOff: { 4: true }, sugOff: {}, syntheseOk: false })
  })
})
