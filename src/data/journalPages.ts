/**
 * Pages du journal écrites côté patient. Seules les pages partagées remontent
 * au cabinet.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */
import type { JournalPage, PatientId } from '@/types/domain'

export const JOURNAL_PAGES: Record<PatientId, JournalPage[]> = {
  camille: [
    {
      id: 'cp1',
      title: 'La soirée de vendredi',
      date: 'Samedi 5 septembre',
      shared: true,
      text: "Deux personnes fumaient sur le trottoir. Je suis restée dedans, j'ai fait le geste de la main sur le sternum, et l'envie est passée en trois ou quatre minutes. Je ne pensais pas que ce serait aussi bête que ça.",
    },
    {
      id: 'cp2',
      title: 'Ce que je ne dis pas au bureau',
      date: 'Lundi 7 septembre',
      shared: false,
      text: "J'ai recommencé à compter les heures avant la pause. Personne ne le voit. Je ne sais pas encore si j'ai envie d'en parler en séance.",
    },
    {
      id: 'cp3',
      title: 'Réveil de six heures',
      date: 'Mardi 8 septembre',
      shared: true,
      text: "Réveillée avant l'alarme, calme pour une fois. Écrit trois lignes puis rendormie vingt minutes.",
    },
  ],
  nadia: [
    {
      id: 'np1',
      title: 'La liste de quatre heures',
      date: 'Dimanche 6 septembre',
      shared: true,
      text: "Toujours le même ordre : les mails, la réunion de jeudi, ma mère. Je note maintenant les trois items dès qu'ils arrivent, ça les rend plus petits sur le papier.",
    },
  ],
  marc: [
    {
      id: 'mp1',
      title: 'Trois semaines',
      date: 'Mardi 1 septembre',
      shared: true,
      text: "Rien depuis trois semaines. Je garde l'audio court dans le téléphone, au cas où.",
    },
  ],
}
