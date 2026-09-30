/**
 * La dictée de l'espace patient.
 *
 * Elle vit désormais avec celle des champs de la praticienne : le moteur
 * dans src/services/speech.ts, les règles d'écriture dans src/lib/dictee.ts,
 * le crochet dans src/components/ui/useDictee.ts. Ce fichier garde les noms
 * que les écrans du patient importent — Journal, MotAuTherapeute, Tache.
 */
export { ajouterDicte } from '@/lib/dictee'
export { useDictee, type Dictee } from '@/components/ui/useDictee'
