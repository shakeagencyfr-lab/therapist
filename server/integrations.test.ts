import { describe, expect, it } from 'vitest'
import { urlDuCodeIntegration } from './integrations.js'

/** Le code que BookRDV donne sous « Intégrer sur mon site ». */
const BOOKRDV = `<!-- Embedded booking begin -->
<div class="embedded-booking" data-url="https://lohypnose.bookrdv.com" data-query="&t=s&uuid=8242d1a7-1938-4502-8ab2-d18c5f79c928" data-lang="fr" data-autoresize="0" data-showsidebar="1" data-autoscroll="1" data-showservices="0" style="min-width: 320px; height: 768px;"></div>
<script type="text/javascript" src="https://lohypnose.bookrdv.com/embed.js" async></script>
<!-- Embedded booking end -->`

describe("code d'intégration d'un agenda", () => {
  it('tire de BookRDV le domaine et les paramètres du rendez-vous', () => {
    const url = new URL(urlDuCodeIntegration(BOOKRDV))
    expect(url.origin).toBe('https://lohypnose.bookrdv.com')
    expect(url.searchParams.get('t')).toBe('s')
    expect(url.searchParams.get('uuid')).toBe('8242d1a7-1938-4502-8ab2-d18c5f79c928')
  })

  it("n'emporte pas le script du tiers, seulement son adresse", () => {
    const rendu = urlDuCodeIntegration(BOOKRDV)
    expect(rendu).not.toContain('embed.js')
    expect(rendu).not.toContain('<')
  })

  it('accepte un iframe, la forme des autres agendas', () => {
    const code = '<iframe src="https://agenda.exemple.fr/widget?x=1" width="100%"></iframe>'
    expect(urlDuCodeIntegration(code)).toBe('https://agenda.exemple.fr/widget?x=1')
  })

  it('accepte une adresse seule', () => {
    expect(urlDuCodeIntegration('  https://agenda.exemple.fr/widget  ')).toBe(
      'https://agenda.exemple.fr/widget',
    )
  })

  it('refuse le http, qu’un navigateur bloquerait dans le cadre', () => {
    expect(() => urlDuCodeIntegration('http://agenda.exemple.fr/widget')).toThrow(/https/)
  })

  it('refuse ce qu’il ne comprend pas, plutôt que de deviner', () => {
    expect(() => urlDuCodeIntegration('<div>collez ici</div>')).toThrow(/n'a pas été compris/)
    expect(() => urlDuCodeIntegration('   ')).toThrow(/Collez le code/)
  })
})
