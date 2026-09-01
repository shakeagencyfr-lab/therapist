import { Title } from '@/components/ui'
import { dateDuJour } from '@/lib/format'
import { buildPatientContext, refreshProfile } from '@/services/aiClient'
import { profileOf } from '@/state/selectors'
import { useStore } from '@/state/store'
import type { LibraryAudio, PatientModule, PsychProfile } from '@/types/domain'
import s from './DraftStep.module.css'

type SuggestedAudio = LibraryAudio & { why: string }

const cx = (...parts: Array<string | false>) => parts.filter(Boolean).join(' ')

/** Étape 4 : le brouillon. Rien n'entre au dossier avant la barre d'envoi. */
export function DraftStep() {
  const { state, set, read } = useStore()
  const draft = state.draft

  /* La fiche de la séance, pas celle de la barre latérale : c'est elle qui
     recevra la note, les modules et les audios, même si la sélection a
     bougé ailleurs entre-temps. */
  const key = state.sessionPatient
  const patient = state.patients[key]
  if (!draft || !patient) return null

  const firstName = patient.name.split(' ')[0]

  const proposals = draft.propositions ?? []
  const retainedCount = proposals.filter((_, i) => !state.proposalOff[i]).length

  /* Audios de la bibliothèque : deux enregistrements par catégorie retenue. */
  const suggested: SuggestedAudio[] = []
  const sugCats = (draft.categories_audio ?? []).filter((c) => c && state.cats.includes(c.categorie))
  sugCats.forEach((c) => {
    state.lib
      .filter((audio) => audio.cat === c.categorie)
      .slice(0, 2)
      .forEach((audio) => {
        if (!suggested.some((x) => x.id === audio.id)) {
          suggested.push({ ...audio, why: c.pourquoi || c.categorie })
        }
      })
  })
  const sugOn = suggested.filter((audio) => !state.sugOff[audio.id])

  const profFresh = Boolean(state.profNew[key])
  const profBusy = state.profGen === key

  function sendSuggested() {
    if (!sugOn.length) return
    set((prev) => {
      const existing = prev.extraAudios[key] ?? []
      const add = sugOn
        .filter(
          (audio) =>
            !patient.audios.some((x) => x.title === audio.title) &&
            !existing.some((x) => x.title === audio.title),
        )
        .map((audio) => ({
          title: audio.title,
          meta: `Envoyé à l'instant · ${audio.cat}`,
          duration: audio.duration === '—' ? '10:00' : audio.duration,
        }))
      return {
        extraAudios: add.length
          ? { ...prev.extraAudios, [key]: existing.concat(add) }
          : prev.extraAudios,
        sugSent: `${sugOn.length}${sugOn.length > 1 ? ' audios ajoutés' : ' audio ajouté'} à la bibliothèque de ${patient.name}.`,
      }
    })
  }

  function sendDraft() {
    // Garde de fond : le bouton est déjà barré, mais rien de fictif ne doit
    // pouvoir atteindre un dossier par un autre chemin.
    if (state.draftMaquette) return
    const retained: PatientModule[] = proposals
      .filter((_, i) => !state.proposalOff[i])
      .map((proposal) => ({
        title: proposal.titre,
        meta: `Ajouté depuis la séance du ${dateDuJour()}`,
        kind: proposal.type,
        done: false,
        fresh: true,
      }))
    set((prev) => ({
      sent: true,
      extra: { ...prev.extra, [key]: (prev.extra[key] ?? []).concat(retained) },
    }))
  }

  function copyMessage() {
    const text = read().draft?.message ?? ''
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {})
    set({ msgOk: true })
  }

  /**
   * Actualisation du profil depuis le brouillon : mêmes états que la fiche
   * client, une séance de plus est comptée dès que le profil revient.
   */
  async function refreshProfil() {
    const now = read()
    if (now.profGen) return
    const current = profileOf(now, key)
    set({ profGen: key })
    try {
      const result = await refreshProfile({
        context: buildPatientContext(now, key),
        notes: now.sessionNotes.trim(),
        synthese: now.draft?.synthese ?? '',
        transcript: now.transcript.trim(),
      })
      const next: PsychProfile = {
        updated: "Actualisé à l'instant, depuis la dernière séance",
        portrait: result.portrait || current?.portrait || '',
        axes: result.axes
          .filter((axis) => axis && axis.label)
          .map((axis) => ({
            label: axis.label,
            value: Math.max(0, Math.min(100, Math.round(axis.value))),
            note: axis.note || '',
          })),
        levers: result.levers.filter((lever) => lever && lever.title),
        care: result.care.filter((item) => typeof item === 'string'),
      }
      set((prev) => ({
        profGen: '',
        profNew: { ...prev.profNew, [key]: next },
        profNote: { ...prev.profNote, [key]: result.resume || 'Profil actualisé.' },
      }))
    } catch {
      set((prev) => ({
        profGen: '',
        profNote: { ...prev.profNote, [key]: "L'actualisation a échoué. Réessayez." },
      }))
    }
  }

  return (
    <div className={s.step}>
      {/* Un brouillon de maquette ne se déguise pas en analyse : il est annoncé
          comme tel, et la barre d'envoi refuse de le verser au dossier. */}
      {state.draftMaquette ? (
        <section className={s.fake}>
          <h2 className={s.fakeTitle}>Ceci n'est pas une analyse de votre séance</h2>
          <p className={s.fakeBody}>
            Le serveur tourne en mode maquette : ce texte est un exemple fixe, écrit d'avance, qui
            ne tient aucun compte de ce que vous venez d'enregistrer. Il ne peut pas être versé au
            dossier. Renseignez la clé d'analyse du serveur pour obtenir une vraie note de séance.
          </p>
        </section>
      ) : null}

      {/* Synthèse ------------------------------------------------------ */}
      <section className={s.card}>
        <div className={s.head}>
          <Title large as="h2">
            Synthèse de séance
          </Title>
          <button
            type="button"
            className={cx(s.validate, state.syntheseOk && s.validateOn)}
            aria-pressed={state.syntheseOk}
            onClick={() => set((prev) => ({ syntheseOk: !prev.syntheseOk }))}
          >
            {state.syntheseOk ? '✓ Validée' : 'Valider ce bloc'}
          </button>
        </div>
        <textarea
          className={s.field}
          rows={9}
          aria-label="Synthèse de séance"
          value={draft.synthese}
          onChange={(e) => {
            const synthese = e.target.value
            set((prev) => (prev.draft ? { draft: { ...prev.draft, synthese }, syntheseOk: false } : {}))
          }}
        />
      </section>

      {/* Notes écrites pendant la séance -------------------------------- */}
      {state.sessionNotes.trim() ? (
        <section className={cx(s.card, s.cardQuiet)}>
          <Title as="h2">Vos notes de séance</Title>
          <div className={s.sub}>Conservées telles quelles dans le dossier, au-dessus du texte généré.</div>
          <div className={s.notes}>{state.sessionNotes}</div>
        </section>
      ) : null}

      {/* Mots du patient et fil rouge ------------------------------------ */}
      <div className={s.pair}>
        <section className={s.card}>
          <h2 className={s.h21}>Les mots du patient</h2>
          <div className={s.sub}>À réutiliser tels quels dans la prochaine induction.</div>
          {draft.mots.length ? (
            <div className={s.words}>
              {draft.mots.map((word, i) => (
                <span className={s.word} key={`${i}-${word}`}>
                  {word}
                </span>
              ))}
            </div>
          ) : (
            /* Vide à dessein : sans distinction des locuteurs, rien ne permet
               d'attribuer une phrase au patient. Mieux vaut le dire que citer
               au hasard. */
            <p className={s.empty}>
              La transcription ne distingue pas qui parle : aucune expression n'a pu être
              attribuée au patient avec certitude. Le bouton « Mot du patient », pendant la
              séance, horodate ceux que vous voulez retenir.
            </p>
          )}
        </section>
        <section className={s.card}>
          <h2 className={s.h21}>Fil rouge</h2>
          <div className={s.sub}>Thèmes repérés, à confirmer par vous.</div>
          <div className={s.themes}>
            {draft.themes.map((theme, i) => (
              <div className={s.theme} key={`${i}-${theme}`}>
                <span className={s.themeDot} aria-hidden />
                <span className={s.themeText}>{theme}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Points de vigilance --------------------------------------------- */}
      {draft.vigilance.length ? (
        <section className={s.vigilance}>
          <h2 className={cx(s.h21, s.vigilanceTitle)}>Points de vigilance</h2>
          <div className={s.vigilanceSub}>
            Relevés dans la transcription. Ce ne sont pas des diagnostics, seulement des éléments que
            vous voudrez peut-être ne pas laisser passer.
          </div>
          <div className={s.vigilanceList}>
            {draft.vigilance.map((item, i) => (
              <div className={s.vigilanceItem} key={`${i}-${item.point}`}>
                <div className={s.vigilancePoint}>{item.point}</div>
                <div className={s.vigilanceBody}>{item.conduite}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Questions --------------------------------------------------------- */}
      {draft.questions.length ? (
        <section className={s.card}>
          <h2 className={s.h21}>À reprendre à la prochaine séance</h2>
          <div className={s.sub}>Ce qui est resté en suspens, formulé en questions ouvertes.</div>
          <div className={s.questions}>
            {draft.questions.map((question, i) => (
              <div className={s.question} key={`${i}-${question}`}>
                <span className={s.questionDot} aria-hidden />
                <span className={s.questionText}>{question}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Modules proposés ---------------------------------------------------- */}
      <section className={s.card}>
        <div className={s.headTight}>
          <Title large as="h2">
            Modules proposés pour l'entre-séances
          </Title>
          <span className={s.countMeta}>
            {retainedCount} sur {proposals.length} retenus
          </span>
        </div>
        <div className={s.sub}>Décochez ce qui ne vous convient pas. Rien n'est envoyé sans votre validation.</div>
        <div className={s.rows}>
          {proposals.map((proposal, i) => {
            const on = !state.proposalOff[i]
            return (
              <button
                type="button"
                key={`${i}-${proposal.titre}`}
                className={cx(s.row, !on && s.rowOff)}
                aria-pressed={on}
                onClick={() =>
                  set((prev) => ({ proposalOff: { ...prev.proposalOff, [i]: !prev.proposalOff[i] } }))
                }
              >
                <span className={cx(s.box, on && s.boxOn)} aria-hidden>
                  {on ? '✓' : ''}
                </span>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{proposal.titre}</span>
                  <span className={s.rowWhy}>{proposal.pourquoi}</span>
                </span>
                <span className={s.kind}>{proposal.type}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Audios suggérés -------------------------------------------------------- */}
      {suggested.length ? (
        <section className={s.card}>
          <div className={s.headTight}>
            <Title large as="h2">
              Audios de votre bibliothèque
            </Title>
            <span className={s.countMeta}>
              {sugOn.length} sur {suggested.length} retenus
            </span>
          </div>
          <div className={s.sub}>
            Choisis parmi vos enregistrements d'après les catégories retenues pour cette séance :{' '}
            {sugCats.map((c) => c.categorie).join(', ')}.
          </div>
          <div className={s.rows}>
            {suggested.map((audio) => {
              const on = !state.sugOff[audio.id]
              return (
                <button
                  type="button"
                  key={audio.id}
                  className={cx(s.row, s.rowPlain, !on && s.rowMuted)}
                  aria-pressed={on}
                  onClick={() => set((prev) => ({ sugOff: { ...prev.sugOff, [audio.id]: !prev.sugOff[audio.id] } }))}
                >
                  <span className={cx(s.box, on && s.boxOn)} aria-hidden>
                    {on ? '✓' : ''}
                  </span>
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{audio.title}</span>
                    <span className={s.rowWhy}>{audio.why}</span>
                  </span>
                  <span className={s.duration}>{audio.duration}</span>
                </button>
              )
            })}
          </div>
          <div className={s.sendRow}>
            <button
              type="button"
              className={cx(s.dispatch, !sugOn.length && s.dispatchOff)}
              onClick={sendSuggested}
              disabled={!sugOn.length}
            >
              {sugOn.length ? `Ajouter à la bibliothèque de ${firstName}` : 'Ajouter'}
            </button>
            <span className={s.sendHint}>
              {state.sugSent || 'Ce sont vos enregistrements, pas des audios générés.'}
            </span>
          </div>
        </section>
      ) : null}

      {/* Induction ------------------------------------------------------------------ */}
      <section className={s.card}>
        <div className={s.headTight}>
          <Title large as="h2">
            Brouillon d'induction
          </Title>
          <span className={s.hot}>Brouillon, à retravailler par vous</span>
        </div>
        <div className={s.sub}>Construit avec les mots de {firstName}, pas les vôtres.</div>
        <textarea
          className={cx(s.field, s.fieldLoose)}
          rows={8}
          aria-label="Brouillon d'induction"
          value={draft.induction}
          onChange={(e) => {
            const induction = e.target.value
            set((prev) => (prev.draft ? { draft: { ...prev.draft, induction } } : {}))
          }}
        />
      </section>

      {/* Message au patient ------------------------------------------------------------ */}
      <section className={s.card}>
        <div className={s.headTight}>
          <Title large as="h2">
            Message au patient
          </Title>
          <button
            type="button"
            className={cx(s.validate, state.msgOk && s.validateOn)}
            onClick={copyMessage}
          >
            {state.msgOk ? '✓ Copié' : 'Copier le message'}
          </button>
        </div>
        <div className={s.sub}>Envoyé le soir de la séance, il double le taux de réalisation des modules.</div>
        <textarea
          className={s.field}
          rows={4}
          aria-label="Message au patient"
          value={draft.message}
          onChange={(e) => {
            const message = e.target.value
            set((prev) => (prev.draft ? { draft: { ...prev.draft, message }, msgOk: false } : {}))
          }}
        />
      </section>

      {/* Profil psychologique ------------------------------------------------------------- */}
      <section className={cx(s.card, s.profCard)}>
        <div className={s.profText}>
          <span className={s.profTitle}>Actualiser le profil de {firstName}</span>
          <span className={s.profHint}>
            {profFresh
              ? 'Profil actualisé à partir de cette séance. Il est visible sur la fiche client.'
              : "Reprend le profil psychologique et les conseils d'accompagnement à partir des notes et de la synthèse de cette séance."}
          </span>
        </div>
        <button
          type="button"
          className={cx(s.profBtn, profBusy && s.profBtnBusy)}
          onClick={refreshProfil}
          disabled={profBusy}
        >
          {profBusy ? 'Analyse des notes…' : 'Actualiser le profil'}
        </button>
      </section>

      {/* Barre d'envoi ---------------------------------------------------------------------- */}
      <section className={s.sendBar}>
        <div className={s.sendText}>
          <span className={s.sendTitle}>
            {state.draftMaquette
              ? 'Envoi impossible'
              : state.sent
                ? `Envoyé au dossier de ${firstName}`
                : 'Prêt à envoyer'}
          </span>
          <span className={s.sendSub}>
            {state.draftMaquette
              ? "Ce brouillon est un texte de maquette. Rien de fictif n'entre dans un dossier de santé."
              : state.sent
                ? 'La note est archivée et les modules retenus apparaissent dans son parcours de la semaine.'
                : "La note rejoint le dossier, les modules retenus partent dans son espace patient. La transcription brute est supprimée."}
          </span>
        </div>
        <div className={s.sendActions}>
          <button
            type="button"
            className={s.sendGhost}
            onClick={() => set({ mode: 'therapist', sel: key })}
          >
            Voir le parcours
          </button>
          <button
            type="button"
            className={s.sendGhost}
            onClick={() => set({ draft: null, sent: false })}
          >
            Reprendre
          </button>
          <button
            type="button"
            className={cx(s.sendBtn, state.sent && s.sendBtnDone)}
            onClick={sendDraft}
            disabled={state.draftMaquette}
          >
            {state.sent ? '✓ Envoyé' : 'Valider et envoyer'}
          </button>
        </div>
      </section>
    </div>
  )
}
