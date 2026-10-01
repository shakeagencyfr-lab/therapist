/**
 * Schémas des quatre sorties IA, et types des corps de requête.
 *
 * Les schémas zod servent aux sorties structurées de l'API Claude
 * (`output_config.format`) : le modèle est contraint de répondre dans cette
 * forme et le SDK renvoie l'objet déjà analysé dans `parsed_output`. C'est le
 * gain par rapport au prototype, qui extrayait le JSON de la réponse avec une
 * expression régulière (`out.match(/\{[\s\S]*\}/)`) avant de l'analyser — une
 * étape qui pouvait échouer sur une phrase d'introduction ou une balise de code.
 *
 * Le contexte patient n'est PAS redéfini ici : client et serveur lisent la même
 * définition dans src/types/domain.ts, importée en « import type » — effacée à
 * la compilation, donc sans effet sur ce que le serveur charge à l'exécution.
 */
import { z } from 'zod'
import { TYPES_PROPOSABLES } from '../src/lib/typesDeModules.js'
import type {
  GeneratedAffirmations,
  GeneratedModule,
  GeneratedProfile,
  ModuleKind,
  PatientContext,
  SessionDraft,
} from '../src/types/domain.js'

export type { PatientContext }

/* ------------------------------------------------------------------ *
 * Corps de requête
 * ------------------------------------------------------------------ */

export interface SessionDraftBody {
  context: PatientContext
  transcript: string
  notes: string
  /** Les rayons de la bibliothèque d'audios du cabinet. */
  categories: string[]
}

/** Brief de l'atelier de modules. */
export interface ModuleContext {
  intent: string
  type: ModuleKind
  quiz: boolean
  /**
   * Le dossier de la personne à qui ce module est destiné, s'il y en a une.
   *
   * Facultatif à dessein : l'atelier sert aussi à fabriquer un module
   * générique qu'on assigne ensuite à plusieurs patients. Quand il est
   * présent, le module est écrit pour quelqu'un — c'est ce qui sépare un
   * exercice de manuel d'un exercice qui tombe juste.
   */
  context?: PatientContext
}

export interface AffirmationsBody {
  context: PatientContext
}

export interface HypnoseBody {
  /** Absent ou null : une hypnose de la bibliothèque du cabinet (0071). */
  context: PatientContext | null
  mouvement: string
  mots: string[]
  themes: string[]
  synthese: string
  intention: string
  precedents: Array<{ mouvement: string; texte: string }>
}

export interface ProfileBody {
  context: PatientContext
  notes: string
  synthese: string
  transcript: string
}

/* ------------------------------------------------------------------ *
 * Lecture du dossier reçu
 * ------------------------------------------------------------------ */

/*
 * LE DOSSIER ÉTAIT CRU SUR PAROLE. Le corps était vérifié « objet », puis
 * converti en PatientContext sans rien regarder : un champ absent ou d'un
 * autre type — un onglet resté ouvert sur une version précédente de
 * l'application, qui n'envoie pas encore un champ que les prompts lisent —
 * levait un TypeError au milieu d'un prompt, et la thérapeute lisait
 * « Erreur interne du serveur ». Chaque champ est maintenant lu : absent, il
 * prend sa valeur vide ; d'un mauvais type, la requête est refusée en le
 * disant.
 *
 * BORNÉ SANS REFUS. Ce que le dossier accumule — journal, parcours, pages
 * partagées, notes du soir — grossit à chaque semaine de suivi : le refuser
 * au-delà d'une taille rendrait un patient fidèle impossible à analyser. On
 * en garde le plus récent, bien au-delà de ce que les prompts citent, et le
 * reste est coupé : un corps démesuré ne devient jamais une facture
 * démesurée. (Ce que la thérapeute tape elle-même est borné AVEC refus, dans
 * server/ai.ts : là, couper en silence trahirait ce qu'elle a demandé.)
 */

/** Une chaîne coupée à `max` caractères, sans refus. */
const texte = (max: number) => z.string().transform((s) => s.slice(0, max))
/** Un libellé : un titre, une date, un nom de programme. */
const ligne = texte(300)

const axeLuSchema = z.object({ label: ligne, value: z.number(), note: ligne })

const profilLuSchema = z.object({
  updated: ligne.default(''),
  portrait: texte(8000).default(''),
  axes: z.array(axeLuSchema).default([]).transform((a) => a.slice(0, 12)),
  levers: z
    .array(z.object({ title: ligne, body: texte(2000) }))
    .default([])
    .transform((a) => a.slice(0, 12)),
  dynamique: texte(4000).optional(),
  alliance: texte(4000).optional(),
  care: z.array(texte(1000)).default([]).transform((a) => a.slice(0, 12)),
  resume: texte(1000).optional(),
  /* Les versions passées nourrissent la « dynamique » : le profil qui se
     révise voit d'où il vient. Les douze dernières suffisent. */
  historique: z
    .array(z.object({ version: z.number(), sessions: z.number(), axes: z.array(axeLuSchema) }))
    .optional()
    .transform((a) => a?.slice(-12)),
})

/**
 * Le dossier du patient, tel que le serveur accepte de le lire.
 *
 * Les champs inconnus sont écartés : rien de ce que le client ajouterait ne
 * part vers le modèle sans être passé par ici.
 */
export const contexteLuSchema = z.object({
  name: texte(200),
  program: ligne.default(''),
  subtitle: ligne.default(''),
  weekLabel: ligne.default(''),
  sessions: z.number().default(0),
  totalSessions: z.number().default(0),
  adherence: z.number().default(0),
  scaleLabel: ligne.default(''),
  scaleQuestion: ligne.default(''),
  scaleDelta: ligne.default(''),
  // Un mois de soirées au plus ; le client en envoie deux semaines
  // (src/lib/echelle.ts). Une note hors de 0–10 n'est pas une note.
  echelle: z
    .array(z.object({ date: ligne, valeur: z.number().min(0).max(10) }))
    .default([])
    .transform((a) => a.slice(-31)),
  // Le parcours va du plus ancien au plus récent : on garde la fin.
  modules: z
    .array(z.object({ title: ligne, done: z.boolean() }))
    .default([])
    .transform((a) => a.slice(-80)),
  // Le journal va du plus récent au plus ancien : on garde le début.
  journal: z
    .array(z.object({ date: ligne, text: texte(4000) }))
    .default([])
    .transform((a) => a.slice(0, 60)),
  shared: texte(6000).default(''),
  // Un patient sans profil : l'objet vide passe par le schéma, qui le remplit
  // de ses valeurs vides (`prefault`, et non `default`, qui l'accepterait tel
  // quel sans le lire).
  profile: profilLuSchema.prefault({}),
})

/* ------------------------------------------------------------------ *
 * Schémas de sortie
 * ------------------------------------------------------------------ */

/**
 * Les types de modules que le brouillon de séance peut proposer.
 *
 * Ni « Audio » ni « Échelle » : l'espace du patient ne les montre jamais
 * comme une tâche, il ne pouvait donc jamais les faire (src/lib/typesDeModules.ts).
 * Contraint ici, dans le format de sortie, le modèle ne peut plus en rendre.
 */
const proposalKindSchema = z.enum(TYPES_PROPOSABLES)

const quizSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correct: z.number().int(),
  feedback: z.string(),
})

export const sessionDraftSchema = z.object({
  synthese: z.string(),
  mots: z.array(z.string()),
  themes: z.array(z.string()),
  propositions: z.array(
    z.object({
      titre: z.string(),
      pourquoi: z.string(),
      type: proposalKindSchema,
    }),
  ),
  questions: z.array(z.string()),
  vigilance: z.array(z.object({ point: z.string(), conduite: z.string() })),
  categories_audio: z.array(z.object({ categorie: z.string(), pourquoi: z.string() })),
  message: z.string(),
})

export const generatedModuleSchema = z.object({
  titre: z.string(),
  duree: z.string(),
  quand: z.string(),
  steps: z.array(z.string()),
  pourquoi: z.string(),
  quiz: z.array(quizSchema),
})

export const generatedAffirmationsSchema = z.object({
  affirmations: z.array(z.string()),
})

export const generatedProfileSchema = z.object({
  portrait: z.string(),
  axes: z.array(
    z.object({
      label: z.string(),
      value: z.number().int(),
      note: z.string(),
    }),
  ),
  levers: z.array(z.object({ title: z.string(), body: z.string() })),
  dynamique: z.string(),
  alliance: z.string(),
  care: z.array(z.string()),
  resume: z.string(),
})

/** Un mouvement d'hypnose : son nom pour la thérapeute, et ce qui se dit. */
export const generatedHypnoseSchema = z.object({
  titre: z.string(),
  texte: z.string(),
})

/* ------------------------------------------------------------------ *
 * La retouche (0066) : un texte à la fois
 * ------------------------------------------------------------------ */

/**
 * Une synthèse ou un message retouchés : un texte seul. La retouche ne
 * réécrit pas tout le brouillon pour en changer un paragraphe — elle
 * coûterait le prix d'une séance, et déplacerait ce qui n'était pas critiqué.
 */
export const generatedTexteSchema = z.object({
  texte: z.string(),
})

/** Un module proposé par le brouillon, retouché seul : mêmes clés, mêmes types permis. */
export const generatedPropositionSchema = z.object({
  titre: z.string(),
  pourquoi: z.string(),
  type: proposalKindSchema,
})

/*
 * LE TEXTE EN PLACE, RELU COMME LE DOSSIER. Il vient de l'écran : c'est une
 * sortie de l'IA, peut-être corrigée à la main depuis. Borné sans refus —
 * au-delà, rien de ce qu'un vrai texte contient —, et les champs inconnus
 * sont écartés : rien de ce que le client ajouterait ne part vers le modèle
 * sans être passé par ici.
 */

export const mouvementLuSchema = z.object({
  titre: ligne.default(''),
  texte: texte(20_000),
})

export const moduleLuSchema = z.object({
  titre: ligne.default(''),
  duree: ligne.default(''),
  quand: texte(1000).default(''),
  steps: z.array(texte(2000)).default([]).transform((a) => a.slice(0, 12)),
  pourquoi: texte(4000).default(''),
  quiz: z
    .array(
      z.object({
        question: texte(1000),
        options: z.array(texte(400)).transform((a) => a.slice(0, 6)),
        correct: z.number().int(),
        feedback: texte(2000).default(''),
      }),
    )
    .default([])
    .transform((a) => a.slice(0, 6)),
})

export const propositionLueSchema = z.object({
  titre: ligne,
  pourquoi: texte(2000).default(''),
  type: ligne.default(''),
})

/** Le profil à retoucher : la même lecture que celui du dossier. */
export const profilActuelSchema = profilLuSchema

/* ------------------------------------------------------------------ *
 * Alignement avec le modèle de domaine du client
 * ------------------------------------------------------------------ */

/**
 * Vérifie à la compilation que chaque schéma produit bien le type attendu par
 * l'interface. Si src/types/domain.ts change sans que le schéma suive, la
 * compilation du serveur échoue ici.
 */
type Aligned<Schema extends Domain, Domain> = Schema

export type SessionDraftOutput = Aligned<z.infer<typeof sessionDraftSchema>, SessionDraft>
export type GeneratedModuleOutput = Aligned<z.infer<typeof generatedModuleSchema>, GeneratedModule>
export type GeneratedAffirmationsOutput = Aligned<
  z.infer<typeof generatedAffirmationsSchema>,
  GeneratedAffirmations
>
export type GeneratedProfileOutput = Aligned<z.infer<typeof generatedProfileSchema>, GeneratedProfile>
/** Une proposition retouchée doit rester une proposition du brouillon. */
export type PropositionRetouchee = Aligned<
  z.infer<typeof generatedPropositionSchema>,
  SessionDraft['propositions'][number]
>
/** Le dossier lu doit rester un PatientContext : les prompts n'en lisent pas d'autre. */
export type ContexteLu = Aligned<z.output<typeof contexteLuSchema>, PatientContext>
