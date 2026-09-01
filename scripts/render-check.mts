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
const MODES: ViewMode[] = ['therapist', 'patient', 'session', 'atelier', 'audios', 'notif']
for (const mode of MODES) {
  const html = rendu(`cabinet/${mode}`, { space: 'cabinet', mode })
  if (html) console.log(`✓ cabinet/${mode.padEnd(9)} ${String(html.length).padStart(6)} octets`)
}

// 1 bis. Un cabinet sans patiente : le premier écran d'une praticienne qui
// vient d'accepter son invitation. La fiche n'a rien à montrer, et l'afficher
// planterait — c'est arrivé.
const vide = rendu('cabinet/sans-patiente', {
  space: 'cabinet',
  mode: 'therapist',
  patients: {},
  patientOrder: [],
  sel: '',
  patientsReels: true,
})
if (vide && !vide.includes('Votre cabinet est prêt')) {
  console.error("✗ cabinet/sans-patiente : l'écran d'accueil du cabinet vide ne s'affiche pas")
  echecs++
} else if (vide) {
  console.log(`✓ cabinet/sans-patiente ${String(vide.length).padStart(6)} octets · accueil affiché`)
}

// 1 ter. TOUTES les vues du cabinet doivent tenir sans patiente : c'est
// l'état normal d'un cabinet qui vient d'ouvrir, pas un cas limite.
const VIDE = { space: 'cabinet', patients: {}, patientOrder: [], sel: '', patientsReels: true } as const
for (const mode of MODES) {
  const html = rendu(`vide/${mode}`, { ...VIDE, mode })
  if (html) console.log(`✓ vide/${mode.padEnd(12)} ${String(html.length).padStart(6)} octets`)
}

// 1 quater. La séance ne s'ouvre jamais sur une fiche que personne n'a
// choisie. C'était le défaut : l'écran de consentement portait le nom d'une
// patiente d'exemple, quel que soit le cabinet.
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

// 2. Les trois vues du revendeur rendent, et ne montrent aucun patient.
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

if (echecs > 0) {
  console.error(`\n${echecs} échec(s).`)
  process.exit(1)
}
console.log('\nRendu conforme.')
