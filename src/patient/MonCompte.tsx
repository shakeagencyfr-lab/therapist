import { useState } from 'react'
import { useAuth, LONGUEUR_MOT_DE_PASSE } from '@/auth/session'
import { supabase } from '@/lib/supabase'
import type { PatientIdentity } from '@/auth/session'
import s from './MonCompte.module.css'

/**
 * Son compte, à elle.
 *
 * Trois gestes, et le troisième demande d'être honnête sur ce qu'il fait.
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
  const { definirMotDePasse, seDeconnecter } = useAuth()
  const [motDePasse, setMotDePasse] = useState('')
  const [enCours, setEnCours] = useState('')
  const [notice, setNotice] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null)
  const [confirme, setConfirme] = useState(false)

  async function poserMotDePasse() {
    if (motDePasse.length < LONGUEUR_MOT_DE_PASSE || enCours) return
    setEnCours('mdp')
    const r = await definirMotDePasse(motDePasse)
    setEnCours('')
    // On ne vide le champ qu'en cas de succès : sur un refus, effacer ce qui
    // vient d'être tapé oblige à tout retaper sans savoir ce qui clochait.
    if (r.ok) setMotDePasse('')
    setNotice({ ton: r.ok ? 'ok' : 'erreur', texte: r.message })
  }

  async function supprimer() {
    const db = supabase()
    if (!db || enCours) return
    setEnCours('suppression')
    const { data } = await db.auth.getSession()
    const jeton = data.session?.access_token ?? ''
    try {
      const reponse = await fetch('/api/compte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ geste: 'supprimer' }),
      })
      const lu = (await reponse.json().catch(() => ({}))) as { message?: string }
      if (!reponse.ok) {
        setEnCours('')
        setNotice({ ton: 'erreur', texte: lu.message ?? "La suppression n'a pas abouti. Réessayez." })
        return
      }
      // Le compte n'existe plus : la session qui reste ouverte n'ouvre rien.
      await seDeconnecter()
      window.location.replace('/mon')
    } catch {
      setEnCours('')
      setNotice({ ton: 'erreur', texte: 'Le serveur est injoignable. Réessayez dans un instant.' })
    }
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

      <section className={s.carte}>
        <h2 className={s.titre}>Un mot de passe, si vous préférez</h2>
        <p className={s.texte}>
          Le lien reçu par courriel reste la voie normale, et vous n'avez rien à retenir. Un mot de
          passe vous évite d'attendre le courriel quand vous ouvrez votre espace souvent.
        </p>
        <input
          className={s.champ}
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder={`Au moins ${LONGUEUR_MOT_DE_PASSE} caractères`}
          autoComplete="new-password"
          aria-label="Nouveau mot de passe"
        />
        <p className={s.aide}>
          Trois mots sans rapport font un bon mot de passe : plus long à casser qu'un mot court
          hérissé de symboles, et plus facile à retenir.
        </p>
        <button
          type="button"
          className={s.bouton}
          style={{ background: patient.branding?.accent }}
          disabled={motDePasse.length < LONGUEUR_MOT_DE_PASSE || enCours !== ''}
          onClick={() => void poserMotDePasse()}
        >
          {enCours === 'mdp' ? 'Enregistrement…' : 'Enregistrer ce mot de passe'}
        </button>
      </section>

      {notice ? (
        <p className={notice.ton === 'ok' ? s.noticeOk : s.noticeErreur}>{notice.texte}</p>
      ) : null}

      <section className={s.carte}>
        <h2 className={s.titre}>Fermer mon espace</h2>
        {/* « définitivement » : c'était faux. Le compte est bien supprimé et
            le journal effacé, mais la fiche du cabinet est DÉTACHÉE, pas
            supprimée — la loi lui demande de la garder — et elle porte encore
            l'adresse. Se reconnecter avec la même la rattache d'elle-même
            (claim_access). Ce qui est définitif, c'est le journal. */}
        <p className={s.texte}>
          Votre compte est supprimé et votre journal effacé — celui-là ne revient pas. Votre espace
          se referme : vous n'y aurez plus accès tant que vous ne vous reconnecterez pas avec la
          même adresse.
        </p>
        {/* Dit avant, pas après : c'est la seule chose que ce bouton ne fait
            pas, et celle qu'on croit qu'il fait. */}
        <p className={s.texte}>
          Le dossier de votre suivi — vos séances, ce que votre thérapeute y a noté — reste chez
          elle : la loi lui demande de le conserver, et il ne nous appartient pas de l'effacer.
          Pour qu'il le soit, demandez-le-lui directement.
        </p>
        {confirme ? (
          <div className={s.confirme}>
            <button
              type="button"
              className={s.danger}
              disabled={enCours !== ''}
              onClick={() => void supprimer()}
            >
              {enCours === 'suppression' ? 'Suppression…' : 'Oui, supprimer mon compte'}
            </button>
            <button type="button" className={s.annuler} onClick={() => setConfirme(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className={s.lienDanger} onClick={() => setConfirme(true)}>
            Supprimer mon compte
          </button>
        )}
      </section>

      <button type="button" className={s.deconnexion} onClick={() => void seDeconnecter()}>
        Se déconnecter
      </button>
    </div>
  )
}
