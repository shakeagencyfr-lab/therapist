import { describe, expect, it } from 'vitest'
import { appendSegment } from './speech'

describe('appendSegment — une ligne par prise de parole', () => {
  it('garde la frontière entre deux segments', () => {
    const t = appendSegment(appendSegment('', 'comment ça va '), '  mieux   mais jeudi ')
    expect(t).toBe('comment ça va\nmieux mais jeudi')
  })
  it('normalise les blancs à l’intérieur d’un segment, pas entre eux', () => {
    expect(appendSegment('a', '  b   c  ')).toBe('a\nb c')
  })
  it('ignore un segment vide', () => {
    expect(appendSegment('a', '   ')).toBe('a')
    expect(appendSegment('', '')).toBe('')
  })
})
