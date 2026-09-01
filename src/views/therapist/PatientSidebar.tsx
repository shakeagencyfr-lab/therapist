import { useState } from 'react'
import { Avatar, Button, Notice, TextInput } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { riskColor, sidebarPatients, slippingPatients } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientSidebar.module.css'

/**
 * Barre latérale des patients. Les deux seules props sont l'ouverture du
 * tiroir sous 900px, un état d'affichage détenu par la vue parente.
 */
export function PatientSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState('')

  const rows = sidebarPatients(state)
  const slipping = slippingPatients(state).length
  const count = state.q.trim() ? `${rows.length} / ${state.patientOrder.length}` : `${state.patientOrder.length}`

  const peutCreer = state.pNewName.trim().length >= 2 && !envoi

  async function creer() {
    if (!cabinet || !peutCreer) return
    setEnvoi(true)
    setEchec('')
    set({ pNotice: '' })
    const r = await cabinet.creerPatiente({ nom: state.pNewName, email: state.pNewEmail })
    setEnvoi(false)
    if (r.ok) {
      set({ pNewOpen: false, pNewName: '', pNewEmail: '', pNotice: r.message })
    } else {
      // Un échec ne fait pas retaper le formulaire.
      setEchec(r.message)
    }
  }

  return (
    <>
      {open ? <div className={s.scrim} onClick={onClose} aria-hidden /> : null}

      <aside id="patient-sidebar" className={open ? `${s.sidebar} ${s.open}` : s.sidebar}>
        <div className={s.search}>
          <span className={s.searchDot} aria-hidden />
          <input
            className={s.searchInput}
            value={state.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Rechercher un patient"
            aria-label="Rechercher un patient"
          />
        </div>

        <div className={s.head}>
          <span className={s.overline}>Patients actifs</span>
          <span className={s.count}>{count}</span>
        </div>

        <div className={s.list}>
          {rows.map(({ id, patient }) => {
            const on = id === state.sel
            return (
              <button
                key={id}
                type="button"
                className={on ? `${s.row} ${s.rowOn}` : s.row}
                aria-pressed={on}
                onClick={() => {
                  /* Changer de patient remet à zéro tout ce qui pointait vers
                     le précédent : tâche ouverte et lecteur audio. */
                  set({ sel: id, openTask: null, pAudio: 0, playPos: 0, playing: false })
                  onClose()
                }}
              >
                <Avatar initials={patient.initials} on={on} />
                <span className={s.who}>
                  <span className={s.name}>{patient.name}</span>
                  <span className={s.sub}>{patient.subtitle}</span>
                </span>
                <span
                  className={s.dot}
                  style={{ background: riskColor(patient.adherence) }}
                  aria-hidden
                />
              </button>
            )
          })}
        </div>

        {/* Ajouter une patiente : c'est son adresse qui la connectera, au
            premier lien magique. Une fiche s'ouvre avec un nom et une adresse,
            le reste se règle depuis la fiche. */}
        {cabinet?.reel ? (
          <div className={s.add}>
            {state.pNotice ? (
              <Notice tone="ok" style={{ marginBottom: 12 }}>
                {state.pNotice}
              </Notice>
            ) : null}

            {state.pNewOpen ? (
              <div className={s.addForm}>
                <div className={s.field}>
                  <span className={s.label}>Nom affiché</span>
                  <TextInput
                    value={state.pNewName}
                    onChange={(e) => set({ pNewName: e.target.value })}
                    placeholder="Camille R."
                  />
                </div>

                <div className={s.field}>
                  <span className={s.label}>Adresse électronique</span>
                  <TextInput
                    type="email"
                    inputMode="email"
                    value={state.pNewEmail}
                    onChange={(e) => set({ pNewEmail: e.target.value })}
                    placeholder="camille@exemple.fr"
                  />
                  <span className={s.hint}>
                    C'est avec cette adresse qu'elle ouvrira son espace, sans mot de passe.
                  </span>
                </div>

                <p className={s.later}>
                  Le programme, ce que vous suivez et la question du soir se règlent depuis sa
                  fiche, après la première séance.
                </p>

                {echec ? <Notice tone="warn">{echec}</Notice> : null}

                <div className={s.actions}>
                  <Button variant="primary" onClick={() => void creer()} disabled={!peutCreer}>
                    {envoi ? 'Création…' : 'Ajouter'}
                  </Button>
                  <Button variant="ghost" onClick={() => set({ pNewOpen: false })}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                block
                onClick={() => set({ pNewOpen: true, pNotice: '' })}
              >
                Ajouter une patiente
              </Button>
            )}
          </div>
        ) : (
          <p className={s.demo}>
            Fiches de démonstration. Connectez-vous à votre cabinet pour voir vos patientes et en
            ajouter.
          </p>
        )}

        {slipping > 0 ? (
          <div className={s.slip}>
            {/* Libellé fixe du prototype : l'encart annonce toujours « 2 patients
                décrochent », le décompte ne sert qu'à décider de l'afficher. */}
            <div className={s.slipTitle}>2 patients décrochent</div>
            <div className={s.slipBody}>
              Moins de 50 % des modules réalisés cette semaine. Une relance est proposée.
            </div>
          </div>
        ) : null}
      </aside>
    </>
  )
}
