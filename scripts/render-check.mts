/**
 * Banc de rendu.
 *
 * Rend l'application hors navigateur et vérifie deux choses :
 *   1. chaque vue produit du balisage — une vue qui explose ne le dit pas au
 *      compilateur, seulement à l'utilisateur ;
 *   2. l'espace revendeur ne laisse filtrer aucun nom de patient ni aucun
 *      extrait de dossier. Le cloisonnement est garanti en base, mais rien
 *      n'empêcherait quelqu'un de recopier une donnée de démonstration dans un
 *      écran revendeur — c'est arrivé une fois, dans l'aperçu de la marque.
 *
 *   npm run check:render
 */
import { renderToString } from 'react-dom/server'
import { createElement as h } from 'react'
import { App } from '../src/App'
import { RendezVous } from '../src/patient/RendezVous'
import { VitrinePage } from '../src/views/vitrine/VitrinePage'
import { Tache } from '../src/patient/Tache'
import { IconeOnglet } from '../src/patient/IconesOnglets'
import { ConsigneEditeur } from '../src/views/therapist/ConsigneEditeur'
import { AppStoreProvider } from '../src/state/store'
import { PATIENTS } from '../src/data/patients'
import type { AppState, ResellerView, ViewMode } from '../src/state/state'

const noms = Object.values(PATIENTS).map((p) => p.name)
const extraits = Object.values(PATIENTS).flatMap((p) => [
  p.profile.portrait.slice(0, 40),
  ...p.journal.map((j) => j.text.slice(0, 40)),
  ...p.modules.map((m) => m.title),
])

let echecs = 0

function rendu(label: string, initial: Partial<AppState>): string {
  try {
    const html = renderToString(h(AppStoreProvider, { initial }, h(App)))
    if (html.length < 500) {
      console.error(`✗ ${label} : ${html.length} octets, la vue est vide`)
      echecs++
    }
    return html
  } catch (err) {
    console.error(`✗ ${label} : ${(err as Error).message}`)
    echecs++
    return ''
  }
}

// 1. Les six vues du cabinet rendent.
const MODES: ViewMode[] = [
  'therapist', 'patient', 'session', 'atelier', 'audios', 'notif', 'boutique', 'programmes', 'marque',
  'site', 'integrations',
]
for (const mode of MODES) {
  const html = rendu(`cabinet/${mode}`, { space: 'cabinet', mode })
  if (html) console.log(`✓ cabinet/${mode.padEnd(9)} ${String(html.length).padStart(6)} octets`)
}

// 1 bis. Un cabinet sans patient : le premier écran d'une praticienne qui
// vient d'accepter son invitation. La fiche n'a rien à montrer, et l'afficher
// planterait — c'est arrivé.
const vide = rendu('cabinet/sans-patient', {
  space: 'cabinet',
  mode: 'therapist',
  patients: {},
  patientOrder: [],
  sel: '',
  patientsReels: true,
})
if (vide && !vide.includes('Votre cabinet est prêt')) {
  console.error("✗ cabinet/sans-patient : l'écran d'accueil du cabinet vide ne s'affiche pas")
  echecs++
} else if (vide) {
  console.log(`✓ cabinet/sans-patient ${String(vide.length).padStart(6)} octets · accueil affiché`)
}

// 1 ter. TOUTES les vues du cabinet doivent tenir sans patient : c'est
// l'état normal d'un cabinet qui vient d'ouvrir, pas un cas limite.
const VIDE = { space: 'cabinet', patients: {}, patientOrder: [], sel: '', patientsReels: true } as const
for (const mode of MODES) {
  const html = rendu(`vide/${mode}`, { ...VIDE, mode })
  if (html) console.log(`✓ vide/${mode.padEnd(12)} ${String(html.length).padStart(6)} octets`)
}

// 1 quater. La séance ne s'ouvre jamais sur une fiche que personne n'a
// choisie. C'était le défaut : l'écran de consentement portait le nom d'une
// patient d'exemple, quel que soit le cabinet.
const seance = rendu('cabinet/session-sans-choix', { space: 'cabinet', mode: 'session' })
if (seance) {
  if (!seance.includes('Pour qui est cette séance')) {
    console.error('✗ session : le choix de la fiche ne précède pas le consentement')
    echecs++
  } else if (seance.includes('a donné son accord')) {
    console.error("✗ session : un consentement est proposé avant qu'une fiche soit choisie")
    echecs++
  } else {
    console.log(`✓ session/sans-choix  ${String(seance.length).padStart(6)} octets · aucune fiche imposée`)
  }
}

/* La fiche choisie est celle qui est nommée, jusque dans le consentement.
   Le prénom et la phrase sont deux nœuds de texte séparés au rendu : on
   vérifie le nom complet du fil d'Ariane, puis la phrase. */
const choisie = Object.keys(PATIENTS)[1] as string
const nomChoisi = (PATIENTS[choisie] as { name: string }).name
const avecChoix = rendu('cabinet/session-choisie', {
  space: 'cabinet',
  mode: 'session',
  sessionPatient: choisie,
})
if (avecChoix) {
  const manque = [
    !avecChoix.includes(`· ${nomChoisi}`) && `le fil d'Ariane ne porte pas ${nomChoisi}`,
    !avecChoix.includes('a donné son accord, signer') && 'le consentement ne se signe pas',
    !avecChoix.includes(nomChoisi.split(' ')[0] as string) && 'le prénom ne paraît nulle part',
  ].filter(Boolean)
  if (manque.length) {
    console.error(`✗ session/choisie : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ session/choisie     ${String(avecChoix.length).padStart(6)} octets · séance au nom de ${nomChoisi}`)
  }
}

// Sans aucune fiche, la séance le dit au lieu de proposer d'enregistrer.
const seanceVide = rendu('vide/session-sans-fiche', { ...VIDE, mode: 'session' })
if (seanceVide && !seanceVide.includes('Aucune fiche dans ce cabinet')) {
  console.error('✗ vide/session : le cabinet sans fiche ne dit pas quoi faire')
  echecs++
} else if (seanceVide) {
  console.log(`✓ vide/session-sans-fiche ${String(seanceVide.length).padStart(6)} octets`)
}

// 1 quinquies. Un brouillon de maquette ne doit JAMAIS pouvoir passer pour une
// analyse : l'écran le dit, et la barre d'envoi refuse de le verser au dossier.
// C'est le défaut qui a produit une « analyse » hors sujet en production.
const BROUILLON = {
  synthese: 'Texte de maquette.',
  mots: [],
  themes: [],
  propositions: [],
  induction: '',
  questions: [],
  vigilance: [],
  categories_audio: [],
  message: '',
}
const maquette = rendu('cabinet/session-maquette', {
  space: 'cabinet',
  mode: 'session',
  sessionPatient: choisie,
  consent: true,
  draft: BROUILLON,
  draftMaquette: true,
})
if (maquette) {
  /* Les apostrophes sont échappées au rendu (&#x27;) : on cherche des
     fragments qui n'en contiennent pas. */
  const avant = maquette.slice(0, maquette.indexOf('Valider et envoyer'))
  const manque = [
    !maquette.includes('pas une analyse de votre séance') && "l'avertissement manque",
    !maquette.includes('Envoi impossible') && "la barre d'envoi ne dit pas qu'elle refuse",
    !avant.slice(-400).includes('disabled') && "le bouton d'envoi n'est pas barré",
  ].filter(Boolean)
  if (manque.length) {
    console.error(`✗ session/maquette : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ session/maquette    ${String(maquette.length).padStart(6)} octets · annoncée et non envoyable`)
  }
}

// 1 quinquies bis. L'hypnose se décide DANS la séance — mais à un seul
// moment, et c'est en lisant la note. Elle se demandait aussi à l'écran
// d'enregistrement, « avant de lancer, là où le coût s'affiche » : sauf que
// cette case-là ne conditionnait pas le lancement. Elle réglait la fiche, et
// l'étape suivante reposait la même question avec, elle, le bouton qui écrit.
// Deux endroits pour un choix dont un seul agit : la question était posée
// trop tôt, avant même de savoir s'il y a matière.
//
// Les deux scènes se tiennent donc ensemble, et dans les deux sens : absente
// à l'enregistrement, présente dans la note. Vérifier l'absence seule
// passerait le jour où la case disparaîtrait des deux écrans.
const enregistrement = rendu('cabinet/session-hypnose-demarrage', {
  space: 'cabinet',
  mode: 'session',
  sessionPatient: choisie,
  consent: true,
})
if (enregistrement) {
  if (enregistrement.includes('Écrire une hypnose pour')) {
    console.error(
      "✗ session/hypnose-départ : la case revient à l'écran d'enregistrement, où elle n'agit pas",
    )
    echecs++
  } else {
    console.log(
      `✓ session/hypnose-départ ${String(enregistrement.length).padStart(6)} octets · rien à décider avant la note`,
    )
  }
}

const hypnose = rendu('cabinet/session-hypnose', {
  space: 'cabinet',
  mode: 'session',
  sessionPatient: choisie,
  consent: true,
  draft: BROUILLON,
  draftMaquette: false,
})
if (hypnose) {
  /* Le prénom est interpolé : React sépare le texte statique de la valeur par
     un marqueur de commentaire, et la phrase n'existe jamais d'un seul tenant
     dans le balisage. On vérifie donc les deux morceaux. */
  const prenom = nomChoisi.split(' ')[0] as string
  const manque = [
    !hypnose.includes('Écrire une hypnose pour') && "la case ne s'offre pas depuis la séance",
    !hypnose.includes('type="checkbox"') && 'aucune case à cocher',
    !hypnose.includes(prenom) && `la case ne nomme pas ${prenom}`,
    /* Le prix a suivi la décision, et il doit se lire AVANT de cocher : c'est
       la case qui le porte, pas le bouton — sinon il n'apparaîtrait qu'une
       fois l'option déjà ouverte. La scène a l'hypnose fermée, donc le voir
       ici prouve qu'il éclaire bien le choix. */
    // Sans l'apostrophe : React l'échappe en &#x27; dans le balisage rendu.
    !hypnose.includes('analyse la plus coûteuse') && "le coût ne s'affiche plus nulle part",
    !hypnose.includes('0,24') && 'le coût est annoncé sans chiffre',
  ].filter(Boolean)
  if (manque.length) {
    console.error(`✗ session/hypnose : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ session/hypnose     ${String(hypnose.length).padStart(6)} octets · case offerte en séance`)
  }
}

// Une rubrique de mots vide reste possible sur une transcription pauvre :
// l'écran doit le dire, pas laisser un blanc. Il ne l'impute plus à
// l'absence de locuteurs — le prompt relève désormais les formulations
// marquantes sans prétendre les attribuer.
const sansMots = rendu('cabinet/session-sans-mots', {
  space: 'cabinet',
  mode: 'session',
  sessionPatient: choisie,
  consent: true,
  draft: BROUILLON,
  draftMaquette: false,
})
if (sansMots && !sansMots.includes('Rien de saillant')) {
  console.error("✗ session/sans-mots : la rubrique vide n'explique pas pourquoi")
  echecs++
} else if (sansMots) {
  console.log(`✓ session/sans-mots   ${String(sansMots.length).padStart(6)} octets · rubrique vide expliquée`)
}

// 1 sexies. La prise de rendez-vous, côté patient.
//
// Le cadre existait dans le code mais dormait derrière un dépliant fermé :
// personne ne le voyait, et le réglage de la thérapeute passait pour perdu.
// C'est exactement ce qu'un banc de rendu doit attraper.
const PAGE = 'https://agenda.exemple.fr/'
const WIDGET = 'https://agenda.exemple.fr/?t=s&uuid=abc'

function rdv(label: string, props: Parameters<typeof RendezVous>[0]): string {
  try {
    return renderToString(h(RendezVous, props))
  } catch (err) {
    console.error(`✗ ${label} : ${(err as Error).message}`)
    echecs++
    return ''
  }
}

const enCadre = rdv('rdv/widget', { url: PAGE, widgetUrl: WIDGET, mode: 'widget' })
// React échappe les esperluettes de l'adresse : on compare la forme rendue.
const widgetRendu = WIDGET.replace(/&/g, '&amp;')
if (enCadre && (!enCadre.includes('<iframe') || !enCadre.includes(widgetRendu))) {
  console.error("✗ rdv/widget : le cadre n'est pas monté au chargement")
  echecs++
} else if (enCadre) {
  console.log(`✓ rdv/widget          ${String(enCadre.length).padStart(6)} octets · cadre monté`)
}

// Sans adresse de widget distincte, c'est la page de réservation qu'on encadre.
const cadreParDefaut = rdv('rdv/widget-sans-adresse', { url: PAGE, widgetUrl: null, mode: 'widget' })
if (cadreParDefaut && !cadreParDefaut.includes('<iframe')) {
  console.error('✗ rdv/widget-sans-adresse : aucun cadre alors que le mode widget est choisi')
  echecs++
} else if (cadreParDefaut) {
  console.log(`✓ rdv/widget-sans-adresse ${String(cadreParDefaut.length).padStart(6)} octets`)
}

// En mode bouton, aucun cadre : on n'encadre pas ce qu'on n'a pas demandé.
const enBouton = rdv('rdv/bouton', { url: PAGE, widgetUrl: null, mode: 'bouton' })
if (enBouton && enBouton.includes('<iframe')) {
  console.error('✗ rdv/bouton : un cadre est monté alors que le mode bouton est choisi')
  echecs++
} else if (enBouton && !enBouton.includes(`href="${PAGE}"`)) {
  console.error("✗ rdv/bouton : le bouton n'ouvre pas la page de réservation")
  echecs++
} else if (enBouton) {
  console.log(`✓ rdv/bouton          ${String(enBouton.length).padStart(6)} octets · aucun cadre`)
}

/* 1 quinquies. La vitrine publique d'un cabinet.
   C'est la page la plus exposée du produit : elle est servie à qui n'est pas
   connecté. On vérifie qu'elle monte, qu'elle porte la porte de connexion, et
   surtout qu'elle ne contient RIEN d'un dossier — elle n'a jamais à en lire. */
const SITE_FICTIF = {
  slug: 'cabinet-exemple',
  name: 'Cabinet Exemple',
  tagline: 'Hypnose et thérapies brèves',
  branding: {
    accent: '#A17A45',
    accentHover: '#856239',
    accentDeep: '#6E5230',
    dark: '#33291C',
    logo: 'CE',
  },
  modele: 'sobre',
  titre: 'Retrouver le sommeil, sans somnifère',
  sous_titre: 'Hypnothérapie à Nantes, sur rendez-vous',
  presentation: 'Deux paragraphes de présentation.\n\nEt le second.',
  adresse: '12 rue des Halles, 44000 Nantes',
  telephone: '02 40 00 00 00',
  site_web: 'https://cabinet-exemple.fr',
  horaires: [{ jour: 'Lundi', heures: '9h – 18h' }],
  photos: [{ url: 'https://exemple.test/photo.jpg', alt: 'La salle', attribution: 'Photo : Marie D. (Google)' }],
  services: [{ titre: 'Sommeil', texte: 'Un accompagnement en quatre séances.' }],
  avis: [{ auteur: 'Claire', note: 5, texte: 'Une écoute rare.', date: 'il y a un mois' }],
  google_note: 4.9,
  google_avis: 37,
}

try {
  const html = renderToString(h(VitrinePage, { site: SITE_FICTIF as never }))
  const manque = [
    !html.includes('Recevoir mon lien') && 'la porte de connexion manque',
    !html.includes('Photo : Marie D. (Google)') && "l'attribution de la photo n'est pas affichée",
    !html.includes('Retrouver le sommeil') && 'le titre publié ne paraît pas',
  ].filter(Boolean)
  const fuites = [...noms, ...extraits].filter((s) => html.includes(s))
  if (manque.length || fuites.length) {
    console.error(`✗ vitrine/publiee : ${[...manque, ...fuites].join(', ')}`)
    echecs++
  } else {
    console.log(`✓ vitrine/publiee   ${String(html.length).padStart(6)} octets · porte posée, aucun dossier`)
  }

  /* L'aperçu de l'éditeur rend LE MÊME composant, avec sa porte désactivée.
     C'est ce qui garantit qu'il montre la vraie page ; et c'est aussi ce qui
     rend l'épreuve nécessaire, parce qu'une thérapeute qui essaie le bouton
     pour voir ne doit pas s'envoyer un vrai lien de connexion. */
  const apercu = renderToString(h(VitrinePage, { site: SITE_FICTIF as never, apercu: true }))
  const champs = apercu.match(/<input[^>]*type="email"[^>]*>/g) ?? []
  const inerte = champs.length > 0 && champs.every((c) => c.includes('readonly'))
  /* La page publiée, elle, doit rester utilisable : sans cette moitié-là,
     l'épreuve passerait aussi le jour où le champ serait bloqué partout. */
  const vivants = html.match(/<input[^>]*type="email"[^>]*>/g) ?? []
  const ouvert = vivants.length > 0 && vivants.every((c) => !c.includes('readonly'))
  const dit = [
    !apercu.includes('Retrouver le sommeil') && 'le titre ne paraît pas dans l’aperçu',
    !inerte && "la porte de l'aperçu se remplit encore",
    !ouvert && 'la porte de la page publiée est bloquée',
  ].filter(Boolean)
  if (dit.length) {
    console.error(`✗ vitrine/apercu : ${dit.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ vitrine/apercu    ${String(apercu.length).padStart(6)} octets · porte montrée, inerte`)
  }
  /* LES AVIS GOOGLE : LE BADGE FAIT FOI, ET LA PISTE MARCHE SANS SCRIPT.
     Le carrousel est un défilement natif : rendu côté serveur, les trois avis
     doivent déjà être dans la page. S'ils n'y sont qu'après hydratation, un
     robot d'indexation et un navigateur sans script ne voient qu'un cadre
     vide — et sur la page la plus exposée du produit. */
  const troisAvis = {
    ...SITE_FICTIF,
    avis: [
      { auteur: 'Claire', note: 5, texte: 'Une écoute rare.', date: 'il y a un mois' },
      { auteur: 'Karim', note: 4, texte: 'Deux séances ont suffi.', date: 'il y a 3 mois' },
      { auteur: 'Léa', note: 5, texte: 'Je dors enfin.', date: 'il y a un an' },
    ],
  }
  const carrousel = renderToString(h(VitrinePage, { site: troisAvis as never }))
  const avisManque = [
    // Les trois avis, sans script.
    !['Une écoute rare.', 'Deux séances ont suffi.', 'Je dors enfin.'].every((t) =>
      carrousel.includes(t),
    ) && 'la piste ne porte pas les trois avis sans script',
    // Le badge : la note ET son nombre d'avis. Une note sans son volume ne
    // dit rien, et 4,9 doit rester 4,9 — pas 5 arrondi.
    !carrousel.includes('4,9') && 'la note Google exacte ne paraît pas',
    !carrousel.includes('37 avis sur Google') && "le nombre d'avis Google manque",
    // La marque Google, inline et non chargée chez Google : une page de
    // cabinet ne signale pas ses visiteurs à un tiers.
    !carrousel.includes('#EA4335') && "le logo Google n'est pas dans la page",
    /(gstatic|googleusercontent|google\.com\/images)/.test(carrousel) &&
      'le logo Google est chargé depuis un serveur tiers',
  ].filter(Boolean)
  if (avisManque.length) {
    console.error(`✗ vitrine/avis : ${avisManque.join(', ')}`)
    echecs++
  } else {
    console.log(
      `✓ vitrine/avis      ${String(carrousel.length).padStart(6)} octets · badge Google, piste sans script`,
    )
  }
  /* L'HABILLAGE ARRIVE JUSQU'À LA PAGE. Un réglage qu'on peut choisir et qui
     ne change rien à l'écran est pire qu'un réglage absent. On vérifie donc
     les trois chemins par lesquels il passe : la police en variable, la
     classe du fond, et la feuille de police demandée. */
  const habille = {
    ...SITE_FICTIF,
    theme: { preset: 'atelier', titres: 'fraunces', texte: 'karla', fond: 'grain', anime: false, carte: 'papier', coins: 'doux' },
  }
  const themee = renderToString(h(VitrinePage, { site: habille as never }))
  const themeManque = [
    !themee.includes('Fraunces') && "la police des titres n'atteint pas la page",
    !themee.includes('Karla') && "la police du texte n'atteint pas la page",
    !themee.includes('fond_grain') && "la classe du fond n'est pas posée",
    !themee.includes('fonts.googleapis.com') && "la feuille de police n'est pas demandée",
  ].filter(Boolean)

  /* ET UN THÈME HOSTILE NE PASSE PAS. Ces valeurs deviennent des noms de
     classe et une `font-family` sur une page publique : la liste blanche est
     la seule barrière, et une épreuve qui ne la met pas à l'épreuve ne prouve
     rien. La page doit se rendre, avec le thème d'origine. */
  const piege = {
    ...SITE_FICTIF,
    theme: { titres: 'Georgia; } body { display:none } .x {', fond: '<script>alert(1)</script>' },
  }
  const rendu = renderToString(h(VitrinePage, { site: piege as never }))
  const fuite = [
    rendu.includes('display:none') && 'du CSS étranger a traversé jusqu’à la page',
    rendu.includes('<script>alert') && 'du balisage étranger a traversé',
    !rendu.includes('Newsreader') && 'le thème d’origine ne reprend pas la main',
    // Rien à charger : le thème d'origine est déjà servi par le document.
    rendu.includes('fonts.googleapis.com') && 'une feuille de police est demandée pour rien',
  ].filter(Boolean)

  if (themeManque.length || fuite.length) {
    console.error(`✗ vitrine/theme : ${[...themeManque, ...fuite].join(', ')}`)
    echecs++
  } else {
    console.log(
      `✓ vitrine/theme     ${String(themee.length).padStart(6)} octets · habillage appliqué, thème hostile écarté`,
    )
  }
} catch (err) {
  console.error(`✗ vitrine/publiee : ${(err as Error).message}`)
  echecs++
}

// 2. Les quatre vues du revendeur rendent, et ne montrent aucun patient.
const VUES: ResellerView[] = ['portfolio', 'brand', 'plans']
for (const rView of VUES) {
  const html = rendu(`revendeur/${rView}`, { space: 'reseller', rView })
  if (!html) continue
  const fuites = [...noms, ...extraits].filter((s) => html.includes(s))
  if (fuites.length) {
    console.error(`✗ revendeur/${rView} : contenu de patient dans un écran revendeur — ${fuites.join(' | ')}`)
    echecs++
  } else {
    console.log(`✓ revendeur/${rView.padEnd(9)} ${String(html.length).padStart(6)} octets · aucun contenu de patient`)
  }
}

/* ------------------------------------------------------------------ *
 * L'espace patient : la tâche qui s'ouvre
 *
 * Elle ne s'ouvrait pas du tout : la consigne dormait dans une colonne que
 * personne ne lisait, et le patient pouvait cocher un exercice sans savoir
 * ce qu'il fallait faire. L'épreuve tient les deux moitiés — ce qui existe
 * s'affiche, ce qui manque se dit au lieu de s'inventer.
 * ------------------------------------------------------------------ */

const TACHE_AVEC = {
  id: '1',
  title: 'Le premier geste du matin',
  meta: 'Ajouté depuis la séance du 3 septembre',
  kind: 'Exercice',
  position: 0,
  done_at: null,
  patient_note: null,
  consigne: {
    duree: '3 minutes',
    quand: 'Au réveil',
    steps: ['Posez les pieds au sol.', 'Comptez trois respirations.'],
    why: 'Pour rompre la première hésitation.',
  },
}
const TACHE_SANS = { ...TACHE_AVEC, id: '2', consigne: null }

try {
  const rien = async () => {}
  const avec = renderToString(
    h(Tache as never, { module: TACHE_AVEC, onFermer: () => {}, onBasculer: rien, onNote: rien } as never),
  )
  const sans = renderToString(
    h(Tache as never, { module: TACHE_SANS, onFermer: () => {}, onBasculer: rien, onNote: rien } as never),
  )
  const manque = [
    !avec.includes('Posez les pieds au sol.') && 'les étapes ne paraissent pas',
    !avec.includes('Pour rompre la première hésitation.') && 'le « pourquoi » ne paraît pas',
    sans.includes('Comment faire') && 'un module sans étapes en annonce quand même',
    !sans.includes('sans consigne écrite') && "l'absence de consigne n'est pas dite",
  ].filter(Boolean)
  const icones = ['jour', 'journal', 'rdv', 'boutique', 'moi'].filter(
    (nom) => !renderToString(h(IconeOnglet as never, { nom } as never)).includes('<svg'),
  )
  if (manque.length || icones.length) {
    console.error(`✗ patient/tache : ${[...manque, ...icones.map((i) => `icône ${i} vide`)].join(', ')}`)
    echecs++
  } else {
    console.log(`✓ patient/tache     ${String(avec.length).padStart(6)} octets · consigne lue, absence dite, 5 icônes`)
  }
} catch (err) {
  console.error(`✗ patient/tache : ${(err as Error).message}`)
  echecs++
}

/* L'éditeur de consigne : ce que l'IA a écrit doit revenir tel quel dans les
   champs, sinon la thérapeute croit corriger et repart d'une page blanche. */
try {
  const rendu = renderToString(
    h(ConsigneEditeur as never, {
      module: {
        id: 'm1',
        title: 'Le premier geste du matin',
        meta: '',
        kind: 'Exercice',
        done: false,
        consigne: {
          duree: '3 minutes',
          quand: 'Au réveil',
          steps: ['Posez les pieds au sol.', 'Comptez trois respirations.'],
          why: 'Pour rompre la première hésitation.',
        },
      },
      onFerme: () => {},
    } as never),
  )
  const manque = [
    !rendu.includes('3 minutes') && 'la durée ne revient pas',
    !rendu.includes('Au réveil') && 'le moment ne revient pas',
    !rendu.includes('Pour rompre la première hésitation.') && 'le « pourquoi » ne revient pas',
    !rendu.includes('Posez les pieds au sol.') && 'les étapes ne reviennent pas',
    !rendu.includes('Comptez trois respirations.') && 'la deuxième étape manque',
  ].filter(Boolean)
  if (manque.length) {
    console.error(`✗ therapeute/consigne : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ therapeute/consigne ${String(rendu.length).padStart(4)} octets · relue telle qu'écrite`)
  }
} catch (err) {
  console.error(`✗ therapeute/consigne : ${(err as Error).message}`)
  echecs++
}

if (echecs > 0) {
  console.error(`\n${echecs} échec(s).`)
  process.exit(1)
}
console.log('\nRendu conforme.')

