import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MOT_MASQUE,
  QUESTION_DU_SOIR_PAR_DEFAUT,
  SOIR_EN_CLAIR_TITRE,
  SOIR_MASQUE,
  texteAAfficher,
} from './discretion'
import {
  DUREE_MAX_JOURS,
  HEURE_DU_SOIR_PAR_DEFAUT,
  JOURS_DE_LA_SEMAINE,
  LIMITE_TEXTE,
  LIMITE_TITRE,
  dateDite,
  etatRappel,
  finParDefaut,
  heureDeParis,
  heureDite,
  heureDuChamp,
  jourDit,
  jourIso,
  libelleRecurrence,
  mentionFuseau,
  messageRefusRappel,
  phraseDestinataires,
  phrasePremierEnvoi,
  phrasePremierSoir,
  phraseProchainEnvoi,
  preferencesDepuisLigne,
  prochainEnvoi,
  rappelsDepuisLignes,
  rappelsOrdonnes,
  refusRappel,
  type RappelRegulier,
  type SaisieRappel,
} from './rappelsReguliers'

/* Mardi 29 septembre 2026, 10 h à Paris (heure d'été : UTC+2). */
const MARDI_10H = new Date('2026-09-29T08:00:00Z')

function rappel(partiel: Partial<RappelRegulier> = {}): RappelRegulier {
  return {
    id: 'r1',
    titre: 'Respiration',
    texte: 'Trois respirations lentes.',
    jourSemaine: null,
    heure: '09:00',
    finLe: '2026-10-27',
    creeLe: '2026-09-20T08:00:00Z',
    annuleLe: null,
    destinataires: [{ id: 'a', nom: 'Anna', clos: false }],
    ...partiel,
  }
}

function saisie(partiel: Partial<SaisieRappel> = {}): SaisieRappel {
  return {
    titre: 'Respiration',
    texte: 'Trois respirations lentes.',
    frequence: 'jour',
    jourSemaine: 1,
    heure: '20:30',
    finLe: '2026-10-27',
    patients: ['a'],
    ...partiel,
  }
}

describe('les heures', () => {
  /* Un champ d'heure rend parfois les secondes, parfois une saisie à moitié
     faite : la base n'accepte que « HH:MM ». */
  it('normalise ce que rend un champ d’heure, et refuse l’illisible', () => {
    expect(heureDuChamp('20:30')).toBe('20:30')
    expect(heureDuChamp('20:30:00')).toBe('20:30')
    expect(heureDuChamp(' 07:05 ')).toBe('07:05')
    for (const brut of ['', '9:30', '24:00', '20:60', '20h30', null, undefined]) {
      expect({ [String(brut)]: heureDuChamp(brut) }).toEqual({ [String(brut)]: null })
    }
  })

  it('dit l’heure comme on la dit en français', () => {
    expect(heureDite('20:30')).toBe('20 h 30')
    expect(heureDite('09:00')).toBe('9 h')
    expect(heureDite('09:05')).toBe('9 h 05')
  })

  it('lit l’heure de Paris, en été comme en hiver', () => {
    expect(heureDeParis(new Date('2026-07-15T18:30:00Z'))).toBe('20:30')
    expect(heureDeParis(new Date('2026-01-15T19:30:00Z'))).toBe('20:30')
    expect(heureDeParis(new Date('2026-01-15T23:05:00Z'))).toBe('00:05')
  })

  it('ne précise « heure de Paris » que pour un navigateur qui n’y est pas', () => {
    expect(mentionFuseau('Europe/Paris')).toBe('')
    expect(mentionFuseau(undefined)).toBe('')
    expect(mentionFuseau('America/Montreal')).toBe(' (heure de Paris)')
  })
})

describe('les jours', () => {
  it('reconnaît le jour de la semaine, lundi = 1, dimanche = 7', () => {
    expect(jourIso('2026-09-28')).toBe(1)
    expect(jourIso('2026-09-29')).toBe(2)
    expect(jourIso('2026-10-04')).toBe(7)
  })

  it('dit les jours proches par leur nom', () => {
    expect(jourDit('2026-09-29', '2026-09-29')).toBe("aujourd'hui")
    expect(jourDit('2026-09-30', '2026-09-29')).toBe('demain')
    expect(jourDit('2026-10-05', '2026-09-29')).toBe('lundi 5 octobre')
    expect(dateDite('2026-10-27')).toBe('27 octobre 2026')
  })

  /* Le libellé que la base écrit dans le journal des envois : la liste des
     rappels et le journal doivent se reconnaître. */
  it('écrit la récurrence comme la base l’écrit', () => {
    expect(libelleRecurrence(null, '09:00')).toBe('Chaque jour, 9 h')
    expect(libelleRecurrence(1, '09:30')).toBe('Chaque lundi, 9 h 30')
    expect(libelleRecurrence(7, '18:05')).toBe('Chaque dimanche, 18 h 05')
  })
})

describe('le prochain envoi', () => {
  it('part aujourd’hui si l’heure n’est pas passée, demain sinon', () => {
    expect(prochainEnvoi(rappel({ heure: '11:00' }), MARDI_10H)).toBe('2026-09-29')
    expect(prochainEnvoi(rappel({ heure: '09:00' }), MARDI_10H)).toBe('2026-09-30')
    // L'heure même : le passage de la minute est peut-être déjà passé.
    expect(prochainEnvoi(rappel({ heure: '10:00' }), MARDI_10H)).toBe('2026-09-30')
  })

  it('attend le bon jour de la semaine', () => {
    expect(prochainEnvoi(rappel({ jourSemaine: 1 }), MARDI_10H)).toBe('2026-10-05')
    expect(prochainEnvoi(rappel({ jourSemaine: 2, heure: '18:00' }), MARDI_10H)).toBe('2026-09-29')
    expect(prochainEnvoi(rappel({ jourSemaine: 2, heure: '08:00' }), MARDI_10H)).toBe('2026-10-06')
  })

  it('ne promet rien après la date de fin, ni une fois arrêté', () => {
    expect(prochainEnvoi(rappel({ finLe: '2026-09-29', heure: '09:00' }), MARDI_10H)).toBeNull()
    expect(prochainEnvoi(rappel({ finLe: '2026-10-04', jourSemaine: 1 }), MARDI_10H)).toBeNull()
    expect(prochainEnvoi(rappel({ annuleLe: '2026-09-28T10:00:00Z' }), MARDI_10H)).toBeNull()
  })

  it('dit où en est chaque rappel', () => {
    expect(etatRappel(rappel(), MARDI_10H)).toBe('en-cours')
    expect(etatRappel(rappel({ finLe: '2026-09-28' }), MARDI_10H)).toBe('termine')
    expect(etatRappel(rappel({ annuleLe: '2026-09-28T10:00:00Z' }), MARDI_10H)).toBe('arrete')
    expect(phraseProchainEnvoi(rappel({ heure: '09:30' }), MARDI_10H)).toBe(
      "Prochain envoi : demain, 9 h 30. Jusqu'au 27 octobre 2026.",
    )
    expect(phraseProchainEnvoi(rappel({ finLe: '2026-09-28' }), MARDI_10H)).toBe('Terminé le 28 septembre 2026.')
    expect(phraseProchainEnvoi(rappel({ annuleLe: 'x' }), MARDI_10H)).toBe('Arrêté : il ne partira plus.')
  })

  /* Un rappel en cours dont tous les suivis sont clos n'écrit plus rien : la
     base le tait, l'écran doit le dire plutôt qu'annoncer un envoi. */
  it('dit qu’il n’y a plus personne quand tous les suivis choisis sont clos', () => {
    const r = rappel({ destinataires: [{ id: 'a', nom: 'Anna', clos: true }] })
    expect(phraseProchainEnvoi(r, MARDI_10H)).toMatch(/Plus personne/)
  })

  it('range les rappels en cours d’abord, le plus proche en tête', () => {
    const ordre = rappelsOrdonnes(
      [
        rappel({ id: 'arrete', annuleLe: 'x' }),
        rappel({ id: 'lundi', jourSemaine: 1 }),
        rappel({ id: 'fini', finLe: '2026-09-01' }),
        rappel({ id: 'ce-soir', heure: '20:00' }),
      ],
      MARDI_10H,
    ).map((r) => r.id)
    expect(ordre).toEqual(['ce-soir', 'lundi', 'fini', 'arrete'])
  })
})

describe('la lecture des rappels du cabinet', () => {
  it('met les lignes de la base à la forme de l’écran', () => {
    const lus = rappelsDepuisLignes([
      {
        id: 'r1',
        title: 'Respiration',
        body: 'Trois respirations.',
        jour_semaine: 1,
        heure: '09:30:00',
        fin_le: '2026-10-27',
        created_at: '2026-09-20T08:00:00Z',
        annule_le: null,
        destinataires: [
          { patient_id: 'b', patient: { display_name: 'Bea', archived_at: '2026-09-25T08:00:00Z' } },
          { patient_id: 'a', patient: { display_name: 'Anna', archived_at: null } },
        ],
      },
    ])
    expect(lus).toEqual([
      {
        id: 'r1',
        titre: 'Respiration',
        texte: 'Trois respirations.',
        jourSemaine: 1,
        heure: '09:30',
        finLe: '2026-10-27',
        creeLe: '2026-09-20T08:00:00Z',
        annuleLe: null,
        destinataires: [
          { id: 'a', nom: 'Anna', clos: false },
          { id: 'b', nom: 'Bea', clos: true },
        ],
      },
    ])
  })

  it('écarte une ligne à l’heure illisible, et tient sans destinataires', () => {
    const base = { id: 'r', title: 't', body: 'b', jour_semaine: null, fin_le: '2026-10-27', created_at: 'x', annule_le: null }
    expect(rappelsDepuisLignes([{ ...base, heure: 'n’importe' }])).toEqual([])
    expect(rappelsDepuisLignes([{ ...base, heure: '20:00:00', destinataires: null }])[0].destinataires).toEqual([])
    expect(rappelsDepuisLignes(null)).toEqual([])
  })
})

describe('les destinataires', () => {
  it('nomme les premiers, compte les autres, et dit les suivis clos', () => {
    const d = (nom: string, clos = false) => ({ id: nom, nom, clos })
    expect(phraseDestinataires([d('Anna')])).toBe('Anna')
    expect(phraseDestinataires([d('Anna'), d('Bea'), d('Cleo'), d('Dan'), d('Eve')])).toBe('Anna, Bea, Cleo et 2 autres')
    expect(phraseDestinataires([d('Anna'), d('Bea', true)])).toBe('Anna (1 suivi clos, sans envoi)')
    expect(phraseDestinataires([d('Bea', true)])).toBe('Personne (1 suivi clos, sans envoi)')
  })
})

describe('la saisie', () => {
  it('accepte un rappel complet, et annonce son premier envoi', () => {
    expect(refusRappel(saisie(), MARDI_10H)).toBeNull()
    expect(phrasePremierEnvoi(saisie(), MARDI_10H)).toBe("Premier envoi : aujourd'hui, 20 h 30.")
    expect(phrasePremierEnvoi(saisie({ frequence: 'semaine', jourSemaine: 1, heure: '09:00' }), MARDI_10H)).toBe(
      'Premier envoi : lundi 5 octobre, 9 h.',
    )
  })

  it('refuse avec les mots de la base', () => {
    expect(refusRappel(saisie({ texte: '   ' }), MARDI_10H)).toBe('Écrivez le mot qui partira.')
    expect(refusRappel(saisie({ texte: 'x'.repeat(LIMITE_TEXTE + 1) }), MARDI_10H)).toMatch(/1 000 caractères/)
    expect(refusRappel(saisie({ titre: 'x'.repeat(LIMITE_TITRE + 1) }), MARDI_10H)).toMatch(/120 caractères/)
    expect(refusRappel(saisie({ heure: '' }), MARDI_10H)).toBe("Choisissez une heure d'envoi.")
    expect(refusRappel(saisie({ frequence: 'semaine', jourSemaine: 0 }), MARDI_10H)).toBe('Choisissez le jour de la semaine.')
    expect(refusRappel(saisie({ finLe: '' }), MARDI_10H)).toBe('Choisissez une date de fin.')
    expect(refusRappel(saisie({ finLe: '2026-09-28' }), MARDI_10H)).toMatch(/déjà passée/)
    expect(refusRappel(saisie({ finLe: '2027-10-01' }), MARDI_10H)).toMatch(/un an au plus/)
    expect(refusRappel(saisie({ patients: [] }), MARDI_10H)).toBe('Choisissez au moins une personne.')
  })

  /* La base accepterait un rappel qui n'enverra jamais rien ; la thérapeute
     le croirait en route. */
  it('refuse un rappel qui n’enverrait rien', () => {
    expect(refusRappel(saisie({ finLe: '2026-09-29', heure: '09:00' }), MARDI_10H)).toMatch(/Aucun envoi/)
    expect(refusRappel(saisie({ finLe: '2026-10-04', frequence: 'semaine', jourSemaine: 1 }), MARDI_10H)).toMatch(
      /Aucun envoi/,
    )
    // Le même jour, plus tard : il part ce soir.
    expect(refusRappel(saisie({ finLe: '2026-09-29', heure: '20:30' }), MARDI_10H)).toBeNull()
  })

  it('propose quatre semaines, dans la limite d’un an', () => {
    expect(finParDefaut(MARDI_10H)).toBe('2026-10-27')
    expect(DUREE_MAX_JOURS).toBe(366)
  })

  it('montre les refus de la base tels quels, et traduit le reste', () => {
    expect(messageRefusRappel('Choisissez au moins une personne.')).toBe('Choisissez au moins une personne.')
    expect(messageRefusRappel("Une des fiches choisies n'est pas un suivi en cours de ce cabinet.")).toMatch(/^Une des fiches/)
    expect(messageRefusRappel('Could not find the function public.cabinet_programmer_rappel in the schema cache')).toMatch(
      /pas encore ouverts/,
    )
    expect(messageRefusRappel('Failed to fetch')).toMatch(/Réessayez/)
    expect(messageRefusRappel(undefined)).toMatch(/Réessayez/)
  })
})

describe('le rappel du soir', () => {
  /* Une réponse vide est un refus, pas des réglages vierges ; un réglage
     illisible vaut masqué. */
  it('lit les réglages de la base sans rien supposer de rassurant', () => {
    expect(preferencesDepuisLigne([{ masquer_contenu: false, soir_actif: true, soir_heure: '21:15' }])).toEqual({
      masquerContenu: false,
      soirActif: true,
      soirHeure: '21:15',
    })
    expect(preferencesDepuisLigne([{ masquer_contenu: null, soir_actif: null, soir_heure: null }])).toEqual({
      masquerContenu: true,
      soirActif: false,
      soirHeure: '20:30',
    })
    expect(preferencesDepuisLigne([])).toBeNull()
    expect(preferencesDepuisLigne(null)).toBeNull()
  })

  it('annonce le premier soir selon l’heure qu’il est à Paris', () => {
    expect(phrasePremierSoir('20:30', MARDI_10H)).toBe("Premier rappel aujourd'hui à 20 h 30, sauf si votre note est déjà prise.")
    expect(phrasePremierSoir('08:00', MARDI_10H)).toMatch(/^Premier rappel demain à 8 h/)
    expect(phrasePremierSoir('n’importe', MARDI_10H)).toBe('')
    expect(HEURE_DU_SOIR_PAR_DEFAUT).toBe('20:30')
  })
})

describe('la discrétion sur l’écran verrouillé', () => {
  /* Seul un « non » explicite montre le contenu : une base plus ancienne,
     une ligne mal lue, et c'est le texte neutre qui part. */
  it('masque par défaut, et ne montre que sur un choix explicite', () => {
    const mot = { titre: 'Crises du soir', corps: 'Votre exercice.' }
    expect(texteAAfficher({ ...mot, masque: true })).toEqual(MOT_MASQUE)
    expect(texteAAfficher({ ...mot })).toEqual(MOT_MASQUE)
    expect(texteAAfficher({ ...mot, masque: null })).toEqual(MOT_MASQUE)
    expect(texteAAfficher({ ...mot, masque: false })).toEqual(mot)
    expect(texteAAfficher({ ...mot }, SOIR_MASQUE)).toEqual(SOIR_MASQUE)
  })

  it('ne laisse rien paraître du suivi dans les textes neutres', () => {
    for (const t of [MOT_MASQUE, SOIR_MASQUE]) {
      expect(`${t.titre} ${t.corps}`).not.toMatch(/th[ée]rap|hypno|s[ée]ance|soin|suivi|note|humeur|angoisse/i)
    }
  })
})

/* LA BASE ET L'ÉCRAN DISENT LA MÊME CHOSE. Les textes neutres sont posés par
   la base (le contenu masqué n'en sort pas), repris par le serveur, montrés
   en aperçu à la personne : s'ils divergeaient, l'aperçu mentirait. Même
   exigence pour les jours, l'heure et les bornes que l'écran vérifie avant
   la base. */
describe('0055 et ce fichier', () => {
  const ici = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(
    join(ici, '..', '..', 'supabase', 'migrations', '0055_les_rappels_reviennent_et_se_taisent.sql'),
    'utf8',
  )
  const enSql = (texte: string) => `'${texte.replace(/'/g, "''")}'`

  it('porte les mêmes textes neutres', () => {
    for (const texte of [
      MOT_MASQUE.titre,
      MOT_MASQUE.corps,
      SOIR_MASQUE.titre,
      SOIR_MASQUE.corps,
      SOIR_EN_CLAIR_TITRE,
      QUESTION_DU_SOIR_PAR_DEFAUT,
    ]) {
      expect({ [texte]: sql.includes(enSql(texte)) }).toEqual({ [texte]: true })
    }
  })

  it('nomme les jours dans le même ordre, et lit l’heure de la même façon', () => {
    expect(sql).toContain(`array[${JOURS_DE_LA_SEMAINE.map((j) => `'${j}'`).join(', ')}]`)
    expect(sql).toContain("'^([01][0-9]|2[0-3]):[0-5][0-9]$'")
    expect(sql).toContain(`time '${HEURE_DU_SOIR_PAR_DEFAUT}'`)
  })

  it('borne le texte, le titre et la durée comme l’écran', () => {
    expect(sql).toContain(`between 1 and ${LIMITE_TEXTE})`)
    expect(sql).toContain(`between 1 and ${LIMITE_TITRE})`)
    expect(sql).toContain(`v_aujourdhui + ${DUREE_MAX_JOURS}`)
  })
})
