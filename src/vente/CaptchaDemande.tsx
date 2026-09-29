/**
 * La case anti-robot du formulaire de demande d'essai.
 *
 * Chargée à part, et seulement quand la clé de SITE hCaptcha est posée
 * (VITE_HCAPTCHA_SITE_KEY, publique par nature) : sans elle, la page ne
 * télécharge rien de hCaptcha. Le jeton est vérifié par NOTRE serveur, avec
 * la clé secrète (HCAPTCHA_SECRET, variable du serveur seulement).
 */
import { useEffect, useRef, useState } from 'react'
import HCaptcha from '@hcaptcha/react-hcaptcha'

export default function CaptchaDemande({
  cle,
  onJeton,
  remise,
}: {
  cle: string
  onJeton: (jeton: string | undefined) => void
  /** Change à chaque envoi : un jeton ne sert qu'une fois. */
  remise: number
}) {
  const ref = useRef<HCaptcha | null>(null)
  const [panne, setPanne] = useState(false)
  useEffect(() => {
    if (remise > 0) ref.current?.resetCaptcha()
  }, [remise])
  return (
    <div>
      <HCaptcha
        ref={ref}
        sitekey={cle}
        languageOverride="fr"
        onVerify={(t) => {
          setPanne(false)
          onJeton(t)
        }}
        onExpire={() => onJeton(undefined)}
        onError={() => {
          onJeton(undefined)
          setPanne(true)
        }}
      />
      {panne ? (
        <p role="status" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--c-warn-text)' }}>
          La vérification anti-robot n’a pas pu se charger — elle est parfois bloquée par un réseau
          d’entreprise ou une extension du navigateur. Réessayez depuis un autre réseau.
        </p>
      ) : null}
    </div>
  )
}
