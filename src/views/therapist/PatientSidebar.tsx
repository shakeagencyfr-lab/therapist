import { useState } from 'react'
import { Avatar, Button, Notice, TextInput } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { placesRestantes, useDroits } from '@/cabinet/droits'
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
  const droits = useDroits()
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState('')
  const [closOuvert, setClosOuvert] = useState(false)
  const [reouverture, setReouverture] = useState('')
  const [echecReouverture, setEchecReouverture] = useState('')

  const rows = sidebarPatients(state)
  const slipping = slippingPatients(state).length
  /* Pendant une recherche, le compteur dit déjà « trouvées sur total » : y
     ajouter le plafond ferait trois nombres à la file, qu'on ne lit plus. */
  const cherche = state.q.trim().length > 0

  /* Le plafond de l'offre, tenu par la base : ici il n'est qu'affiché, pour
     qu'une praticienne le voie venir au lieu de le découvrir sur un refus. */
  const max = droits?.droits?.maxPatients ?? null
  const places = placesRestantes(droits?.droits ?? null)
  const complet = places === 0

  const peutCreer = state.pNewName.trim().length >= 2 && !envoi && !complet

  async function creer() {
    if (!cabinet || !peutCreer) return
    setEnvoi(true)
    setEchec('')
    set({ pNotice: '' })
    const r = await cabinet.creerPatiente({ nom: state.pNewName, email: state.pNewEmail })
    setEnvoi(false)
    if (r.ok) {
      set({ pNewOpen: false, pNewName: '', pNewEmail: '', pNotice: r.message })
      // Une fiche de plus : le compte des places suit, sans recharger la page.
      void droits?.recharger()
    } else {
      // Un échec ne fait pas retaper le formulaire.
      setEchec(r.message)
    }
  }

  async function rouvrir(patientId: string) {
    if (!cabinet || reouverture) return
    setReouverture(patientId)
    setEchecReouverture('')
    const r = await cabinet.rouvrirPatiente(patientId)
    setReouverture('')
    if (r.ok) {
      set({ sel: patientId, pNotice: r.message })
      void droits?.recharger()
      return
    }
    setEchecReouverture(r.message)
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
          <span className={s.count}>
            {cherche
              ? `${rows.length} / ${state.patientOrder.length}`
              : max === null
                ? `${state.patientOrder.length}`
                : `${state.patientOrder.length} / ${max}`}
          </span>
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

            {complet ? (
              <Notice tone="warn" style={{ marginBottom: 12 }}>
                Votre offre permet {max} fiches actives, et elles le sont toutes. Closez un suivi
                terminé depuis sa fiche pour libérer une place, ou demandez à votre revendeur de
                relever le plafond.
              </Notice>
            ) : places !== null && places <= 3 ? (
              <p className={s.later} style={{ marginBottom: 12 }}>
                {places === 1 ? 'Une place restante' : `${places} places restantes`} sur votre
                offre.
              </p>
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
                disabled={complet}
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

        {/* Les suivis clos : repliés, parce qu'on ne les consulte pas tous les
            jours — mais présents, parce qu'un plafond atteint se règle ici et
            qu'un suivi clos par erreur doit pouvoir se rouvrir. */}
        {cabinet?.reel && cabinet.archivees.length > 0 ? (
          <div className={s.clos}>
            <button
              type="button"
              className={s.closTitre}
              onClick={() => setClosOuvert((v) => !v)}
              aria-expanded={closOuvert}
            >
              Suivis clos ({cabinet.archivees.length})
            </button>
            {closOuvert ? (
              <div className={s.closListe}>
                {cabinet.archivees.map((f) => (
                  <div key={f.id} className={s.closLigne}>
                    <span className={s.closNom}>{f.nom}</span>
                    <button
                      type="button"
                      className={s.rouvrir}
                      disabled={reouverture !== ''}
                      onClick={() => void rouvrir(f.id)}
                    >
                      {reouverture === f.id ? 'Réouverture…' : 'Rouvrir'}
                    </button>
                  </div>
                ))}
                {echecReouverture ? (
                  <Notice tone="warn" style={{ marginTop: 10 }}>
                    {echecReouverture}
                  </Notice>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {slipping > 0 ? (
          <div className={s.slip}>
            {/* Le décompte est celui des fiches, pas un nombre écrit d'avance :
                l'encart annonçait « 2 patients décrochent » quel qu'en soit le
                nombre, ce qui finit par ne plus rien vouloir dire. */}
            <div className={s.slipTitle}>
              {slipping === 1 ? '1 patient décroche' : `${slipping} patients décrochent`}
            </div>
            <div className={s.slipBody}>
              Moins de 50 % des modules réalisés cette semaine. Une relance est proposée.
            </div>
          </div>
        ) : null}
      </aside>
    </>
  )
}
