-- ============================================================================
-- 0018 — L'hypnose compte comme les autres appels.
--
-- Oubli de 0017 : la route « hypnose » a été ajoutée au serveur, qui inscrit
-- sa consommation avec le genre du même nom — mais l'énumération
-- `ai_call_kind` datait de 0003 et n'en avait jamais entendu parler. Chaque
-- hypnose produite écrivait donc dans les journaux :
--
--     consommation non inscrite — invalid input value for enum
--     ai_call_kind: "hypnose"
--
-- L'appel aboutissait, la thérapeute avait son texte, et le compteur restait
-- muet. C'est précisément la panne la plus coûteuse pour un revendeur : celle
-- qui ne se voit pas. L'action la plus chère du produit ne figurait dans
-- aucun coût constaté, donc dans aucune marge.
-- ============================================================================

alter type public.ai_call_kind add value if not exists 'hypnose';
