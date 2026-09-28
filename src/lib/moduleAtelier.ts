/**
 * Un module de l'atelier, tel qu'il part chez les patients.
 *
 * L'atelier se présente comme un brouillon modifiable : la thérapeute y
 * corrige le titre, la durée, le moment, chaque étape de la consigne et le
 * « pourquoi ». Ce qu'elle laisse en chantier — une étape vidée, une ligne
 * ajoutée puis oubliée — ne doit pas arriver tel quel dans l'application du
 * patient, où une étape vide s'afficherait comme une puce numérotée sans
 * rien à côté.
 */
import type { CustomModule } from '@/types/domain'

export type Preparation = { ok: true; module: CustomModule } | { ok: false; message: string }

/**
 * Nettoie le module avant l'assignation, ou dit pourquoi il ne peut pas
 * partir. Les champs de contexte vides reprennent une valeur neutre (c'était
 * déjà la règle) ; une consigne sans aucune étape, elle, n'est pas une
 * consigne : on refuse plutôt que d'envoyer un exercice vide.
 */
export function preparerModule(mod: CustomModule): Preparation {
  const steps = mod.steps.map((etape) => etape.trim()).filter((etape) => etape)
  if (!steps.length) {
    return {
      ok: false,
      message: "La consigne n'a plus aucune étape : écrivez-en au moins une avant d'assigner le module.",
    }
  }
  return {
    ok: true,
    module: {
      ...mod,
      titre: mod.titre.trim() || 'Module sur mesure',
      duree: mod.duree.trim() || 'Quelques minutes',
      quand: mod.quand.trim() || 'Comme indiqué sur le module',
      steps,
      pourquoi: mod.pourquoi.trim(),
    },
  }
}
