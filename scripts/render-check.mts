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
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToString } from 'react-dom/server'
import { createElement as h } from 'react'
import { App } from '../src/App'
import { DeuxiemeFacteur } from '../src/auth/DeuxiemeFacteur'
import { AvertissementInactivite, GardeInactivite } from '../src/auth/Inactivite'
import { DoubleAuthentification } from '../src/views/compte/DoubleAuthentification'
import { DeconnexionAuto } from '../src/views/compte/DeconnexionAuto'
import { RendezVous } from '../src/patient/RendezVous'
import { VitrinePage } from '../src/views/vitrine/VitrinePage'
import { Tache } from '../src/patient/Tache'
import { Journal } from '../src/patient/Journal'
import { IconeOnglet } from '../src/patient/IconesOnglets'
import { ConsigneEditeur } from '../src/views/therapist/ConsigneEditeur'
import { ListeDesSeances, SeancesFiche } from '../src/views/therapist/SeancesFiche'
import { NotesCliniques } from '../src/views/therapist/NotesCliniques'
import { ExportDossier } from '../src/views/therapist/ExportDossier'
import { VueRappelsReguliers } from '../src/views/notifications/RappelsReguliers'
import { VueReglagesRappels } from '../src/patient/ReglagesRappels'
import { VueVentes } from '../src/views/boutique/VentesDuCabinet'
import { VueExportVentes } from '../src/views/boutique/ExportVentes'
import { VueAchats } from '../src/patient/VosAchats'
import { MOT_MASQUE } from '../src/lib/discretion'
import { AppStoreProvider } from '../src/state/store'
import { COUT_HYPNOSE } from '../src/lib/coutIA'
import { euro } from '../src/lib/format'
import { PATIENTS } from '../src/data/patients'
import { PageDeVente } from '../src/vente/PageDeVente'
import { PortePraticienne } from '../src/vente/Porte'
import { NoteDemo, SuiviDemo, TelephoneDemo } from '../src/vente/Demo'
import { aFournirAvantLaMiseEnLigne } from '../src/vente/contenu'
import { motsInterditsDans } from '../src/vente/garde'
import { LIENS_LEGAUX, type CleLegale } from '../src/legal/chemins'
import {
  PAGES_LEGALES as PAGES_DU_DROIT,
  VALIDE_JURIDIQUEMENT,
  champsACompleter,
  revendicationsInterdites,
} from '../src/legal/contenu'
import { PageLegaleVue } from '../src/legal/PageLegale'
import { MISE_A_JOUR as MISE_A_JOUR_DES_CONDITIONS } from '../src/legal/version'
import { CarteConditions } from '../src/auth/GardeConditions'
import { PLANS } from '../src/data/reseller'
import { SessionProvider } from '../src/auth/session'
import { ChampProchaineSeance } from '../src/views/therapist/ProchaineSeance'
import { VueParcoursType } from '../src/views/programmes/ParcoursType'
import { VueProposerParcours } from '../src/views/programmes/ProposerParcours'
import { instantDeParis } from '../src/lib/agenda'
import { jourDeParis } from '../src/lib/assiduite'
import { DOSSIER_AVANT_LECTURE, type AppState, type ResellerView, type ViewMode } from '../src/state/state'
import { VueJetons } from '../src/views/jetons/CarteJetons'
import { CoutEnJetons } from '../src/views/jetons/CoutEnJetons'
import { VerrouHypnose } from '../src/views/jetons/VerrouHypnose'
import { etatJetonsDemo } from '../src/data/jetons'
import { devisJetons } from '../src/lib/jetonsIA'
import { ETAT_REVENDEUR_DEMO } from '../src/data/jetons'
import { JetonsRevendeurContexte, type JetonsRevendeurData } from '../src/reseller/useJetonsRevendeur'
import { JetonsView } from '../src/views/reseller/JetonsView'
import { TexteMouvement } from '../src/views/therapist/TexteMouvement'
import { RetourIA } from '../src/components/retouche/RetourIA'
import { FenetreRetouche } from '../src/components/retouche/FenetreRetouche'
import { VuePreferencesIA } from '../src/views/integrations/PreferencesIA'

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
  'site', 'integrations', 'equipe', 'compte',
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

/* 1 ter ter. UN CABINET RÉEL NE VOIT JAMAIS LES FICHES DE DÉMONSTRATION.
   Avant sa première lecture — et pour toujours si elle échoue —, il gardait
   l'état initial : Camille et les autres, sur lesquelles une séance réelle,
   facturée, pouvait se lancer. Root lui donne désormais un dossier vide. */
const fuites: string[] = []
for (const mode of MODES) {
  const html = rendu(`avant-lecture/${mode}`, { space: 'cabinet', ...DOSSIER_AVANT_LECTURE, mode })
  const vus = noms.filter((n) => html.includes(n))
  if (vus.length) fuites.push(`${mode} (${vus.join(', ')})`)
}
if (fuites.length) {
  console.error(`✗ avant-lecture : des fiches de démonstration s'affichent — ${fuites.join(' ; ')}`)
  echecs++
} else {
  console.log(`✓ avant-lecture       ${MODES.length} vues · aucune fiche de démonstration`)
}

/* 1 ter bis. L'APERÇU N'ÉCRIT PAS DANS LE DOSSIER.
   La maquette téléphone s'ouvre depuis la fiche d'un patient réel et
   partageait ses tranches d'état : une note signée « Partagé par le patient »
   dans le Journal partagé, un point sur sa courbe du soir, une case cochée en
   son nom, un quiz relu en « Quiz 3 / 4 ». Rien n'allait en base — tout
   s'affichait sur la fiche comme un geste de la personne, et partait au
   contexte de l'IA, dont les textes sont conservés.
   Sur le portefeuille de démonstration les gestes restent vivants : il n'y a
   personne à qui les attribuer, et c'est là qu'ils montrent le produit. */
const INERTE = /data-apercu="inerte"/g
const apercuReel = rendu('patient/apercu-reel', { space: 'cabinet', mode: 'patient', patientsReels: true })
const apercuDemo = rendu('patient/apercu-demo', { space: 'cabinet', mode: 'patient', patientsReels: false })
if (apercuReel && apercuDemo) {
  const inertes = (apercuReel.match(INERTE) ?? []).length
  const vivants = (apercuDemo.match(INERTE) ?? []).length
  const manque = [
    inertes < 12 && `seulement ${inertes} gestes rendus inertes sur un dossier réel`,
    vivants > 0 && `${vivants} gestes bridés sur le portefeuille de démonstration`,
    !apercuReel.includes('restent inertes ici') && "l'aperçu ne dit pas pourquoi ses gestes ne répondent pas",
  ].filter(Boolean)
  if (manque.length) {
    console.error(`✗ patient/apercu : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ patient/apercu    ${String(apercuReel.length).padStart(6)} octets · ${inertes} gestes inertes, aucun en démonstration`)
  }
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
    // Le chiffre vient de coutIA : recalibré sur les factures réelles, il
    // bouge — le banc vérifie qu'il est dit, pas qu'il vaut une valeur figée.
    !hypnose.includes(euro(COUT_HYPNOSE).replace(/\s/g, ' ').split(' ')[0] as string) && 'le coût est annoncé sans chiffre',
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
    !themee.includes('/fonts/vitrine.css') && "la feuille de police n'est pas demandée",
    /(fonts\.googleapis|fonts\.gstatic)/.test(themee) &&
      'la page va chercher sa police chez Google',
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
    rendu.includes('/fonts/vitrine.css') && 'une feuille de police est demandée pour rien',
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

// 1 sexies. « Mon compte » s'ouvre aussi depuis l'espace revendeur, qui n'a
// pas de vues à pilules : sans ce cas, le revendeur n'aurait aucun écran pour
// changer son mot de passe.
const compteRevendeur = rendu('revendeur/compte', { space: 'reseller', mode: 'compte' })
if (compteRevendeur && !compteRevendeur.includes('Mon compte')) {
  console.error("✗ revendeur/compte : l'écran du compte ne s'ouvre pas dans l'espace revendeur")
  echecs++
} else if (compteRevendeur) {
  console.log(`✓ revendeur/compte ${String(compteRevendeur.length).padStart(6)} octets`)
}

// 2. Les quatre vues du revendeur rendent, et ne montrent aucun patient.
const VUES: ResellerView[] = ['portfolio', 'brand', 'plans', 'jetons', 'demandes', 'fiche', 'equipe']
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

/* 2 bis. LA FICHE D'UN CABINET ET L'ÉQUIPE DU REVENDEUR (0057) disent ce
   qu'elles promettent : la fiche nomme le cabinet choisi, son contrat, ses
   chiffres et son historique ; l'onglet Équipe, ses membres et les
   coordonnées que liront les praticiennes. Et une fiche inconnue ne plante
   pas : elle le dit. */
{
  const fiche = rendu('revendeur/fiche-ollivier', { space: 'reseller', rView: 'fiche', rSel: 'ollivier' })
  const attendus = ['Cabinet Laetitia Ollivier', 'Contrat et offre', 'Historique du contrat', 'Praticiennes', 'Analyse']
  const manque = attendus.filter((t) => !fiche.includes(t))
  if (manque.length) {
    console.error(`✗ revendeur/fiche : il manque ${manque.join(', ')}`)
    echecs++
  } else {
    console.log('✓ revendeur/fiche      contrat, chiffres, praticiennes et historique')
  }
  const inconnue = rendu('revendeur/fiche-inconnue', { space: 'reseller', rView: 'fiche', rSel: 'personne' })
  if (inconnue && !inconnue.includes('pas, ou plus, dans votre portefeuille')) {
    console.error("✗ revendeur/fiche-inconnue : une fiche introuvable ne le dit pas")
    echecs++
  } else if (inconnue) {
    console.log('✓ revendeur/fiche-inconnue  dite, sans planter')
  }
  const equipe = rendu('revendeur/equipe-contenu', { space: 'reseller', rView: 'equipe' })
  const attendusEquipe = ['Membres', 'Invitations en attente', 'Coordonnées de support']
  const manqueEquipe = attendusEquipe.filter((t) => !equipe.includes(t))
  if (manqueEquipe.length) {
    console.error(`✗ revendeur/equipe : il manque ${manqueEquipe.join(', ')}`)
    echecs++
  } else {
    console.log('✓ revendeur/equipe     membres, invitations, coordonnées de support')
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
  faitAujourdhui: false,
  patient_note: null,
  consigne: {
    duree: '3 minutes',
    quand: 'Au réveil',
    steps: ['Posez les pieds au sol.', 'Comptez trois respirations.'],
    why: 'Pour rompre la première hésitation.',
    quiz: [
      {
        question: 'À quel moment cet exercice se fait-il ?',
        options: ['Au réveil', 'Avant de dormir'],
        correct: 0,
        feedback: 'Au réveil, avant que la journée ait commencé.',
      },
    ],
  },
}
const TACHE_SANS = { ...TACHE_AVEC, id: '2', consigne: null }

try {
  const rien = async () => {}
  const tache = (module: unknown, reponses: Record<string, number> = {}) =>
    renderToString(
      h(Tache as never, {
        module,
        reponses,
        onFermer: () => {},
        onBasculer: rien,
        onNote: rien,
        onRepondre: rien,
      } as never),
    )
  const avec = tache(TACHE_AVEC)
  const sans = tache(TACHE_SANS)
  /* Le quiz était écrit par l'IA, payé, rangé dans la consigne — et le seul
     écran qui l'affichait était l'aperçu de démonstration de l'espace
     cabinet. On éprouve donc les deux moments : la question posée, et le
     retour qui n'apparaît qu'une fois qu'on y a répondu. */
  const repondu = tache(TACHE_AVEC, { '1:0': 1 })
  const manque = [
    !avec.includes('Posez les pieds au sol.') && 'les étapes ne paraissent pas',
    !avec.includes('Pour rompre la première hésitation.') && 'le « pourquoi » ne paraît pas',
    sans.includes('Comment faire') && 'un module sans étapes en annonce quand même',
    !sans.includes('sans consigne écrite') && "l'absence de consigne n'est pas dite",
    !avec.includes('À quel moment cet exercice se fait-il ?') && 'le quiz ne paraît pas',
    !avec.includes('Avant de dormir') && 'les options du quiz ne paraissent pas',
    avec.includes('Au réveil, avant que la journée') && 'le retour du quiz paraît avant la réponse',
    !repondu.includes('Au réveil, avant que la journée') && 'le retour du quiz ne paraît pas après la réponse',
    sans.includes('Avez-vous bien saisi') && 'un exercice sans quiz en annonce un',
  ].filter(Boolean)
  const icones = ['jour', 'journal', 'rdv', 'boutique', 'moi'].filter(
    (nom) => !renderToString(h(IconeOnglet as never, { nom } as never)).includes('<svg'),
  )
  if (manque.length || icones.length) {
    console.error(`✗ patient/tache : ${[...manque, ...icones.map((i) => `icône ${i} vide`)].join(', ')}`)
    echecs++
  } else {
    console.log(`✓ patient/tache     ${String(avec.length).padStart(6)} octets · consigne lue, quiz posé et rendu, 5 icônes`)
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

/* ------------------------------------------------------------------ *
 * Le fil (0054) : le mot lu, le mot répondu
 *
 * Côté cabinet, une page qui attend se signale et reste repliée : l'afficher
 * la dirait lue d'une fiche parcourue en passant. Côté patient, la lecture
 * et la réponse se lisent sous la page. Et la démonstration n'en montre
 * rien : elle n'a ni pages en base, ni personne à qui répondre.
 * ------------------------------------------------------------------ */
{
  const [idFil] = Object.keys(PATIENTS) as [string]
  const ficheFil = PATIENTS[idFil] as (typeof PATIENTS)[string]
  const filHtml = rendu('fil/fiche', {
    space: 'cabinet',
    mode: 'therapist',
    patientsReels: true,
    patients: {
      [idFil]: {
        ...ficheFil,
        journal: [
          { date: 'lundi 3 sept.', trigger: 'Un mot', text: 'TEXTE-EN-ATTENTE', id: 'p-attend', luLe: null },
          { date: 'dimanche 2 sept.', trigger: 'Un mot', text: 'TEXTE-DEJA-LU', id: 'p-lue', luLe: '2026-09-02T18:05:00Z' },
        ],
      },
    },
    patientOrder: [idFil],
    sel: idFil,
    nonLus: { [idFil]: 1 },
    reponses: { 'p-lue': [{ id: 'r1', texte: 'REPONSE-DU-CABINET', le: '2026-09-02T19:00:00Z' }] },
  })
  const demoFil = rendu('fil/demonstration', { space: 'cabinet', mode: 'therapist' })
  const manque = [
    !filHtml.includes('Non lu') && "la page qui attend n'est pas signalée",
    filHtml.includes('TEXTE-EN-ATTENTE') && "la page qui attend s'affiche avant d'être ouverte",
    !filHtml.includes('TEXTE-DEJA-LU') && 'la page lue ne se lit plus',
    !filHtml.includes('REPONSE-DU-CABINET') && 'la réponse ne paraît pas sous sa page',
    !filHtml.includes('1 mot non lu') && 'le compteur de la liste des patients manque',
    !filHtml.includes('Ouvrir une page lui indique') && "la fiche ne dit pas qu'ouvrir une page se voit",
    demoFil.includes('Non lu') && 'la démonstration signale des pages non lues',
  ].filter(Boolean)

  let patientFil = ''
  try {
    const page = (id: string, lu: string | null) => ({
      id,
      title: 'Un mot',
      body: `CORPS-${id}`,
      shared: true,
      written_at: '2026-09-02T10:00:00Z',
      position: null,
      lu_le: lu,
    })
    patientFil = renderToString(
      h(Journal as never, {
        pages: [page('p1', '2026-09-02T18:05:00Z'), page('p2', null)],
        total: 2,
        patientId: 'x',
        cabinetId: 'y',
        onEcrit: async () => {},
        reponses: { p1: [{ id: 'r1', texte: 'REPONSE-SOUS-LA-PAGE', le: '2026-09-02T19:00:00Z', lueLe: null }] },
        pageInitiale: 'p1',
      } as never),
    )
  } catch (err) {
    manque.push(`le journal du patient ne se rend pas : ${(err as Error).message}`)
  }
  if (patientFil) {
    const lus = (patientFil.match(/Lu par votre thérapeute le/g) ?? []).length
    if (lus !== 1) manque.push(`${lus} mention(s) « Lu par votre thérapeute » pour une seule page lue`)
    if (!patientFil.includes('1 réponse · 1 nouvelle')) manque.push("la réponse qui attend n'est pas annoncée")
    if (!patientFil.includes('REPONSE-SOUS-LA-PAGE')) manque.push("la page demandée ne s'ouvre pas sur sa réponse")
  }

  if (manque.length) {
    console.error(`✗ fil : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ fil               ${String(filHtml.length).padStart(6)} octets · non lu replié, lu et réponse chez le patient`)
  }
}

/* LE DOSSIER DE LA FICHE (0053). Les volets « Séances » et « Anamnèse et
   notes » existent dans la navigation de la fiche ; l'historique relit la
   note d'une séance et tait celle d'une séance au consentement retiré ; sans
   cabinet réel, aucun des trois écrans n'invente de dossier. */
{
  const manque: string[] = []
  const fiche = rendu('cabinet/therapist-volets', { space: 'cabinet', mode: 'therapist' })
  for (const volet of ['Séances', 'Anamnèse et notes', 'Réglages de la fiche']) {
    if (fiche && !fiche.includes(`>${volet}</button>`)) manque.push(`le volet « ${volet} » manque à la fiche`)
  }

  const SEANCES = [
    {
      id: 'recente',
      le: '2026-09-25T09:00:00Z',
      dureeSecondes: 3120,
      etat: 'envoyee',
      retireeLe: null,
      envoyeeLe: '2026-09-25T10:00:00Z',
      notes: 'NOTES-DE-SEANCE',
      brouillon: {
        synthese: 'SYNTHESE-RECENTE',
        mots: ['la porte du soir'],
        themes: [],
        questions: ['QUESTION-A-REPRENDRE'],
        vigilance: [{ point: 'VIGILANCE-POINT', conduite: 'en reparler' }],
      },
    },
    {
      id: 'retiree',
      le: '2026-09-18T09:00:00Z',
      dureeSecondes: 900,
      etat: 'retiree',
      retireeLe: '2026-09-18T11:00:00Z',
      envoyeeLe: null,
      notes: '',
      brouillon: null,
    },
  ]
  let ouverte = ''
  let retiree = ''
  let vide = ''
  try {
    const liste = (id: string | null) =>
      renderToString(h(ListeDesSeances as never, { seances: SEANCES, ouverte: id, onBasculer: () => {} } as never))
    ouverte = liste('recente')
    retiree = liste('retiree')
    vide = renderToString(h(ListeDesSeances as never, { seances: [], ouverte: null, onBasculer: () => {} } as never))
  } catch (err) {
    manque.push(`l'historique des séances ne se rend pas : ${(err as Error).message}`)
  }
  if (ouverte) {
    for (const [attendu, quoi] of [
      ['SYNTHESE-RECENTE', 'la synthèse'],
      ['NOTES-DE-SEANCE', 'les notes de séance'],
      ['la porte du soir', 'les mots de la séance'],
      ['QUESTION-A-REPRENDRE', 'les questions à reprendre'],
      ['VIGILANCE-POINT', 'les points de vigilance'],
      ['52 min', 'la durée'],
    ] as const) {
      if (!ouverte.includes(attendu)) manque.push(`la séance ouverte ne montre pas ${quoi}`)
    }
    if (!ouverte.includes('aria-expanded="true"')) manque.push("la séance ouverte ne le dit pas aux lecteurs d'écran")
    if (/transcript(?!ion)/i.test(ouverte)) manque.push('une transcription paraît dans l’historique')
  }
  if (retiree) {
    if (!retiree.includes('Consentement retiré')) manque.push('la séance au consentement retiré ne le dit pas')
    if (!retiree.includes('a été effacé')) manque.push("l'effacement n'est pas dit")
    if (retiree.includes('SYNTHESE-RECENTE')) manque.push('une séance repliée montre sa synthèse')
  }
  if (vide && !vide.includes('Aucune séance au dossier')) manque.push("l'historique vide ne dit pas quoi faire")

  // Sans cabinet réel : chaque écran le dit, aucun n'invente.
  const demo = { space: 'cabinet', mode: 'therapist' } as const
  const ecrans: Array<[string, unknown, string]> = [
    ['séances', SeancesFiche, 'L’historique des séances se lit sur le dossier réel'],
    ['anamnèse', NotesCliniques, 'la fiche de démonstration n’en garde pas'],
    ['export', ExportDossier, 'L’export se fait depuis le dossier réel'],
  ]
  for (const [nom, ecran, phrase] of ecrans) {
    try {
      const html = renderToString(h(AppStoreProvider, { initial: demo }, h(ecran as never)))
      if (!html.includes(phrase)) manque.push(`l'écran ${nom} ne dit pas qu'il attend un dossier réel`)
      if (nom === 'export') {
        if (!/<button[^>]*disabled[^>]*>Télécharger le dossier/.test(html)) manque.push("l'export se propose en démonstration")
        if (!html.includes('journal privé')) manque.push("l'export ne dit pas que le journal privé n'y est pas")
      }
    } catch (err) {
      manque.push(`l'écran ${nom} ne se rend pas : ${(err as Error).message}`)
    }
  }

  if (manque.length) {
    console.error(`✗ dossier : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ dossier           ${String(ouverte.length).padStart(6)} octets · séances relues, retrait tu, volets présents, rien d'inventé hors cabinet`)
  }
}

/* LES RAPPELS (0055). Côté cabinet, les rappels réguliers existent dans
   l'écran des notifications, disent leur prochain envoi, s'arrêtent, et ne
   se programment pas en démonstration. Côté patient, les réglages montrent
   l'aperçu exact de l'écran verrouillé — masqué par défaut —, avertissent
   quand le contenu s'affiche, et une lecture ratée ne se fait pas passer
   pour des réglages. */
{
  const manque: string[] = []
  const MARDI_10H = new Date('2026-09-29T08:00:00Z')
  const rien = async () => ({ ok: true, message: '' })

  const notif = rendu('cabinet/notif-rappels', { space: 'cabinet', mode: 'notif' })
  if (notif) {
    if (!notif.includes('Rappels réguliers')) manque.push("les rappels réguliers manquent à l'écran des notifications")
    if (!notif.includes('Démonstration : les rappels réguliers')) manque.push('la démonstration ne dit pas que rien ne partira')
    if (!/<button[^>]*type="submit"[^>]*disabled[^>]*>Programmer ce rappel/.test(notif)) {
      manque.push('un rappel régulier se programme en démonstration')
    }
    if (!notif.includes(MOT_MASQUE.titre)) manque.push("l'éditeur ne dit pas ce que montre l'écran verrouillé")
  }

  const vue = (props: Record<string, unknown>) =>
    renderToString(
      h(VueRappelsReguliers as never, {
        rappels: [],
        personnes: [{ id: 'a', nom: 'Anna' }, { id: 'b', nom: 'Bea' }],
        groupe: ['a'],
        telephones: { a: 1 },
        onProgrammer: rien,
        onArreter: rien,
        onRelire: () => {},
        maintenant: MARDI_10H,
        fuseau: 'Europe/Paris',
        etat: 'pret',
        ...props,
      } as never),
    )
  try {
    const liste = vue({
      rappels: [
        {
          id: 'r1', titre: 'Respiration', texte: 'Trois respirations lentes.', jourSemaine: 1, heure: '09:30',
          finLe: '2026-10-27', creeLe: '2026-09-20T08:00:00Z', annuleLe: null,
          destinataires: [{ id: 'a', nom: 'Anna', clos: false }],
        },
        {
          id: 'r2', titre: 'Ancien', texte: 'x', jourSemaine: null, heure: '20:00',
          finLe: '2026-09-01', creeLe: '2026-08-01T08:00:00Z', annuleLe: null, destinataires: [],
        },
      ],
    })
    for (const [attendu, quoi] of [
      ['Chaque lundi, 9 h 30', 'la récurrence'],
      ['Prochain envoi : lundi 5 octobre, 9 h 30', 'le prochain envoi'],
      ['Arrêter le rappel « Respiration »', "le geste d'arrêt"],
      ['Voir les rappels terminés ou arrêtés (1)', 'les rappels terminés, repliés'],
      ['sans rappels activés', 'qui ne recevra rien sur son téléphone'],
    ] as const) {
      if (!liste.includes(attendu)) manque.push(`la liste des rappels ne montre pas ${quoi}`)
    }
    if (liste.includes('Ancien')) manque.push('un rappel terminé se montre déplié')
    if (!vue({}).includes('Aucun rappel régulier en cours')) manque.push("la liste vide ne dit pas quoi faire")
    if (!vue({ etat: 'echec' }).includes('pas pu être lus')) manque.push("l'échec de lecture passe pour une liste vide")
    if (!vue({ etat: 'chargement' }).includes('Lecture des rappels')) manque.push('le chargement ne se dit pas')
    if (!vue({ fuseau: 'America/Montreal' }).includes('(heure de Paris)')) manque.push("l'heure de Paris n'est pas précisée hors de Paris")
  } catch (err) {
    manque.push(`les rappels réguliers ne se rendent pas : ${(err as Error).message}`)
  }

  const reglages = (props: Record<string, unknown>) =>
    renderToString(
      h(VueReglagesRappels as never, {
        etat: 'pret',
        preferences: { masquerContenu: true, soirActif: false, soirHeure: '20:30' },
        enCours: false,
        telephoneActif: true,
        onRegler: rien,
        onRelire: () => {},
        maintenant: MARDI_10H,
        ...props,
      } as never),
    )
  try {
    const masque = reglages({})
    if (!masque.includes(MOT_MASQUE.titre) || !masque.includes(MOT_MASQUE.corps)) {
      manque.push("l'aperçu de l'écran verrouillé ne montre pas le texte neutre")
    }
    if (!/id="rappel-masque"[^>]*checked/.test(masque) && !/checked=""[^>]*id="rappel-masque"/.test(masque)) {
      manque.push("la discrétion n'est pas cochée quand elle est en place")
    }
    if (!masque.includes('role="switch"')) manque.push('les interrupteurs ne se disent pas tels aux lecteurs d’écran')
    if (masque.includes('Toute personne qui voit votre téléphone')) manque.push('l’avertissement paraît alors que le contenu est masqué')

    const affiche = reglages({ preferences: { masquerContenu: false, soirActif: true, soirHeure: '21:00' } })
    if (!affiche.includes('Toute personne qui voit votre téléphone')) manque.push("afficher le contenu ne s'accompagne d'aucun avertissement")
    if (!affiche.includes("Premier rappel aujourd&#x27;hui à 21 h")) manque.push("le rappel du soir n'annonce pas son premier envoi")
    if (!affiche.includes('type="time"')) manque.push("l'heure du rappel du soir ne se choisit pas")

    const ailleurs = reglages({ telephoneActif: false })
    if (!ailleurs.includes('ne sont pas activés sur cet appareil')) manque.push("les réglages ne disent pas qu'ils valent pour d'autres téléphones")

    const rate = reglages({ etat: 'echec', preferences: null })
    if (!rate.includes('pas pu être lus')) manque.push("la lecture ratée des réglages ne se dit pas")
    if (rate.includes(MOT_MASQUE.titre)) manque.push('une lecture ratée montre des réglages supposés')
    if (reglages({ etat: 'indisponible', preferences: null })) manque.push('des réglages sans base se montrent quand même')
  } catch (err) {
    manque.push(`les réglages de rappel ne se rendent pas : ${(err as Error).message}`)
  }

  if (manque.length) {
    console.error(`✗ rappels : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ rappels          ${String(notif.length).padStart(6)} octets · réguliers en place, discrétion par défaut, rien d'inventé hors cabinet`)
  }
}

/* LA SÉCURITÉ DU COMPTE (0056). La porte du second facteur demande le code
   à six chiffres, et laisse partir ; le préavis d'inactivité dit le temps
   qui reste et ce qui serait perdu ; les deux cartes de « Mon compte » se
   rendent sans session, sans rien supposer, et le QR code ne passe jamais
   par du balisage injecté. */
{
  const manque: string[] = []
  let porte = ''
  try {
    porte = renderToString(
      h(DeuxiemeFacteur, {
        email: 'praticienne@exemple.fr',
        verifier: async () => null,
        seDeconnecter: () => {},
      }),
    )
    if (!porte.includes('Le code de votre application')) manque.push('la porte du code ne dit pas ce qu’elle attend')
    if (!porte.includes('autoComplete="one-time-code"') && !porte.includes('autocomplete="one-time-code"'))
      manque.push("le champ du code n'appelle pas le remplissage automatique")
    if (!porte.includes('inputMode="numeric"') && !porte.includes('inputmode="numeric"'))
      manque.push('le champ du code n’ouvre pas le clavier numérique')
    if (!porte.includes('praticienne@exemple.fr')) manque.push('la porte du code ne dit pas pour quel compte')
    if (!porte.includes('Me déconnecter')) manque.push('la porte du code ne laisse pas partir')
    if (!porte.includes('Téléphone perdu')) manque.push('la porte du code ne dit rien du téléphone perdu')
    const vus = noms.filter((n) => porte.includes(n))
    if (vus.length) manque.push(`la porte du code montre des fiches (${vus.join(', ')})`)
  } catch (err) {
    manque.push(`la porte du code ne se rend pas : ${(err as Error).message}`)
  }

  try {
    const preavis = renderToString(h(AvertissementInactivite, { secondes: 45, onRester: () => {}, onPartir: () => {} }))
    if (!preavis.includes('role="alertdialog"')) manque.push("le préavis n'est pas annoncé comme une alerte")
    if (!preavis.includes('45 secondes')) manque.push('le préavis ne dit pas le temps qui reste')
    if (!preavis.includes('Je suis là')) manque.push('le préavis ne propose pas de rester')
    if (!preavis.includes('serait perdu')) manque.push('le préavis ne dit pas ce qui serait perdu')
    const derniere = renderToString(h(AvertissementInactivite, { secondes: 1, onRester: () => {}, onPartir: () => {} }))
    if (!derniere.includes('1 seconde<') || derniere.includes('1 secondes')) manque.push('le préavis écrit « 1 secondes »')
    const garde = renderToString(
      h(AppStoreProvider, { initial: { space: 'cabinet', mode: 'therapist' } }, h(GardeInactivite, { delaiMinutes: 30, onExpire: () => {} })),
    )
    if (garde.includes('alertdialog')) manque.push("la garde d'inactivité s'affiche avant tout délai")
  } catch (err) {
    manque.push(`le préavis d'inactivité ne se rend pas : ${(err as Error).message}`)
  }

  try {
    const mfa = renderToString(h(DoubleAuthentification))
    if (!mfa.includes('Double authentification')) manque.push('la carte de double authentification ne se titre pas')
    if (!mfa.includes('Lecture de votre réglage')) manque.push('la carte de double authentification ne dit pas qu’elle lit')
    if (/Active<|Inactive</.test(mfa)) manque.push('la carte de double authentification suppose un état avant de l’avoir lu')
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'views', 'compte', 'DoubleAuthentification.tsx'), 'utf8')
    if (source.includes('dangerouslySetInnerHTML')) manque.push('le QR code est injecté dans la page au lieu d’une image')

    const delai = renderToString(h(DeconnexionAuto))
    if (!delai.includes('Déconnexion automatique')) manque.push('la carte de déconnexion automatique ne se titre pas')
    if (!/aria-pressed="true"[^>]*>30 min</.test(delai)) manque.push('le délai par défaut n’est pas de 30 minutes')
    for (const choix of ['Jamais', '15 min', '1 heure']) {
      if (!delai.includes(`>${choix}<`)) manque.push(`le délai « ${choix} » n'est pas proposé`)
    }
  } catch (err) {
    manque.push(`les cartes de sécurité ne se rendent pas : ${(err as Error).message}`)
  }

  const compte = rendu('cabinet/compte-securite', { space: 'cabinet', mode: 'compte' })
  if (compte && !compte.includes('Mon compte')) manque.push("« Mon compte » ne se rend plus")

  if (manque.length) {
    console.error(`✗ sécurité : ${manque.join(', ')}`)
    echecs++
  } else {
    console.log(`✓ sécurité         ${String(porte.length).padStart(6)} octets · code demandé, préavis dit, cartes sans état supposé, QR en image`)
  }
}

/* LA PAGE DE VENTE ET LA PORTE DES THÉRAPEUTES (src/vente).
   La page rend sans base ni session ; elle dit les prix réels de la table
   `plans`, la confidentialité telle qu'elle est, la clé Anthropic dont
   dépend l'analyse — et aucun mot qu'elle n'a pas le droit de dire : ni
   label revendiqué, ni témoignage, ni avis de clients, ni note en étoiles.
   Aucune ressource d'ailleurs. Chaque aperçu porte « Exemple fictif » dans
   son cadre, sans cadre tiers ni écart d'échelle. /connexion est la porte
   titrée « Espace thérapeute », avec son chemin de retour et celui de
   l'essai. */
{
  const manque: string[] = []
  let page = ''
  try {
    page = renderToString(h(PageDeVente))
  } catch (err) {
    manque.push(`la page ne se rend pas : ${(err as Error).message}`)
  }
  if (page) {
    const texte = page.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ')
    const interdits = motsInterditsDans(texte)
    if (interdits.length) manque.push(`mots interdits : ${interdits.join(', ')}`)
    for (const p of PLANS) {
      const prix = `${p.priceCents / 100} €`
      if (!texte.includes(prix)) manque.push(`le prix de l'offre ${p.label} (${prix}) manque`)
      if (!texte.includes(p.label)) manque.push(`l'offre ${p.label} manque`)
    }
    if (!texte.includes('par mois')) manque.push('les prix ne disent pas « par mois »')
    if (!/hors taxes/.test(texte)) manque.push("la mention hors taxes des prix manque")
    // La page ne nomme que le logiciel (demande du 29 septembre 2026).
    if (/Shake/i.test(texte)) manque.push('la page nomme « Shake » : elle ne doit nommer que Klaro')
    for (const [attendu, quoi] of [
      ['Paris', 'la base à Paris'],
      ['Anthropic', "l'analyse chez Anthropic"],
      ['États-Unis', 'les États-Unis'],
      ['7 jours', "l'effacement à 7 jours"],
      ['consentement', 'le consentement'],
      ['éditeur', "l'éditeur du navigateur"],
      ['cloisonné', 'le cloisonnement'],
    ] as const) {
      if (!texte.includes(attendu)) manque.push(`la confidentialité ne dit pas ${quoi}`)
    }
    if (/\b(claude|opus|sonnet|haiku)\b/i.test(texte)) manque.push("un modèle d'IA est nommé")
    if ((page.match(/<h1[\s>]/g) ?? []).length !== 1) manque.push('la page n’a pas exactement un titre h1')
    if (!page.includes('href="/connexion"')) manque.push("« Espace thérapeute » ne mène pas à /connexion")
    if (!page.includes('href="#essai"')) manque.push('« Demander un essai » ne mène pas au formulaire')
    // Une demande, pas un accès : l'essai s'ouvre après un échange.
    if (/Essayer \d+ jours/.test(texte)) manque.push('un bouton promet un essai immédiat (« Essayer 14 jours »)')
    // L'IA se paie en jetons : la page le dit près des offres et près de la note.
    if (!/Les jetons d’IA, inclus chaque mois/.test(texte)) manque.push('les jetons d’IA ne sont pas dits près des offres')
    if (!/Sans jetons disponibles, l’espace patient et le suivi fonctionnent, mais aucune note n’est rédigée/.test(texte)) {
      manque.push('la page ne dit pas ce qui se passe sans jetons')
    }
    if (/colle(?:z)? sa clé|ne prend rien dessus|la clé Anthropic de votre cabinet/.test(texte)) {
      manque.push('la page demande encore la clé Anthropic du cabinet')
    }
    if (!/TVA non applicable, art\. 293 B du CGI/.test(texte)) manque.push('la franchise de TVA n’est pas dite')
    if (!/sans engagement/.test(texte)) manque.push('l’engagement n’est pas dit')
    // Les conditions générales : une case à part, jamais cochée d'avance, et les deux documents.
    const caseConditions = /<input[^>]*data-champ="conditions"[^>]*>/.exec(page)?.[0] ?? ''
    if (!caseConditions) manque.push('la case des conditions générales manque au formulaire')
    else if (!/required/.test(caseConditions) || /checked=""/.test(caseConditions)) {
      manque.push('la case des conditions générales n’est pas exigée, ou arrive cochée')
    }
    for (const chemin of ['/cgv', '/cgu']) {
      if (!new RegExp(`<label[^>]*>J’ai lu et j’accepte les[\\s\\S]*?<a href="${chemin}" target="_blank"`).test(page)) {
        manque.push(`la case des conditions ne mène pas à ${chemin} dans un nouvel onglet`)
      }
    }
    if (/avant chaque analyse/i.test(texte)) manque.push('la page promet une estimation « avant chaque analyse »')
    if (/Plusieurs praticiennes/i.test(texte)) manque.push("l'équipe est vendue comme propre à une offre")
    // Les chemins de celui qui publie les pages (src/legal/chemins.ts).
    for (const { chemin } of LIENS_LEGAUX) {
      if (!page.includes(`href="${chemin}"`)) manque.push(`le pied de page ne mène pas à ${chemin}`)
    }
    if (/(?:src|href)="(?:https?:)?\/\//.test(page)) manque.push('une ressource ou un lien sort de chez nous')
    if (!/type="checkbox"[^>]*required|required[^>]*type="checkbox"/.test(page)) manque.push('le consentement au recontact n’est pas exigé')
    if (!/aria-hidden="true"[^>]*>\s*<label[^>]*>Ne remplissez pas ce champ/.test(page)) manque.push('le champ piège manque, ou se voit')
    if (!page.includes('Aller au contenu')) manque.push("le lien d'évitement manque")
  }

  let porte = ''
  try {
    porte = renderToString(h(SessionProvider, null, h(PortePraticienne)))
  } catch (err) {
    manque.push(`la porte ne se rend pas : ${(err as Error).message}`)
  }
  if (porte) {
    if (!porte.includes('Espace thérapeute')) manque.push('la porte ne dit pas « Espace thérapeute »')
    if (!porte.includes('href="/#essai"')) manque.push("la porte n'offre pas le chemin de l'essai")
    if (!porte.includes('href="/"')) manque.push("la porte n'a pas de chemin de retour vers la page")
  }

  let demos = ''
  try {
    demos = renderToString(h(TelephoneDemo)) + renderToString(h(SuiviDemo)) + renderToString(h(NoteDemo))
  } catch (err) {
    manque.push(`les aperçus ne se rendent pas : ${(err as Error).message}`)
  }
  if (demos) {
    if (!demos.includes('Bonjour')) manque.push("l'aperçu patient ne montre pas la journée")
    if (!demos.includes('décroche')) manque.push("l'aperçu du suivi ne montre pas qui décroche")
    if (/<iframe/.test(demos)) manque.push('un aperçu encadre une page tierce')
    if (/Générer mes affirmations|Renouveler mes affirmations/.test(demos)) manque.push("l'aperçu propose un geste qui appellerait le serveur")
    // Chaque cadre dit qu'il est fictif ; aucun ne montre un écart spectaculaire.
    if ((demos.match(/Exemple fictif/g) ?? []).length < 4) manque.push('un aperçu ne porte pas « Exemple fictif » dans son cadre')
    if (/\d+\s*→\s*\d+/.test(demos)) manque.push("l'aperçu affiche un écart d'échelle, qui se lit comme un résultat")
    if (!demos.includes('Synthèse de séance')) manque.push("le brouillon de note n'est pas montré")
    const interditsDemos = motsInterditsDans(demos.replace(/<[^>]+>/g, ' '))
    if (interditsDemos.length) manque.push(`mots interdits dans les aperçus : ${interditsDemos.join(', ')}`)
  }

  if (manque.length) {
    console.error(`✗ page de vente : ${manque.join(' ; ')}`)
    echecs++
  } else {
    console.log(`✓ page de vente    ${String(page.length).padStart(6)} octets · prix réels, confidentialité dite, aucun mot interdit, porte et aperçus`)
    // Ce que le code ne sait pas : rappelé, sans faire échouer le banc.
    const aFournir = aFournirAvantLaMiseEnLigne()
    if (aFournir.length) console.log(`  ↳ à fournir avant la mise en ligne : ${aFournir.join(' ; ')}`)
  }
}

/* LES VENTES (0058). Côté cabinet, chaque vente a son reçu ; rembourser se
   confirme sous la vente, dit la somme, le délai de la banque et que rien
   n'est retiré au patient, et reste réservé à la personne titulaire ; un
   remboursement impossible ouvre le paiement dans Stripe, dans un nouvel
   onglet. Le livre des recettes part en initiales, ne s'exporte pas en
   démonstration ni sur une période à l'envers. Côté patient, chaque achat
   a son reçu, et un achat remboursé le dit. */
{
  const manque: string[] = []
  const sans = (html: string) => html.replace(/<!-- -->/g, '')
  const rien = () => {}
  const VENTES = [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Ancrage du soir', amount_cents: 2990, currency: 'eur',
      status: 'payee', paid_at: '2026-09-12T08:00:00Z', rembourse_at: null, patient: 'Nadia Belkacem', genre: 'audio',
    },
    {
      id: 'bbbbbbbb-0000-4000-8000-000000000002', title: 'Sommeil profond', amount_cents: 1500, currency: 'eur',
      status: 'remboursee', paid_at: '2026-08-20T16:00:00Z', rembourse_at: '2026-09-05T06:00:00Z', patient: 'Dominique Roy', genre: 'seance',
    },
  ]
  const ventes = (props: Record<string, unknown>) =>
    sans(
      renderToString(
        h(VueVentes as never, {
          etat: 'pret', ventes: VENTES, limite: 20, peutRembourser: true, aConfirmer: null, enCours: '', retour: null,
          onRecu: rien, onDemander: rien, onConfirmer: rien, onAnnuler: rien, ...props,
        } as never),
      ),
    )
  let liste = ''
  try {
    liste = ventes({})
    if (!liste.includes('Dernières ventes')) manque.push('la liste des ventes ne se titre pas')
    if (!liste.includes('Télécharger le reçu de « Ancrage du soir »')) manque.push("une vente n'a pas son reçu")
    if (!liste.includes('Télécharger le reçu de « Sommeil profond »')) manque.push("une vente remboursée n'a plus son reçu")
    if (!liste.includes('Rembourser « Ancrage du soir »')) manque.push('une vente payée ne se rembourse pas')
    if (liste.includes('Rembourser « Sommeil profond »')) manque.push('une vente remboursée se propose encore au remboursement')
    if (!liste.includes('Remboursée')) manque.push('une vente remboursée ne le dit pas')
    if (!liste.includes('29,90 € encaissés, remboursements déduits')) manque.push("l'encaissé compte une vente remboursée")
    if (liste.includes('Confirmer le remboursement')) manque.push('la confirmation paraît avant la demande')

    const confirme = ventes({ aConfirmer: VENTES[0].id })
    for (const [attendu, quoi] of [
      ['Rembourser 29,90 € à Nadia Belkacem ?', 'la somme et la personne'],
      ['5 à 10 jours', 'le délai de la banque'],
      ['ne s’annule pas', "qu'un remboursement est définitif"],
      ['L’audio acheté reste dans sa bibliothèque', "que l'audio n'est pas retiré"],
      ['Confirmer le remboursement', 'le geste de confirmation'],
      ['role="group"', 'un groupe nommé pour les lecteurs d’écran'],
      ['aria-expanded="true"', "l'état déplié du bouton"],
    ] as const) {
      if (!confirme.includes(attendu)) manque.push(`la confirmation ne montre pas ${quoi}`)
    }

    const refus = ventes({
      retour: {
        commandeId: VENTES[0].id, tone: 'warn', text: 'Votre clé Stripe n’a pas le droit de rembourser.',
        lien: 'https://dashboard.stripe.com/payments/pi_3Nabc',
      },
    })
    if (!/href="https:\/\/dashboard\.stripe\.com\/payments\/pi_3Nabc"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(refus)) {
      manque.push("un remboursement impossible n'ouvre pas le paiement dans Stripe, dans un nouvel onglet")
    }
    if (!refus.includes('role="status"')) manque.push("le retour du remboursement n'est pas annoncé")

    const equipe = ventes({ peutRembourser: false })
    if (equipe.includes('Rembourser «')) manque.push('le remboursement se propose hors de la personne titulaire')
    if (!equipe.includes('réservé à la personne titulaire')) manque.push("l'équipe ne sait pas pourquoi elle ne rembourse pas")
    if (!equipe.includes('Télécharger le reçu')) manque.push("l'équipe ne télécharge plus les reçus")

    if (!ventes({ ventes: [] }).includes('Aucune vente pour l’instant')) manque.push('la liste vide ne dit rien')
    const illisible = ventes({ etat: 'illisible', ventes: [] })
    if (!illisible.includes('n’ont pas pu être lues') || illisible.includes('Aucune vente')) {
      manque.push('une lecture ratée passe pour une boutique sans vente')
    }
  } catch (err) {
    manque.push(`les ventes ne se rendent pas : ${(err as Error).message}`)
  }

  const MARDI = new Date('2026-09-29T08:00:00Z')
  const livre = (props: Record<string, unknown>) =>
    sans(
      renderToString(
        h(VueExportVentes as never, {
          reel: true, choix: 'mois', libre: { du: '2026-09-01', au: '2026-09-30' }, nomsComplets: false, etat: 'repos',
          retour: null, maintenant: MARDI, onChoix: rien, onLibre: rien, onNomsComplets: rien, onExporter: rien, ...props,
        } as never),
      ),
    )
  try {
    const pret = livre({})
    if (!pret.includes('Livre des recettes')) manque.push('le livre des recettes ne se titre pas')
    if (!pret.includes('Période : du 1er au 30 septembre 2026.')) manque.push('la période choisie ne se dit pas')
    if (!pret.includes('journal d’accès')) manque.push("l'export ne dit pas qu'il laisse une trace")
    if (/<input type="checkbox" checked/.test(pret)) manque.push('les noms complets sont cochés par défaut')
    if (pret.includes('nommera chaque personne')) manque.push("l'avertissement des noms paraît sans les noms")
    if (/<button[^>]*disabled[^>]*>Télécharger le livre/.test(pret)) manque.push("le livre ne s'exporte pas d'un cabinet réel")
    for (const p of ['Ce mois-ci', 'Mois dernier', 'Cette année', 'Année dernière', 'Autre période']) {
      if (!pret.includes(`>${p}<`)) manque.push(`la période « ${p} » n'est pas proposée`)
    }
    if (!livre({ nomsComplets: true }).includes('nommera chaque personne')) manque.push("les noms complets partent sans avertissement")
    const envers = livre({ choix: 'libre', libre: { du: '2026-10-01', au: '2026-09-01' } })
    if (!envers.includes('role="alert"') || !envers.includes('vient après la date de fin')) manque.push("une période à l'envers ne se dit pas")
    if (!/<button[^>]*disabled[^>]*>Télécharger le livre/.test(envers)) manque.push("une période à l'envers s'exporte")
    if (!envers.includes('type="date"')) manque.push('la période libre ne se choisit pas au calendrier')
    const demo = livre({ reel: false })
    if (!/<button[^>]*disabled[^>]*>Télécharger le livre/.test(demo)) manque.push("le livre s'exporte en démonstration")
    if (!demo.includes('depuis la boutique réelle')) manque.push('la démonstration ne dit pas pourquoi rien ne part')
    if (!livre({ etat: 'lecture' }).includes('Lecture des ventes…')) manque.push('la lecture du livre ne se dit pas')
  } catch (err) {
    manque.push(`le livre des recettes ne se rend pas : ${(err as Error).message}`)
  }

  try {
    const achats = (props: Record<string, unknown>) =>
      sans(renderToString(h(VueAchats as never, { achats: VENTES, enCours: '', retour: null, onRecu: rien, ...props } as never)))
    const patient = achats({})
    if (!patient.includes('Vos achats')) manque.push('« Vos achats » ne se titre pas')
    if (!patient.includes('Télécharger le reçu de « Ancrage du soir »')) manque.push("un achat du patient n'a pas son reçu")
    if (!patient.includes('Remboursé') || !patient.includes('remboursé le')) manque.push('un achat remboursé ne le dit pas au patient')
    if (/Rembourser/.test(patient)) manque.push('le patient se voit proposer un remboursement')
    if (achats({ achats: [] }) !== '') manque.push('« Vos achats » se montre sans achat')
    if (!achats({ enCours: VENTES[0].id }).includes('en préparation')) manque.push('la préparation du reçu ne se dit pas')
  } catch (err) {
    manque.push(`« Vos achats » ne se rend pas : ${(err as Error).message}`)
  }

  if (manque.length) {
    console.error(`✗ ventes : ${manque.join(' ; ')}`)
    echecs++
  } else {
    console.log(`✓ ventes           ${String(liste.length).padStart(6)} octets · reçus des deux côtés, remboursement confirmé et réservé, livre en initiales`)
  }
}

/* LES PAGES LÉGALES DE LA PLATEFORME (src/legal/). Chacune rend un seul
   titre, toutes ses sections sous leur ancre, son bandeau tant qu'elle n'est
   pas validée, CHAQUE champ à compléter surligné — et ne revendique rien :
   ni certification, ni conformité, ni modèle d'analyse. Aucune ressource
   d'ailleurs. Et les portes y mènent : celle des praticiennes et la page
   d'un cabinet portent les trois liens, qui s'ouvrent dans un nouvel onglet. */
{
  const manque: string[] = []
  let octets = 0
  for (const cle of Object.keys(PAGES_DU_DROIT) as CleLegale[]) {
    const page = PAGES_DU_DROIT[cle]
    let html = ''
    try {
      html = renderToString(h(PageLegaleVue, { cle }))
    } catch (err) {
      manque.push(`${cle} ne se rend pas : ${(err as Error).message}`)
      continue
    }
    octets += html.length
    const texte = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
    if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) manque.push(`${cle} n’a pas exactement un titre h1`)
    if (!texte.includes(page.titre)) manque.push(`${cle} ne porte pas son titre`)
    for (const section of page.sections) {
      if (!html.includes(`id="${section.id}"`)) manque.push(`${cle} : la section « ${section.titre} » manque`)
    }
    const bandeau = html.includes('Document à faire valider juridiquement')
    if (bandeau === VALIDE_JURIDIQUEMENT) {
      manque.push(bandeau ? `${cle} : le bandeau reste sur un document validé` : `${cle} : le bandeau de validation manque`)
    }
    const surlignes = (html.match(/<mark\b/g) ?? []).length
    const champs = champsACompleter(page).length
    if (surlignes !== champs) manque.push(`${cle} : ${surlignes} champ(s) surligné(s) pour ${champs} à compléter`)
    const interdits = [...revendicationsInterdites(texte), ...motsInterditsDans(texte)]
    if (interdits.length) manque.push(`${cle} : ${interdits.join(', ')}`)
    if (!html.includes('aria-current="page"')) manque.push(`${cle} : le document ouvert ne se distingue pas des deux autres`)
    for (const l of LIENS_LEGAUX) {
      if (!html.includes(`href="${l.chemin}"`)) manque.push(`${cle} ne mène pas à ${l.chemin}`)
    }
    if (/src="(?:https?:)?\/\//.test(html)) manque.push(`${cle} charge une ressource d'ailleurs`)
    const vus = noms.filter((n) => html.includes(n))
    if (vus.length) manque.push(`${cle} montre des fiches (${vus.join(', ')})`)
  }

  /* Les conditions de vente lient l'éditrice et les cabinets : la porte des
     professionnels y mène, la page d'un cabinet — que lisent ses patients —
     non (src/legal/chemins.ts, `pro`). */
  const portes: Array<[string, boolean, () => string]> = [
    ['la porte des praticiennes', true, () => renderToString(h(SessionProvider, null, h(PortePraticienne)))],
    ['la page d’un cabinet', false, () => renderToString(h(VitrinePage, { site: SITE_FICTIF as never }))],
  ]
  for (const [nom, pro, rendre] of portes) {
    try {
      const html = rendre()
      for (const l of LIENS_LEGAUX) {
        const lien = new RegExp(`<a[^>]*href="${l.chemin}"[^>]*>`).exec(html)?.[0] ?? ''
        if (l.pro && !pro) {
          if (lien) manque.push(`${nom} mène à ${l.chemin}, réservé aux professionnels`)
          continue
        }
        if (!lien) manque.push(`${nom} ne mène pas à ${l.chemin}`)
        else if (!/target="_blank"/.test(lien) || !/rel="noopener noreferrer"/.test(lien)) {
          manque.push(`${nom} : ${l.chemin} ne s’ouvre pas dans un nouvel onglet`)
        }
      }
    } catch (err) {
      manque.push(`${nom} ne se rend pas : ${(err as Error).message}`)
    }
  }

  /* LA CARTE DES CONDITIONS (src/auth/GardeConditions.tsx, 0067). Une case
     jamais cochée d'avance, les deux documents dans un nouvel onglet, le
     bouton « Accepter et continuer », et une sortie. En marque blanche, ni
     le nom ni le logo de Klaro. */
  const sansGeste = async () => true
  for (const neutre of [false, true]) {
    let html = ''
    try {
      html = renderToString(
        h(CarteConditions, {
          neutre,
          cabinet: neutre ? { nom: 'Cabinet Fontaine', logo: 'CF', logoUrl: null, tagline: 'Hypnose à Nantes' } : null,
          miseAJour: neutre,
          accepter: sansGeste,
          passer: () => undefined,
          seDeconnecter: () => undefined,
        }),
      )
    } catch (err) {
      manque.push(`la carte des conditions ne se rend pas : ${(err as Error).message}`)
      continue
    }
    const quelle = neutre ? 'la carte des conditions en marque blanche' : 'la carte des conditions'
    const caseHtml = /<input[^>]*type="checkbox"[^>]*>/.exec(html)?.[0] ?? ''
    if (!caseHtml || /checked=""/.test(caseHtml) || !/required/.test(caseHtml)) manque.push(`${quelle} : la case manque, n’est pas exigée, ou arrive cochée`)
    for (const chemin of ['/cgv', '/cgu']) {
      if (!new RegExp(`<a href="${chemin}" target="_blank" rel="noopener noreferrer"`).test(html)) {
        manque.push(`${quelle} ne mène pas à ${chemin} dans un nouvel onglet`)
      }
    }
    if (!html.includes('Accepter et continuer')) manque.push(`${quelle} n’a pas son bouton`)
    if (!html.includes(MISE_A_JOUR_DES_CONDITIONS)) manque.push(`${quelle} ne dit pas la version`)
    if (!html.includes('Me déconnecter')) manque.push(`${quelle} n’a pas de sortie`)
    if (neutre && /Klaro|klaro-/i.test(html)) manque.push(`${quelle} montre Klaro`)
    if (!neutre && !html.includes('klaro-monogramme')) manque.push(`${quelle} ne porte pas la marque du produit`)
  }

  if (manque.length) {
    console.error(`✗ pages légales : ${manque.join(' ; ')}`)
    echecs++
  } else {
    console.log(`✓ pages légales    ${String(octets).padStart(6)} octets · sections, bandeau, champs surlignés, rien de revendiqué ; porte et vitrine y mènent`)
  }
}

/* L'AGENDA (0059). La liste des patients s'ouvre sur les séances du jour,
   se range et se filtre sur la vraie date ; la fiche fixe un jour et une
   heure de Paris et dit, mot pour mot, le rappel que la base écrira la
   veille ; un programme porte un parcours par défaut, proposé personne par
   personne — rien ne s'ajoute sans une case cochée. */
{
  const manque: string[] = []
  const nu = (html: string) => html.replace(/<!-- -->/g, '')
  const MARDI_10H = new Date('2026-09-29T08:00:00Z')
  const rien = async () => ({ ok: true, message: '' })

  // La liste : une séance ce soir pour la première fiche de démonstration.
  const premiere = Object.keys(PATIENTS)[0] as string
  const ceSoir = (instantDeParis(jourDeParis(), '23:59') as Date).toISOString()
  const datees = Object.fromEntries(
    Object.entries(PATIENTS).map(([id, p]) => [
      id,
      { ...p, prochaineSeanceLe: id === premiere ? ceSoir : null, prochaineSeanceTexte: null },
    ]),
  ) as unknown as AppState['patients']
  const liste = nu(rendu('cabinet/aujourdhui', { space: 'cabinet', mode: 'therapist', patients: datees }))
  if (liste) {
    const nomPremiere = (PATIENTS[premiere] as { name: string }).name
    const jour = liste.slice(liste.indexOf('Aujourd&#x27;hui'), liste.indexOf('Patients actifs'))
    if (!jour.includes('23 h 59') || !jour.includes(nomPremiere)) manque.push("« Aujourd'hui » ne montre pas la séance du jour")
    if (!liste.includes('Par prochaine séance')) manque.push('la liste ne se range pas par prochaine séance')
    if (!/Sans prochaine séance \(\d+\)/.test(liste)) manque.push('le filtre « sans prochaine séance » ne dit pas son compte')
  }
  const toutesDatees = Object.fromEntries(
    Object.entries(datees).map(([id, p]) => [id, { ...p, prochaineSeanceLe: new Date(Date.now() + 86_400_000).toISOString() }]),
  ) as unknown as AppState['patients']
  const filtree = nu(rendu('cabinet/sans-seance', { space: 'cabinet', mode: 'therapist', patients: toutesDatees, pSansSeance: true }))
  if (filtree && !filtree.includes('Toutes vos fiches ont une prochaine séance datée.')) {
    manque.push('le filtre vide ne dit pas pourquoi la liste est vide')
  }
  const sansFiche = nu(rendu('vide/aujourdhui', { ...VIDE, mode: 'therapist' }))
  if (sansFiche.includes('Aucune séance datée aujourd')) manque.push("« Aujourd'hui » se montre dans un cabinet sans fiche")

  // Le champ de la fiche.
  const champ = (props: Record<string, unknown>) =>
    nu(
      renderToString(
        h(ChampProchaineSeance as never, {
          saisie: { jour: '2026-10-06', heure: '14:30', texte: '' },
          onChange: () => {},
          enregistree: null,
          texteEnregistre: null,
          clos: false,
          maintenant: MARDI_10H,
          fuseau: 'Europe/Paris',
          ...props,
        } as never),
      ),
    )
  try {
    const date = champ({})
    if (!date.includes('type="date"') || !date.includes('type="time"')) manque.push('la séance ne se choisit pas au jour et à l’heure')
    if (!date.includes('Rappel lundi 5 octobre à 18 h : « Votre séance est demain à 14 h 30. »')) {
      manque.push('la fiche ne dit pas le rappel exact de la veille')
    }
    if (date.includes('(heure de Paris)')) manque.push("l'heure de Paris est précisée à Paris")
    if (!champ({ fuseau: 'America/Montreal' }).includes('(heure de Paris)')) manque.push("l'heure de Paris n'est pas précisée hors de Paris")
    const passee = champ({ saisie: { jour: '2026-09-28', heure: '14:00', texte: '' } })
    if (!passee.includes('role="alert"') || !passee.includes('déjà passée')) manque.push('une date passée ne se refuse pas')
    const avant = champ({ saisie: { jour: '', heure: '', texte: 'Jeudi 14 h' }, texteEnregistre: 'Jeudi 14 h' })
    if (!avant.includes('Notée jusqu&#x27;ici en toutes lettres')) manque.push('une fiche d’avant ne dit pas qu’elle reste à dater')
    if (!avant.includes('Datez la séance')) manque.push('une fiche sans date ne dit pas ce que la date apporterait')
    if (!champ({ clos: true }).includes('Suivi clos : aucun rappel ne part.')) manque.push('un suivi clos promet un rappel')
  } catch (err) {
    manque.push(`le champ de la prochaine séance ne se rend pas : ${(err as Error).message}`)
  }

  // Le parcours par défaut d'un programme.
  const EXERCICES = [
    { id: 'e1', titre: 'Respiration carrée', type: 'Exercice', consigne: 'Inspirez quatre temps.\nExpirez quatre temps.' },
    { id: 'e2', titre: 'Trois lignes du soir', type: 'Écriture', consigne: '' },
  ]
  const parcours = (props: Record<string, unknown>) =>
    nu(
      renderToString(
        h(VueParcoursType as never, {
          etat: 'pret',
          programme: 'Sommeil',
          exercices: EXERCICES,
          suiveurs: 2,
          onEnregistrer: rien,
          onRelire: () => {},
          onProposer: () => {},
          ...props,
        } as never),
      ),
    )
  try {
    const plein = parcours({})
    if (!plein.includes('value="Respiration carrée"') || !plein.includes('<option value="Visualisation">')) {
      manque.push('le parcours ne montre pas ses exercices modifiables')
    }
    if (plein.includes('<option value="Audio"')) manque.push('un audio se propose au parcours par défaut')
    if (!plein.includes('Monter l&#x27;exercice 2') || !plein.includes('Retirer l&#x27;exercice 1 « Respiration carrée »')) {
      manque.push('les gestes d’un exercice ne se disent pas aux lecteurs d’écran')
    }
    if (!plein.includes('Le proposer aux 2 personnes qui le suivent')) manque.push('le parcours ne se propose pas aux personnes déjà suivies')
    if (!parcours({ exercices: [] }).includes('Aucun exercice pour l&#x27;instant')) manque.push('le parcours vide ne dit pas quoi faire')
    if (!parcours({ etat: 'chargement', exercices: [] }).includes('Lecture du parcours')) manque.push('la lecture du parcours ne se dit pas')
    if (!parcours({ etat: 'echec' }).includes('n&#x27;a pas pu être lu')) manque.push('un parcours illisible passe pour un parcours vide')
    if (!parcours({ etat: 'indisponible' }).includes('pas encore disponible')) manque.push('une base sans 0059 ne se dit pas')
    if (parcours({ etat: 'demo' }).includes('Enregistrer le parcours')) manque.push('le parcours se règle en démonstration')
  } catch (err) {
    manque.push(`le parcours par défaut ne se rend pas : ${(err as Error).message}`)
  }

  // La proposition, personne par personne.
  const proposer = (props: Record<string, unknown>) =>
    nu(
      renderToString(
        h(VueProposerParcours as never, {
          programme: 'Sommeil',
          exercices: EXERCICES,
          personnes: [{ id: 'a', nom: 'Anna', parcours: [{ title: 'respiration carrée', kind: 'Exercice' }] }],
          onAjouter: rien,
          onFermer: () => {},
          ...props,
        } as never),
      ),
    )
  try {
    const choix = proposer({})
    if (!choix.includes('Proposer le parcours de « Sommeil »')) manque.push('la proposition ne se titre pas')
    if (!choix.includes('déjà dans son parcours')) manque.push('ce que la personne a déjà ne se dit pas')
    if (!/aria-checked="false"[^>]*aria-label="Ajouter « Respiration carrée »/.test(choix)) {
      manque.push('un exercice déjà là est coché d’office')
    }
    if (!/aria-checked="true"[^>]*aria-label="Ne pas ajouter « Trois lignes du soir »/.test(choix)) {
      manque.push('un exercice nouveau n’est pas coché d’office')
    }
    if (!choix.includes('<li>Inspirez quatre temps.</li>')) manque.push('la consigne ne se montre pas telle que le patient la lira')
    if (!choix.includes('Ajouter 1 exercice') || !choix.includes('Ne rien ajouter')) manque.push('les deux gestes de la proposition manquent')
    if (proposer({ exercices: [{ titre: 'Sans identifiant', type: 'Exercice', consigne: '' }] }) !== '') {
      manque.push('un parcours non enregistré se propose')
    }
  } catch (err) {
    manque.push(`la proposition du parcours ne se rend pas : ${(err as Error).message}`)
  }

  if (manque.length) {
    console.error(`✗ agenda : ${manque.join(' ; ')}`)
    echecs++
  } else {
    console.log(`✓ agenda           ${String(liste.length).padStart(6)} octets · séances du jour, liste datée, rappel dit, parcours proposé sans rien imposer`)
  }
}

/* 9. LES JETONS IA (0065). L'onglet du revendeur montre ses sept réglages et
   des marges calculées sur des coûts réels ; la carte du cabinet dit son
   solde, quand son forfait se renouvelle, ce que coûte chaque action et
   comment racheter — ou à qui demander ; la phrase posée à côté d'un bouton
   d'analyse dit le prix et, quand le solde manque, le chemin de la recharge.
   Rien de cela ne s'affiche hors du mode jetons : la démonstration du
   cabinet, sans fournisseur de jetons, garde les textes de la clé. */
{
  const manque: string[] = []
  const onglet = rendu('revendeur/jetons-contenu', { space: 'reseller', rView: 'jetons' })
  for (const titre of [
    'Votre clé d&#x27;analyse',
    'Alimenter tous mes cabinets avec cette clé',
    'Barème des jetons',
    'Recharges',
    'Option Hypnose',
    'Essai',
    'Encaissement',
    'Consommation du mois',
    'Séance complète (note, consignes des exercices retenus, mise à jour du profil)',
    'Hypnose de 30 minutes',
  ]) {
    if (!onglet.includes(titre)) manque.push(`l'onglet revendeur ne dit pas « ${titre} »`)
  }
  if (!/\d+ %/.test(onglet)) manque.push("aucune marge n'est calculée")
  if (!onglet.includes('Réglages de démonstration')) manque.push('la démonstration ne se dit pas en lecture seule')
  if (/sk-ant-[A-Za-z0-9]|sk_live_[A-Za-z0-9]/.test(onglet)) manque.push("un morceau de clé apparaît à l'écran")
  if (onglet.includes('Enregistrer le barème')) manque.push('la démonstration propose de régler ce qu’elle ne peut pas enregistrer')

  // Le propriétaire connecté, posé à la main : lui seul voit les champs et les gestes.
  const proprietaire: JetonsRevendeurData = {
    etat: { ...ETAT_REVENDEUR_DEMO, proprietaire: true },
    reel: true,
    chargement: false,
    erreur: '',
    enCours: '',
    recharger: async () => {},
    agir: async () => ({ ok: true, message: '' }),
    duCabinet: () => null,
  }
  const reglable = renderToString(
    h(
      AppStoreProvider,
      { initial: { space: 'reseller', rView: 'jetons' } },
      h(JetonsRevendeurContexte.Provider, { value: proprietaire }, h(JetonsView)),
    ),
  )
  for (const geste of [
    'Enregistrer le barème',
    'aria-label="Jetons pour : Hypnose de 30 minutes"',
    'Désactiver',
    'Remplacer',
    'Ajouter',
    'Déconnecter',
  ]) {
    if (!reglable.includes(geste)) manque.push(`le propriétaire ne trouve pas « ${geste} »`)
  }
  if (reglable.includes('Réservé au compte propriétaire')) manque.push('le propriétaire lit que le réglage lui est réservé… à quelqu’un d’autre')

  const avecStore = (el: ReturnType<typeof h>) =>
    renderToString(h(AppStoreProvider, { initial: { space: 'cabinet' } }, el))
  const etat = etatJetonsDemo()
  const carte = avecStore(h(VueJetons, { etat, titulaire: true, enCours: '', echec: '' }))
  for (const attendu of [
    'Jetons IA',
    '312',
    'se renouvellent le',
    'ceux qui restent ne se reportent pas',
    'Ce que coûte chaque action',
    'Acheter',
    'Activer l&#x27;option — 19 € pour 30 jours, 200 jetons offerts',
    'Dernières consommations',
  ]) {
    if (!carte.includes(attendu)) manque.push(`la carte du cabinet ne dit pas « ${attendu} »`)
  }
  /* Les retouches ont leur bouton depuis 0066 (le pouce baissé) : leur prix
     se lit sur la carte, comme celui des autres actions. */
  if (!carte.includes('Retouche d&#x27;un texte par l&#x27;IA') || !carte.includes('Retouche d&#x27;un mouvement d&#x27;hypnose')) {
    manque.push('la carte ne dit pas le prix d’une retouche')
  }
  const sansPaiement = avecStore(
    h(VueJetons, { etat: { ...etat, paiementPossible: false }, titulaire: true, enCours: '', echec: '' }),
  )
  if (!sansPaiement.includes('Pour recharger, contactez votre revendeur.')) {
    manque.push('sans paiement en ligne, la carte ne renvoie pas au revendeur')
  }
  if (sansPaiement.includes('>Acheter<')) manque.push('sans paiement en ligne, un bouton « Acheter » reste')
  const consoeur = avecStore(h(VueJetons, { etat, titulaire: false, enCours: '', echec: '' }))
  if (consoeur.includes('>Acheter<') || !consoeur.includes('Seule la titulaire du cabinet')) {
    manque.push('une consœur voit des achats réservés à la titulaire')
  }

  const cout = avecStore(h(CoutEnJetons, { devis: devisJetons(etat, 'seance'), sujet: 'Cette analyse' }))
  if (!cout.includes('Cette analyse utilisera 12 jetons (il vous en reste 312).')) {
    manque.push('le prix de la séance ne se dit pas avant le clic')
  }
  const court = avecStore(
    h(CoutEnJetons, { devis: devisJetons({ ...etat, solde: 3 }, 'seance'), sujet: 'Cette analyse' }),
  )
  if (!court.includes('Il vous reste 3 jetons, et cette analyse en demande 12.') || !court.includes('Voir vos jetons')) {
    manque.push('un solde trop court ne dit pas où trouver des jetons')
  }
  const cle = avecStore(h(CoutEnJetons, { devis: devisJetons({ ...etat, mode: 'cle_cabinet' }, 'seance') }))
  if (cle.includes('jeton')) manque.push('un cabinet qui paie avec sa clé lit un prix en jetons')
  const verrou = avecStore(h(VerrouHypnose, { dejaEcrites: true }))
  if (!verrou.includes('n&#x27;est pas comprise dans votre offre') || !verrou.includes('restent lisibles et téléchargeables')) {
    manque.push("le verrou de l'hypnose ne dit ni pourquoi, ni que les hypnoses écrites restent")
  }

  if (manque.length) {
    console.error(`✗ jetons : ${manque.join(' ; ')}`)
    echecs++
  } else {
    console.log(
      `✓ jetons           ${String(carte.length).padStart(6)} octets · onglet revendeur, carte du cabinet, prix avant le clic, verrou de l'hypnose`,
    )
  }
}

/* 10. LES RETOUCHES (0066). Sous un texte de l'IA, deux pouces de la taille
   d'une icône, nommés pour un lecteur d'écran, qui disent s'ils sont
   enfoncés ; le pouce baissé annonce une fenêtre. La fenêtre en est une
   vraie — rôle, nom, titre relié —, ses deux champs sont obligatoires,
   « Optimiser » reste fermé tant qu'ils sont vides ou que les jetons
   manquent, et le prix se dit en mode jetons. Rien de cela ne paraît en
   démonstration ni dans l'espace du patient, et rien n'y montre un dossier. */
{
  const manque: string[] = []
  const avecStore = (el: ReturnType<typeof h>) =>
    renderToString(h(AppStoreProvider, { initial: { space: 'cabinet' } }, el))

  const mouvement = avecStore(
    h(TexteMouvement, {
      ecrit: { mouvement: 'induction', titre: 'Le poids du siège', texte: 'Installez-vous confortablement.\nEt laissez venir.' },
      classes: { article: 'a', titre: 't', para: 'p' },
      retouche: { onRetoucher: async () => ({ ok: true }) },
    }),
  )
  for (const attendu of [
    'aria-label="Ce contenu me convient"',
    'aria-label="Ce contenu ne me convient pas"',
    'aria-haspopup="dialog"',
    'stroke-width="1.6"',
  ]) {
    if (!mouvement.includes(attendu)) manque.push(`la rangée sous un mouvement ne porte pas ${attendu}`)
  }
  if ((mouvement.match(/aria-pressed="false"/g) ?? []).length !== 2) manque.push('les pouces ne disent pas qu’ils sont relâchés')
  if (mouvement.indexOf('Et laissez venir.') > mouvement.indexOf('Ce contenu me convient')) {
    manque.push('les pouces passent avant le texte du mouvement')
  }
  const avisSeul = avecStore(h(RetourIA, { cible: 'vigilance' }))
  if (avisSeul.includes('aria-haspopup') || !avisSeul.includes('Ce contenu ne me convient pas')) {
    manque.push('un avis sans retouche annonce une fenêtre, ou perd son pouce')
  }

  const fenetre = (props: Partial<Parameters<typeof FenetreRetouche>[0]> = {}) =>
    avecStore(
      h(FenetreRetouche, {
        cible: 'hypnose',
        libelle: 'le mouvement « Induction »',
        devis: null,
        onFermer: () => {},
        onOptimiser: async () => ({ ok: true }),
        ...props,
      }),
    )
  const vide = fenetre()
  const titre = /<h2 id="([^"]+)"[^>]*>Retour sur l&#x27;IA<\/h2>/.exec(vide)
  if (!vide.includes('role="dialog"') || !vide.includes('aria-modal="true"')) manque.push('la fenêtre ne se dit pas fenêtre')
  if (!titre || !vide.includes(`aria-labelledby="${titre[1]}"`)) manque.push('la fenêtre ne porte pas son titre pour nom')
  for (const attendu of [
    'Qu&#x27;est-ce que l&#x27;IA a mal fait, et qu&#x27;aurait-elle dû faire ?',
    'Qu&#x27;est-ce que l&#x27;IA a mal fait ?',
    'Que se serait-il dû passer ?',
    'placeholder="Le rythme de l&#x27;induction est trop rapide"',
    'placeholder="Des phrases plus longues, plus lentes, avec davantage de pauses"',
    'Retenir cette préférence pour les prochaines générations',
    'aria-label="Fermer"',
    '>Annuler<',
    'aria-required="true"',
  ]) {
    if (!vide.includes(attendu)) manque.push(`la fenêtre ne dit pas « ${attendu} »`)
  }
  if ((vide.match(/>\*<\/span>/g) ?? []).length !== 2) manque.push('les deux champs ne portent pas leur astérisque')
  if (/type="checkbox"[^>]*checked/.test(vide)) manque.push('« Retenir cette préférence » est cochée d’office')
  const optimiser = (html: string) => /<button[^>]*>(?:(?!<\/button>).)*Optimiser<\/button>/.exec(html)?.[0] ?? ''
  if (!optimiser(vide).includes('disabled')) manque.push('« Optimiser » s’ouvre sur des champs vides')
  const remplie = fenetre({ initial: { probleme: 'Trop rapide', attendu: 'Plus lent' } })
  if (optimiser(remplie).includes('disabled')) manque.push('« Optimiser » reste fermé, les deux champs remplis')

  const etat = etatJetonsDemo()
  const prixHypnose = fenetre({ devis: devisJetons(etat, 'retouche_hypnose') })
  if (!prixHypnose.includes('Cette retouche utilisera 8 jetons (il vous en reste 312).')) {
    manque.push("le prix d'une retouche d'hypnose ne se dit pas")
  }
  const prixTexte = fenetre({ cible: 'synthese', libelle: 'la synthèse de séance', devis: devisJetons(etat, 'retouche') })
  if (!prixTexte.includes('Cette retouche utilisera 3 jetons (il vous en reste 312).')) manque.push("le prix d'une retouche ne se dit pas")
  if (!prixTexte.includes('placeholder="La synthèse interprète au lieu de rapporter"')) manque.push("l'exemple ne parle pas du texte retouché")
  const court = fenetre({
    devis: devisJetons({ ...etat, solde: 2 }, 'retouche_hypnose'),
    initial: { probleme: 'Trop rapide', attendu: 'Plus lent' },
  })
  if (!court.includes('Il vous reste 2 jetons, et cette retouche en demande 8.') || !optimiser(court).includes('disabled')) {
    manque.push('un solde trop court laisse « Optimiser » ouvert, ou ne le dit pas')
  }
  const refus402 = fenetre({ initial: { echec: { message: 'Il vous reste 2 jetons, et cette action en demande 8.', statut: 402 } } })
  if (!refus402.includes('role="alert"') || !refus402.includes('Voir vos jetons')) {
    manque.push('un refus faute de jetons ne montre pas le chemin de la recharge')
  }
  const refus403 = fenetre({ initial: { echec: { message: "L'hypnose n'est pas comprise dans votre offre.", statut: 403 } } })
  if (refus403.includes('Voir vos jetons')) manque.push('un refus de l’option Hypnose renvoie à la recharge')

  const preferences = avecStore(
    h(VuePreferencesIA, {
      lecture: [
        { id: 'p1', cible: 'hypnose', consigne: 'Des pauses marquées entre les phrases', creeLe: '2026-09-30T09:00:00Z' },
        { id: 'p2', cible: 'message', consigne: 'Un ton plus chaleureux', creeLe: '2026-09-29T09:00:00Z' },
      ],
      chargement: false,
      enCours: '',
      echec: '',
      onOublier: () => {},
      onRelire: () => {},
    }),
  )
  for (const attendu of [
    'Préférences de l&#x27;IA',
    'Mouvements d&#x27;hypnose',
    'Messages au patient',
    'Des pauses marquées entre les phrases',
    'aria-label="Oublier la préférence « Un ton plus chaleureux »"',
  ]) {
    if (!preferences.includes(attendu)) manque.push(`les préférences ne disent pas « ${attendu} »`)
  }
  const aucune = avecStore(h(VuePreferencesIA, { lecture: [], chargement: false, enCours: '', echec: '', onOublier: () => {}, onRelire: () => {} }))
  if (!aucune.includes('Aucune préférence retenue')) manque.push('une liste vide ne dit pas comment en retenir')

  // Rien du dossier dans la rangée, la fenêtre ou la liste : ni nom, ni extrait.
  const retouches = [mouvement, avisSeul, vide, remplie, prixHypnose, prixTexte, court, refus402, preferences].join('')
  const vus = noms.concat(extraits).filter((n) => n && retouches.includes(n))
  if (vus.length) manque.push(`un dossier filtre dans les retouches : ${vus.join(', ')}`)

  /* En démonstration — séance au brouillon complet, fiche, atelier — et dans
     l'espace du patient : pas un pouce. Ils ne paraissent que dans un
     cabinet réel, où la retouche s'enregistre. */
  const BROUILLON_PLEIN = {
    synthese: 'Texte de maquette.',
    mots: ['une porte'],
    themes: ['le délai'],
    propositions: [{ titre: 'Repérer le seuil', pourquoi: 'Écrire les signes.', type: 'Journal' }],
    questions: ['Qu’est-ce qui précède ?'],
    vigilance: [{ point: 'Un point', conduite: 'Une conduite' }],
    categories_audio: [],
    message: 'Bonjour.',
  }
  const demos = [
    rendu('retouche/seance', { space: 'cabinet', mode: 'session', sessionPatient: choisie, consent: true, draft: BROUILLON_PLEIN, draftMaquette: false }),
    rendu('retouche/fiche', { space: 'cabinet', mode: 'therapist' }),
    rendu('retouche/atelier', { space: 'cabinet', mode: 'atelier' }),
    rendu('retouche/patient', { space: 'patient' }),
  ]
  if (demos.some((html) => html.includes('Ce contenu ne me convient pas'))) {
    manque.push('les pouces paraissent hors d’un cabinet réel')
  }

  if (manque.length) {
    console.error(`✗ retouches : ${manque.join(' ; ')}`)
    echecs++
  } else {
    console.log(
      `✓ retouches        ${String(vide.length).padStart(6)} octets · pouces nommés, fenêtre accessible, prix en jetons, préférences, rien en démonstration`,
    )
  }
}

if (echecs > 0) {
  console.error(`\n${echecs} échec(s).`)
  process.exit(1)
}
console.log('\nRendu conforme.')

