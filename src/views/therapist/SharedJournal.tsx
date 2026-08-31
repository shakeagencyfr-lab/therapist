import { Card, EmptyState, Title } from '@/components/ui'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import type { JournalEntry } from '@/types/domain'
import s from './SharedJournal.module.css'

/**
 * Journal partagé : les notes envoyées pendant la session, les pages que le
 * patient a marquées comme partagées, puis l'historique du dossier — les
 * plus récentes en tête.
 */
export function SharedJournal() {
  const state = useAppState()
  const key = state.sel

  const entries: JournalEntry[] = (state.noteLog[key] ?? [])
    .concat(
      (state.pages[key] ?? [])
        .filter((g) => g.shared)
        .map((g) => ({ date: g.date, trigger: g.title || 'Page sans titre', text: g.text })),
    )
    .concat(patientOf(state).journal)

  return (
    <Card padded={false} className={entries.length ? s.card : `${s.card} ${s.cardEmpty}`}>
      <Title>Journal partagé</Title>
      <p className={s.sub}>Ce que le patient a choisi de vous transmettre</p>

      {entries.length === 0 ? (
        <EmptyState>
          Rien de partagé pour l'instant. Le patient décide page par page de ce
          qu'il vous transmet.
        </EmptyState>
      ) : (
        entries.map((j, i) => (
          <div className={s.entry} key={`${j.date}-${i}`}>
            <div className={s.line}>
              <span className={s.date}>{j.date}</span>
              <span className={s.trigger}>{j.trigger}</span>
            </div>
            <p className={s.text}>{j.text}</p>
          </div>
        ))
      )}
    </Card>
  )
}
