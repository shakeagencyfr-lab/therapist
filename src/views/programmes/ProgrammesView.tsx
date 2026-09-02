import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Notice, Overline, SquareCheck, TextInput, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { plural } from '@/lib/format'
import { useAppState } from '@/state/store'
import type { PatientId } from '@/types/domain'
import s from './ProgrammesView.module.css'

/** Les fiches d'avant portaient « Programme X » ; on compare sur le nom seul. */
function programmeDe(brut: string): string {
  return brut.replace(/^Programme\s+/i, '').trim()
}

/**
 * Les programmes du cabinet.
 *
 * Un programme n'est pas un objet du produit : c'est un mot que la thérapeute
 * choisit — « Arrêt du tabac », « Sommeil », « Confiance » — et qu'elle pose
 * sur les fiches qu'il concerne. Cet écran fait les deux gestes au même
 * endroit : nommer, et rattacher.
 *
 * Le rattachement se lit dans les deux sens. Depuis la fiche d'une patiente,
 * on choisit son programme ; ici, on prend un programme et on coche celles
 * qui le suivent. C'est la même colonne en base, `patients.program`.
 */
export function ProgrammesView() {
  const state = useAppState()
  const cabinet = useMaybeCabinet()
  const reel = Boolean(cabinet?.reel)

  const [choisi, setChoisi] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [renomme, setRenomme] = useState('')
  const [coches, setCoches] = useState<Record<PatientId, boolean>>({})
  const [enCours, setEnCours] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  const programmes = state.programmes

  /** Qui suit quoi, calculé une fois pour la liste et pour les compteurs. */
  const suivi = useMemo(() => {
    const par: Record<string, PatientId[]> = {}
    for (const id of state.patientOrder) {
      const p = programmeDe(state.patients[id]?.program ?? '')
      if (!p) continue
      par[p] = (par[p] ?? []).concat([id])
    }
    return par
  }, [state.patientOrder, state.patients])

  // Le programme ouvert reste ouvert tant qu'il existe ; sinon on prend le
  // premier. Changer de programme repart de ses rattachements publiés.
  useEffect(() => {
    const cible = programmes.includes(choisi) ? choisi : (programmes[0] ?? '')
    if (cible !== choisi) setChoisi(cible)
    setRenomme(cible)
    const etat: Record<PatientId, boolean> = {}
    for (const id of suivi[cible] ?? []) etat[id] = true
    setCoches(etat)
    setNotice(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choisi, programmes.join('|')])

  const selection = state.patientOrder.filter((id) => coches[id])
  const publies = suivi[choisi] ?? []
  const modifie =
    selection.length !== publies.length || selection.some((id) => !publies.includes(id))

  async function creer() {
    if (!cabinet || enCours) return
    const propre = nouveau.trim()
    if (!propre) return
    setEnCours('creer')
    setNotice(null)
    const r = await cabinet.creerProgramme(propre)
    setEnCours('')
    if (r.ok) {
      setNouveau('')
      setChoisi(propre)
      return
    }
    setNotice({ tone: 'warn', text: r.message })
  }

  async function renommer() {
    if (!cabinet || enCours) return
    const propre = renomme.trim()
    if (!propre || propre === choisi) return
    setEnCours('renommer')
    setNotice(null)
    const r = await cabinet.renommerProgramme(choisi, propre)
    setEnCours('')
    if (r.ok) setChoisi(propre)
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.message })
  }

  async function enregistrer() {
    if (!cabinet || enCours) return
    setEnCours('attribuer')
    setNotice(null)
    const r = await cabinet.attribuerProgramme(choisi, selection)
    setEnCours('')
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.message })
  }

  async function retirer() {
    if (!cabinet || enCours) return
    setEnCours('retirer')
    setNotice(null)
    const r = await cabinet.retirerProgramme(choisi)
    setEnCours('')
    if (!r.ok) setNotice({ tone: 'warn', text: r.message })
  }

  return (
    <div className={s.wrap}>
      <div className={s.crumb}>
        <Overline>Réglages du cabinet</Overline>
      </div>
      <h1 className={s.h1}>Vos programmes</h1>
      <p className={s.intro}>
        Les programmes que vous nommez, et les patientes qui les suivent. Ce sont vos mots, pas
        ceux du produit : « Arrêt du tabac » ou « Sommeil » valent mieux qu'une liste toute faite.
        Une patiente suit un programme à la fois — celui de sa fiche.
      </p>

      {!reel ? (
        <Card>
          <p className={s.muted}>
            Fiches de démonstration. Connectez-vous à votre cabinet pour gérer vos programmes.
          </p>
        </Card>
      ) : (
        <div className={s.grid}>
          <Card className={s.panneau}>
            <Title large as="h2">
              Le catalogue
            </Title>
            <p className={s.hint}>
              {programmes.length === 0
                ? "Vous n'en avez encore nommé aucun."
                : plural(programmes.length, 'programme', 'programmes')}
            </p>

            <div className={s.liste}>
              {programmes.map((p) => {
                const n = (suivi[p] ?? []).length
                return (
                  <button
                    key={p}
                    type="button"
                    className={p === choisi ? `${s.ligne} ${s.ligneOn}` : s.ligne}
                    aria-pressed={p === choisi}
                    onClick={() => setChoisi(p)}
                  >
                    <span className={s.ligneNom}>{p}</span>
                    <span className={s.ligneCompte}>
                      {n === 0 ? 'personne' : plural(n, 'patiente', 'patientes')}
                    </span>
                  </button>
                )
              })}
            </div>

            <form
              className={s.ajout}
              onSubmit={(e) => {
                e.preventDefault()
                void creer()
              }}
            >
              <TextInput
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                placeholder="Arrêt du tabac"
                aria-label="Nom du nouveau programme"
              />
              <Button variant="secondary" type="submit" disabled={!nouveau.trim() || enCours !== ''}>
                {enCours === 'creer' ? 'Ajout…' : 'Ajouter'}
              </Button>
            </form>
          </Card>

          {choisi ? (
            <Card className={s.panneau}>
              <Title large as="h2">
                {choisi}
              </Title>

              {notice ? (
                <div className={s.noticeSlot}>
                  <Notice tone={notice.tone}>{notice.text}</Notice>
                </div>
              ) : null}

              <div className={s.champ}>
                <span className={s.label}>Nom du programme</span>
                <div className={s.ajout}>
                  <TextInput
                    value={renomme}
                    onChange={(e) => setRenomme(e.target.value)}
                    aria-label="Renommer le programme"
                  />
                  <Button
                    variant="secondary"
                    disabled={!renomme.trim() || renomme.trim() === choisi || enCours !== ''}
                    onClick={() => void renommer()}
                  >
                    {enCours === 'renommer' ? 'Renommage…' : 'Renommer'}
                  </Button>
                </div>
                <span className={s.hint}>Les fiches qui le suivent sont renommées avec lui.</span>
              </div>

              <span className={s.label}>Qui suit ce programme</span>
              {state.patientOrder.length === 0 ? (
                <p className={s.hint}>Aucune patiente dans votre cabinet pour l'instant.</p>
              ) : (
                <div className={s.patientes}>
                  {state.patientOrder.map((id) => {
                    const fiche = state.patients[id]
                    const sien = programmeDe(fiche.program)
                    const ailleurs = sien && sien !== choisi
                    return (
                      <div key={id} className={s.patiente}>
                        <SquareCheck
                          on={!!coches[id]}
                          onClick={() => setCoches((prev) => ({ ...prev, [id]: !prev[id] }))}
                          label={`${coches[id] ? 'Retirer' : 'Rattacher'} ${fiche.name}`}
                        />
                        <span className={s.patienteTexte}>
                          <span className={s.patienteNom}>{fiche.name}</span>
                          {ailleurs ? (
                            <span className={s.patienteNote}>suit « {sien} »</span>
                          ) : null}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className={s.actions}>
                <Button
                  variant="primary"
                  disabled={!modifie || enCours !== ''}
                  onClick={() => void enregistrer()}
                >
                  {enCours === 'attribuer' ? 'Enregistrement…' : 'Enregistrer les rattachements'}
                </Button>
                <Button variant="ghost" disabled={enCours !== ''} onClick={() => void retirer()}>
                  {enCours === 'retirer' ? 'Retrait…' : 'Retirer ce programme'}
                </Button>
              </div>
              <span className={s.hint}>
                Retirer un programme le sort du catalogue sans toucher aux fiches : celles qui le
                portent gardent leur libellé.
              </span>
            </Card>
          ) : (
            <Card className={s.panneau}>
              <p className={s.muted}>
                Nommez votre premier programme à gauche : vous pourrez ensuite y rattacher vos
                patientes.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
