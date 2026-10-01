/**
 * La bibliothèque d'hypnoses de démonstration (0071), et les amorces
 * d'intention proposées sous le champ de l'atelier.
 *
 * Deux hypnoses, une de chaque origine. Elles ne nomment personne : une
 * hypnose de bibliothèque se lit à plusieurs patients, et celle « écrite en
 * séance » ne dit jamais de quelle séance — le banc de rendu le vérifie
 * (scripts/render-check.mts). Les textes sont courts : c'est une vitrine, pas
 * trente minutes de lecture.
 */
import type { HypnoseDeBibliotheque } from '@/types/domain'

/** Amorces proposées sous le champ d'intention (libellé du bouton). */
export const HYPNOSE_SEEDS: string[] = ['Retrouver le sommeil', 'Apaiser le trac', 'Traverser une envie']

/** L'intention complète écrite dans le champ quand on clique sur une amorce. */
export const HYPNOSE_SEED_INTENTIONS: Record<string, string> = {
  'Retrouver le sommeil':
    "Une hypnose pour retrouver le sommeil quand les pensées tournent le soir : relâcher le corps, ralentir le souffle, laisser l'endormissement venir de lui-même.",
  'Apaiser le trac':
    "Une hypnose pour aborder une prise de parole ou un examen avec plus de calme, en s'appuyant sur une sensation d'ancrage simple à retrouver le jour venu.",
  'Traverser une envie':
    "Une hypnose pour traverser une envie — de fumer, de grignoter — sans lutter contre elle : laisser la vague monter, puis redescendre, et retrouver le choix.",
}

export const BIBLIOTHEQUE_HYPNOSES_DEMO: HypnoseDeBibliotheque[] = [
  {
    id: 'demo-bibliotheque-sommeil',
    titre: 'La maison qui s’éteint',
    intention: HYPNOSE_SEED_INTENTIONS['Retrouver le sommeil'] ?? '',
    origine: 'atelier',
    complete: true,
    creeLe: '2026-09-24T18:10:00Z',
    modifieLe: '2026-09-24T18:16:00Z',
    attribueeA: ['nadia', 'julien'],
    sourcePatientId: null,
    mouvements: [
      {
        mouvement: 'induction',
        titre: 'La maison qui s’éteint',
        texte:
          "Vous pouvez vous installer comme il vous convient, et laisser le poids du corps se poser là où il est soutenu.\nPeut-être que vous remarquez déjà l'appui du dos… le contact des mains… l'air qui entre, et qui ressort, à son propre rythme.",
      },
      {
        mouvement: 'approfondissement',
        titre: 'Une pièce après l’autre',
        texte:
          "Et comme dans une maison, le soir, les lumières peuvent s'éteindre une à une, à votre rythme.\nLa pièce du haut, d'abord… puis celle d'à côté… et à chaque lumière qui s'éteint, le calme peut s'étendre un peu plus loin.",
      },
      {
        mouvement: 'travail',
        titre: 'La dernière lampe',
        texte:
          "Il reste peut-être une petite lampe, quelque part, celle des pensées qui veillent encore.\nVous pouvez la regarder un instant, sans rien lui demander… et la laisser baisser d'elle-même, doucement, jusqu'à ce qu'il ne reste qu'une lueur tiède.",
      },
      {
        mouvement: 'retour',
        titre: 'Ce que la maison garde',
        texte:
          "Ce soir, quand vous éteindrez la lumière de votre chambre, ce geste ordinaire pourra rappeler à votre corps ce calme-là.\nEt maintenant, à votre rythme, vous pouvez revenir, en comptant de un à cinq… cinq, les yeux s'ouvrent, présent et disponible.",
      },
    ],
  },
  {
    id: 'demo-bibliotheque-ancrage',
    titre: 'Le sol sous les pieds',
    intention: "Retrouver un appui stable avant de prendre la parole devant d'autres personnes.",
    origine: 'seance',
    complete: true,
    creeLe: '2026-09-17T15:40:00Z',
    modifieLe: '2026-09-17T15:46:00Z',
    attribueeA: [],
    sourcePatientId: null,
    mouvements: [
      {
        mouvement: 'induction',
        titre: 'Le sol sous les pieds',
        texte:
          "Vous pouvez sentir le sol sous vos pieds, la façon dont il vous porte sans effort.\nEt pendant que le souffle trouve son rythme, rien d'autre n'est à faire que remarquer cet appui.",
      },
      {
        mouvement: 'approfondissement',
        titre: 'Les racines',
        texte:
          "Et cet appui peut descendre un peu plus bas, comme des racines qui trouvent leur place dans une terre souple.\nÀ chaque expiration, un peu plus stable… un peu plus tranquille.",
      },
      {
        mouvement: 'travail',
        titre: 'L’arbre dans le vent',
        texte:
          "Un arbre bien enraciné peut laisser bouger ses branches : le vent passe, et le tronc reste là.\nLe moment venu, devant d'autres personnes, vos pieds pourront retrouver cette sensation, et votre voix s'appuyer sur elle.",
      },
      {
        mouvement: 'retour',
        titre: 'Remonter avec l’appui',
        texte:
          "Chaque fois que vous poserez les pieds à plat avant de parler, cet appui pourra revenir.\nEt maintenant, vous pouvez remonter, en redonnant du mouvement aux mains, aux épaules… et ouvrir les yeux, présent, disponible.",
      },
    ],
  },
]
