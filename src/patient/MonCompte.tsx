import { useState } from 'react'
import { useAuth } from '@/auth/session'
import { plural } from '@/lib/format'
import { entreeParLienRecente, lireEntrees, LONGUEUR_MOT_DE_PASSE, refusDuNouveau } from '@/lib/motDePasse'
import { supabase } from '@/lib/supabase'
import type { PatientIdentity } from '@/auth/session'
import { journalEnTexte, nomDuFichierJournal, type PageExportee } from './exportJournal'
import { Installer } from './Installer'
import { Rappels } from './Rappels'
import { oublierCeTelephone } from './rappelsNavigateur'
import { supprimerCeCompte } from './suppressionCompte'
import s from './MonCompte.module.css'

/**
 * Son compte, à elle.
 *
 * Ses gestes, et celui qui supprime demande d'être honnête sur ce qu'il fait.
 *
 * SUPPRIMER SON COMPTE N'EFFACE PAS SON DOSSIER, et l'écran le dit avant de
 * le faire. Le dossier de suivi — les séances, le profil, ce que la
 * thérapeute a noté — appartient au cabinet, qui en est le détenteur et a
 * l'obligation de le conserver. Ce que ce bouton supprime, c'est l'ACCÈS :
 * le compte disparaît, la fiche est détachée, l'espace se referme. Pour que
 * le dossier lui-même soit effacé, il faut le demander à sa thérapeute, et
 * l'écran le dit aussi.
 *
 * Le journal, en revanche, est à elle : il part avec le compte.
 */
export function MonCompte({ patient }: { patient: PatientIdentity }) {
  const { changerMotDePasse, deconnecterAilleurs, seDeconnecter, session, context } = useAuth()
  /* Le même compte peut ouvrir un espace professionnel : la suppression ne
     ferme alors que l'espace patient, et l'écran le dit AVANT. */
  const autreEspace = Boolean(context?.cabinet || context?.reseller)
  const [ancien, setAncien] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [enCours, setEnCours] = useState('')
  const [notice, setNotice] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null)
  const [appareils, setAppareils] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null)
  const [echecSuppression, setEchecSuppression] = useState('')
  const [confirme, setConfirme] = useState(false)
  const [exportJournal, setExport] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null)

  /* L'ancien mot de passe n'est pas demandé juste après une entrée par lien :
     c'est la voie de qui l'a oublié, ou n'en a jamais choisi. Le serveur le
     vérifie de son côté ; l'écran ne fait que ne pas poser une question
     inutile. */
  const parLien = entreeParLienRecente(lireEntrees(session?.access_token), Date.now())
  const refus = motDePasse ? refusDuNouveau(motDePasse, session?.user.email) : null
  const identiques = motDePasse === confirmation
  const pret = Boolean(motDePasse) && !refus && identiques && (parLien || ancien.length > 0) && enCours === ''

  async function poserMotDePasse() {
    if (!pret) return
    setEnCours('mdp')
    const r = await changerMotDePasse(parLien ? '' : ancien, motDePasse)
    setEnCours('')
    // On ne vide les champs qu'en cas de succès : sur un refus, effacer ce qui
    // vient d'être tapé oblige à tout retaper sans savoir ce qui clochait.
    if (r.ok) {
      setAncien('')
      setMotDePasse('')
      setConfirmation('')
    }
    setNotice({ ton: r.ok ? 'ok' : 'erreur', texte: r.message })
  }

  async function fermerLesAutres() {
    if (enCours) return
    setEnCours('appareils')
    const r = await deconnecterAilleurs()
    setEnCours('')
    setAppareils({ ton: r.ok ? 'ok' : 'erreur', texte: r.message })
  }

  async function supprimer() {
    if (enCours) return
    setEnCours('suppression')
    setEchecSuppression('')
    // Le même geste que depuis l'avis « Aucun suivi en cours » : il vit dans
    // suppressionCompte.ts, qui referme aussi ce que l'appareil garde.
    const refus = await supprimerCeCompte(seDeconnecter)
    if (refus) {
      setEnCours('')
      setEchecSuppression(refus)
    }
  }

  /**
   * Emporter son journal, avant de partir ou simplement pour le garder.
   *
   * TOUTES les pages, lues ici : la journée n'en charge qu'une partie, et
   * une copie à laquelle il manque les premiers mois ne vaut pas grand-chose.
   * Le fichier est fabriqué dans le navigateur : le journal ne transite par
   * aucun serveur de plus pour être téléchargé.
   */
  async function telechargerJournal() {
    const db = supabase()
    if (!db || enCours) return
    setEnCours('export')
    setExport(null)
    const pages: PageExportee[] = []
    const PAR_LOT = 500
    for (let debut = 0; ; debut += PAR_LOT) {
      const { data, error } = await db
        .from('journal_pages')
        .select('title, body, shared, written_at')
        .eq('patient_id', patient.id)
        .order('written_at', { ascending: true })
        .range(debut, debut + PAR_LOT - 1)
      if (error) {
        setEnCours('')
        setExport({ ton: 'erreur', texte: "Votre journal n'a pas pu être lu. Réessayez dans un instant." })
        return
      }
      pages.push(...((data ?? []) as PageExportee[]))
      if (!data || data.length < PAR_LOT) break
    }
    const maintenant = new Date()
    const texte = journalEnTexte(pages, { nom: patient.display_name, cabinet: patient.cabinet_name, le: maintenant })
    const url = URL.createObjectURL(new Blob([texte], { type: 'text/plain;charset=utf-8' }))
    const lien = document.createElement('a')
    lien.href = url
    lien.download = nomDuFichierJournal(maintenant)
    document.body.appendChild(lien)
    lien.click()
    lien.remove()
    // Laissé le temps au téléchargement de partir avant de libérer l'adresse.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    setEnCours('')
    setExport({
      ton: 'ok',
      texte: pages.length
        ? `${plural(pages.length, 'page copiée', 'pages copiées')} dans le fichier ${lien.download}.`
        : "Votre journal est vide : le fichier ne contient que son titre.",
    })
  }

  return (
    <div className={s.wrap}>
      <section className={s.carte}>
        <h2 className={s.titre}>Votre espace</h2>
        <dl className={s.infos}>
          <div className={s.ligne}>
            <dt className={s.cle}>Nom</dt>
            <dd className={s.valeur}>{patient.display_name}</dd>
          </div>
          <div className={s.ligne}>
            <dt className={s.cle}>Cabinet</dt>
            <dd className={s.valeur}>{patient.cabinet_name}</dd>
          </div>
        </dl>
      </section>

      <Installer variante="reglage" accent={patient.branding?.accent} />

      <Rappels
        variante="reglage"
        patientId={patient.id}
        cabinet={patient.cabinet_name}
        accent={patient.branding?.accent}
      />

      <section className={s.carte}>
        <h2 className={s.titre}>Votre mot de passe</h2>
        <p className={s.texte}>
          Le courriel de connexion — son lien ou son code — reste la voie normale, et vous n'avez
          rien à retenir. Un mot de passe vous évite d'attendre le courriel quand vous ouvrez votre
          espace souvent. Une fois changé, vos autres appareils sont déconnectés.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void poserMotDePasse()
          }}
        >
          {/* L'identifiant, caché : le gestionnaire de mots de passe du
              téléphone sait ainsi pour quel compte il enregistre. */}
          <input type="email" autoComplete="username" value={session?.user.email ?? ''} readOnly hidden />
          {parLien ? (
            <p className={s.aide}>
              Vous venez d'entrer par un courriel de connexion : votre mot de passe actuel ne vous
              est pas demandé.
            </p>
          ) : (
            <>
              <input
                className={s.champ}
                type="password"
                value={ancien}
                onChange={(e) => setAncien(e.target.value)}
                placeholder="Mot de passe actuel"
                autoComplete="current-password"
                aria-label="Mot de passe actuel"
              />
              <p className={s.aide}>
                Oublié, ou jamais choisi ? Déconnectez-vous et entrez par un lien ou un code reçu
                par courriel : pendant 24 heures, il ne vous sera pas demandé.
              </p>
            </>
          )}
          <input
            className={s.champ}
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder={`Nouveau — au moins ${LONGUEUR_MOT_DE_PASSE} caractères`}
            autoComplete="new-password"
            aria-label="Nouveau mot de passe"
            aria-invalid={refus ? true : undefined}
          />
          <p className={s.aide}>
            {refus ??
              "Trois mots sans rapport font un bon mot de passe : plus long à casser qu'un mot court hérissé de symboles, et plus facile à retenir."}
          </p>
          <input
            className={s.champ}
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="Le même, une seconde fois"
            autoComplete="new-password"
            aria-label="Confirmation du nouveau mot de passe"
          />
          <p className={s.aide} aria-live="polite">
            {confirmation && !identiques ? 'Les deux saisies diffèrent.' : '\u00a0'}
          </p>
          <button
            type="submit"
            className={s.bouton}
            style={{ background: patient.branding?.accent }}
            disabled={!pret}
          >
            {enCours === 'mdp' ? 'Enregistrement…' : 'Enregistrer ce mot de passe'}
          </button>
        </form>
        {notice ? (
          <p className={notice.ton === 'ok' ? s.noticeOk : s.noticeErreur} aria-live="polite">
            {notice.texte}
          </p>
        ) : null}
      </section>

      <section className={s.carte}>
        <h2 className={s.titre}>Vos appareils</h2>
        <p className={s.texte}>
          Un téléphone perdu, un ordinateur prêté : fermez d'un geste votre espace partout ailleurs.
          Il reste ouvert ici.
        </p>
        <button type="button" className={s.lienDanger} disabled={enCours !== ''} onClick={() => void fermerLesAutres()}>
          {enCours === 'appareils' ? 'Déconnexion…' : 'Déconnecter mes autres appareils'}
        </button>
        {appareils ? (
          <p className={appareils.ton === 'ok' ? s.noticeOk : s.noticeErreur} aria-live="polite">
            {appareils.texte}
          </p>
        ) : null}
      </section>

      <section className={s.carte}>
        <h2 className={s.titre}>Votre journal, chez vous</h2>
        <p className={s.texte}>
          Téléchargez une copie de toutes vos pages, dans un fichier texte que vous garderez où vous
          voudrez. Utile avant de fermer votre espace : le journal, lui, part avec le compte.
        </p>
        <button
          type="button"
          className={s.bouton}
          style={{ background: patient.branding?.accent }}
          disabled={enCours !== ''}
          onClick={() => void telechargerJournal()}
        >
          {enCours === 'export' ? 'Préparation…' : 'Télécharger mon journal'}
        </button>
        {exportJournal ? (
          <p className={exportJournal.ton === 'ok' ? s.noticeOk : s.noticeErreur} aria-live="polite">
            {exportJournal.texte}
          </p>
        ) : null}
      </section>

      <section className={s.carte}>
        <h2 className={s.titre}>Fermer mon espace</h2>
        {/* « définitivement » : c'était faux. Le compte est bien supprimé et
            le journal effacé, mais la fiche du cabinet est DÉTACHÉE, pas
            supprimée — la loi lui demande de la garder — et elle porte encore
            l'adresse. Se reconnecter avec la même la rattache d'elle-même
            (claim_access). Ce qui est définitif, c'est le journal. */}
        {autreEspace ? (
          <p className={s.texte}>
            Votre journal est effacé — celui-là ne revient pas — et cet espace patient se referme.
            Votre compte, lui, reste ouvert : il porte aussi votre espace professionnel, qui n'est
            pas touché.
          </p>
        ) : (
          <p className={s.texte}>
            Votre compte est supprimé et votre journal effacé — celui-là ne revient pas. Votre
            espace se referme : vous n'y aurez plus accès tant que vous ne vous reconnecterez pas
            avec la même adresse.
          </p>
        )}
        {/* Dit avant, pas après : c'est la seule chose que ce bouton ne fait
            pas, et celle qu'on croit qu'il fait. */}
        <p className={s.texte}>
          Le dossier de votre suivi — vos séances, ce que votre thérapeute y a noté — reste au
          cabinet : la loi lui demande de le conserver, et il ne nous appartient pas de l'effacer.
          Pour qu'il le soit, demandez-le directement à votre thérapeute. Pour garder votre journal,
          téléchargez-le d'abord, juste au-dessus.
        </p>
        {confirme ? (
          <div className={s.confirme}>
            <button
              type="button"
              className={s.danger}
              disabled={enCours !== ''}
              onClick={() => void supprimer()}
            >
              {enCours === 'suppression'
                ? 'Suppression…'
                : autreEspace
                  ? 'Oui, fermer mon espace patient'
                  : 'Oui, supprimer mon compte'}
            </button>
            <button type="button" className={s.annuler} onClick={() => setConfirme(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className={s.lienDanger} onClick={() => setConfirme(true)}>
            {autreEspace ? 'Fermer mon espace patient' : 'Supprimer mon compte'}
          </button>
        )}
        {echecSuppression ? (
          <p className={s.noticeErreur} role="alert">
            {echecSuppression}
          </p>
        ) : null}
      </section>

      {/* Se déconnecter d'un téléphone, c'est aussi cesser d'y recevoir ses
          rappels : celui qu'on a prêté, ou celui d'un proche, ne doit plus
          afficher le mot d'une thérapeute sur son écran verrouillé. */}
      <button
        type="button"
        className={s.deconnexion}
        onClick={() => void oublierCeTelephone().then(() => seDeconnecter())}
      >
        Se déconnecter
      </button>
    </div>
  )
}
