# Base de données

Projet Supabase **entre-seances** (`koytgcbpeorupdklswxd`), région `eu-west-3`
(Paris), distinct de tout autre projet de l'organisation.

## Les trois niveaux

| Niveau | Voit | Ne voit pas |
| --- | --- | --- |
| **Revendeur** | ses cabinets, ses interlocuteurs, les abonnements, des compteurs agrégés | **aucune donnée de santé** : ni patient, ni note, ni transcription, ni journal |
| **Cabinet** (thérapeute) | tous ses patients et leurs données | les autres cabinets |
| **Patient** | ses modules, ses audios, son journal, son échelle | le dossier clinique de la thérapeute, les autres patients |

Le cloisonnement du revendeur ne repose pas sur l'interface : **aucune politique
RLS d'une table de santé ne mentionne l'appartenance à un revendeur.** Il n'a
donc pas de chemin de lecture, quelle que soit la requête. `tests/isolation.sql`
vérifie cet invariant et échoue si une migration future l'entame.

Ce que le revendeur obtient à la place : `reseller_cabinet_overview()`, une
fonction `security definer` qui filtre d'abord sur son appartenance et ne
renvoie que des compteurs. Les moyennes sont supprimées sous trois patients
actifs — dans un cabinet d'un patient, une moyenne est un chiffre individuel.

## Migrations

| Fichier | Contenu |
| --- | --- |
| `0001_socle_multi_cabinet.sql` | revendeurs, cabinets, membres, invitations, marque blanche, fonctions d'appartenance |
| `0002_donnees_de_sante.sql` | patients, modules, audios, échelle, journal, séances, profils, affirmations, notifications |
| `0003_commercial_et_revendeur.sql` | offres, abonnements, consommation IA, journal d'accès, agrégats du revendeur |
| `0004_durcissement_execution.sql` | qui a le droit d'appeler quelle fonction |
| `0005_connexion_et_roles.sql` | `my_context()`, `claim_access()` : le lien magique rattache un compte à ce qui l'attendait |
| `0006_invitations_revendeur.sql` | invitations d'un revendeur |
| `0007_gestes_du_patient.sql` | ce qu'un patient peut modifier, par fonctions nommées |
| `0008_invitation_sans_jeton.sql` | le jeton d'invitation devient facultatif |
| `0009_integrations.sql` | `cabinet_settings` (ce qui se montre) et `cabinet_secrets` (clés chiffrées, réservées au serveur) |
| `0010_boutique.sql` | produits du cabinet, commandes écrites par le serveur seul |
| `0011_stockage_audios.sql` | compartiment privé `audios`, rangé par cabinet, URL signées |
| `0012_lectures_de_la_patiente.sql` | la patiente lit les audios et notifications qui lui sont envoyés |
| `0013_programmes_et_reservation.sql` | chaque cabinet nomme ses programmes ; la réservation perd son nom d'éditeur et sait s'encadrer |
| `0014_vitrine_du_cabinet.sql` | nom, sur-titre et couleurs d'un cabinet, lisibles avant toute connexion |
| `0015_logo_du_cabinet.sql` | compartiment public `logos`, écrit par le cabinet seul, lu par tous |
| `0018_hypnose_comptee.sql` | l'énumération `ai_call_kind` connaît enfin « hypnose » : sa consommation s'inscrivait dans le vide |
| `0017_hypnose_et_profil_detaille.sql` | l'hypnose en quatre mouvements, activée fiche par fiche ; le profil gagne ce qui bouge et l'alliance |
| `0016_revente_ia.sql` | deux façons de vendre l'IA, au choix cabinet par cabinet ; grand livre des crédits, paquets, achats |

## Fichiers du dépôt et historique de la base

Les fichiers portent un numéro (`0001` à …) ; la base, elle, a enregistré
chaque migration sous un horodatage, au moment où elle a été appliquée
(`supabase_migrations.schema_migrations`, lisible par `list_migrations`). Les
deux historiques ne se rapprochent donc pas d'eux-mêmes : **`supabase db push`
et `supabase migration list` ne savent pas les apparier**, et proposeraient de
rejouer ce qui est déjà en place. On ne les emploie pas sur ce projet.

**La règle.** Une migration s'applique par `apply_migration` avec pour nom le
fichier sans son extension — numéro compris, comme depuis `0040`. Ce tableau
reçoit alors sa ligne. Aucun fichier n'est renommé : son numéro est cité dans
les commentaires et les épreuves des migrations suivantes.

Relevé du 28 septembre 2026 (base `koytgcbpeorupdklswxd`).

| Fichier | Version en base | Nom en base |
| --- | --- | --- |
| `0001_socle_multi_cabinet.sql` | 20260831202428 | socle_multi_cabinet |
| `0002_donnees_de_sante.sql` | 20260831202509 | donnees_de_sante |
| `0003_commercial_et_revendeur.sql` | 20260831202539 | commercial_et_revendeur |
| `0004_durcissement_execution.sql` | 20260831202622 | durcissement_execution |
| `0005_connexion_et_roles.sql` | 20260831215427 | connexion_et_roles |
| `0006_invitations_revendeur.sql` | 20260831215456 | invitations_revendeur |
| `0007_gestes_du_patient.sql` | 20260831215854 | gestes_du_patient |
| `0008_invitation_sans_jeton.sql` | 20260901053141 | invitation_sans_jeton |
| `0009_integrations.sql` | 20260901235856 | integrations |
| `0010_boutique.sql` | 20260902000047 | boutique |
| `0011_stockage_audios.sql` | 20260902001413 | stockage_audios |
| `0012_lectures_de_la_patiente.sql` | 20260902060530 | lectures_de_la_patiente |
| `0013_programmes_et_reservation.sql` | 20260902120737 | programmes_et_reservation |
| `0014_vitrine_du_cabinet.sql` | 20260902122419 | vitrine_du_cabinet |
| `0015_logo_du_cabinet.sql` | 20260902123425 | logo_du_cabinet |
| `0016_revente_ia.sql` | 20260902181417 | revente_ia |
| `0017_hypnose_et_profil_detaille.sql` | 20260902202751 | hypnose_et_profil_detaille |
| `0018_hypnose_comptee.sql` | — (voir ci-dessous) | — |
| *(aucun fichier)* | 20260902204211 | notification_heure_precise |
| `0019_offres_domaine_smtp_site.sql` | 20260903133951 | offres_domaine_smtp_site |
| `0020_surface_api_reduite.sql` | 20260903142413 | surface_api_reduite |
| `0021_invitations_bornees.sql` | 20260903142802 · 20260903142822 · 20260903142903 | invitations_bornees · invitations_bornees_droit_execution · invitations_bornees_ancienne_politique |
| `0022_plafond_dit_le_bon_geste.sql` | 20260903143427 | plafond_dit_le_bon_geste |
| `0023_droits_appliques_aux_pages_publiques.sql` | 20260903143652 | droits_appliques_aux_pages_publiques |
| `0024_une_note_par_soir.sql` | 20260903144657 | une_note_par_soir |
| `0025_derive_et_trois_oublis.sql` | 20260903165348 | derive_et_trois_oublis |
| `0026_boutique_selon_offre.sql` | 20260903170750 | boutique_selon_offre |
| `0027_journal_ordonne.sql` | 20260903223742 | journal_ordonne |
| `0028_identifiants_a_la_racine.sql` | 20260904003030 | identifiants_a_la_racine |
| `0029_habillage_vitrine.sql` | 20260904014311 | habillage_vitrine |
| `0030_frontieres_refermees.sql` | 20260904201025 | frontieres_refermees |
| `0031_compter_une_seance.sql` | 20260904202126 | compter_une_seance |
| `0032_plafond_a_la_reouverture.sql` | 20260904202537 | plafond_a_la_reouverture |
| `0033_publier_sans_perdre.sql` | 20260905025327 | publier_sans_perdre |
| `0034_affirmations_du_lundi.sql` | 20260905112100 | affirmations_du_lundi |
| `0035_abonnement_en_regle.sql` | 20260905112507 | abonnement_en_regle |
| `0036_lheure_dite.sql` | 20260905113317 · 20260905113613 | lheure_dite · lheure_dite_sans_recursion |
| `0037_un_seul_identifiant.sql` | 20260905114352 | un_seul_identifiant |
| `0038_deux_index_et_du_menage.sql` | 20260905120804 | deux_index_et_du_menage |
| `0039_portes_refermees.sql` | 20260905121254 | portes_refermees |
| `0040_rappels_sur_le_telephone.sql` | 20260928164924 | 0040_rappels_sur_le_telephone |
| `0041_changer_son_mot_de_passe.sql` | 20260928181603 | 0041_changer_son_mot_de_passe |
| `0042_une_equipe_par_cabinet.sql` | 20260928194749 | 0042_une_equipe_par_cabinet |
| `0043_la_seance_se_referme.sql` | 20260928194830 | 0043_la_seance_se_referme |
| `0044_le_suivi_clos_ferme_la_porte.sql` | 20260928195441 | 0044_le_suivi_clos_ferme_la_porte |
| `0045_retirer_et_rattacher.sql` | 20260928195517 | 0045_retirer_et_rattacher |
| `0046_l_assiduite_ne_compte_que_les_taches.sql` | 20260928201356 | 0046_l_assiduite_ne_compte_que_les_taches |
| `0047_la_boutique_rattrape_et_se_ferme.sql` | 20260928213937 | 0047_la_boutique_rattrape_et_se_ferme |
| `0048_la_vitrine_suit_le_contrat.sql` | 20260928214019 | 0048_la_vitrine_suit_le_contrat |
| `0049_le_contrat_tient_parole.sql` | 20260928214149 | 0049_le_contrat_tient_parole |
| `0050_la_base_tient_la_charge.sql` | 20260928214220 | 0050_la_base_tient_la_charge |
| `0051_chaque_jour_se_coche.sql` | 20260928214258 | 0051_chaque_jour_se_coche |
| `0052_le_portefeuille_compte_les_jours.sql` | 20260928215828 | 0052_le_portefeuille_compte_les_jours |
| `0053_le_dossier_se_relit_et_se_facture.sql` | 20260929005253 | 0053_le_dossier_se_relit_et_se_facture |
| `0054_le_mot_lu_et_repondu.sql` | 20260929005345 | 0054_le_mot_lu_et_repondu |
| `0055_les_rappels_reviennent_et_se_taisent.sql` | 20260929023224 | 0055_les_rappels_reviennent_et_se_taisent |
| `0056_le_second_facteur_garde_le_dossier.sql` | 20260929023258 | 0056_le_second_facteur_garde_le_dossier |
| `0057_le_revendeur_tient_son_equipe_et_ses_cabinets.sql` | 20260929023442 | 0057_le_revendeur_tient_son_equipe_et_ses_cabinets |
| `0058_la_vente_se_rembourse_et_se_compte.sql` | 20260929023511 | 0058_la_vente_se_rembourse_et_se_compte |
| `0059_la_seance_a_une_date.sql` | 20260929023609 | 0059_la_seance_a_une_date |
| `0061_la_franchise_par_defaut.sql` | 20260929015413 | 0061_la_franchise_par_defaut |
| `0060_les_demandes_d_essai.sql` | 20260929010836 | 0060_les_demandes_d_essai |

`0060` (demandes d'essai) a été appliquée avant `0055` à `0059` : elles ne se touchent pas.

Les écarts, et ce qu'ils recouvrent — le contenu, lui, est en place :

- **`0018_hypnose_comptee.sql` n'a pas d'entrée.** Son unique instruction
  (`alter type ai_call_kind add value 'hypnose'`) a été jouée hors de
  l'historique : la valeur est bien dans l'énumération. À l'inverse, l'entrée
  `notification_heure_precise` n'a pas de fichier : elle ajoutait
  `push_notifications.scheduled_at` et son index, que `0025` reprend
  (`add column if not exists`). Rejouer `0018` serait sans effet.
- **`0021` et `0036` ont été appliquées en plusieurs temps** (trois et deux
  entrées) : le fichier est la somme de ses entrées.
- **La journée quotidienne porte le numéro `0051`.** Écrite en même temps
  que `0046_l_assiduite_ne_compte_que_les_taches`, elle portait d'abord le
  même numéro ; elle a été renumérotée avant d'être appliquée. Les migrations
  `0047` à `0051` s'appliquent dans l'ordre de leur numéro.

Les tests de `tests/` se jouent sous les droits réels de chaque acteur, dans
un seul bloc qui se rétracte (`RAISE EXCEPTION 'REUSSITE …'`) : rien ne
persiste, et le message dit ce qui a été vérifié.

## Choix à connaître

- **`cabinet_id` est répété sur chaque table de santé.** Dénormalisation
  volontaire : chaque politique RLS devient une seule recherche d'index, et une
  jointure oubliée ne peut pas élargir l'accès.
- **`ai_usage` ne porte ni `patient_id` ni contenu.** Le revendeur facture des
  appels ; il ne remonte pas à une personne. L'horodatage détaillé lui reste
  invisible : il ne voit que la somme du mois.
- **Le profil psychologique est versionné** (`psych_profiles.version`) et garde
  le nombre de séances au moment de l'établissement : c'est lui qui donne la
  marge d'incertitude affichée à l'écran.
- **Une transcription exige un consentement horodaté** (contrainte
  `therapy_sessions_transcript_needs_consent`). L'effacement demandé par le
  patient vide la transcription sans détruire la note de la thérapeute.
- **Le journal privé du patient est invisible au cabinet** tant qu'il n'est pas
  partagé : la politique de lecture du cabinet exige `shared = true`.
- **Le patient écrit ses pages, pas leur lecture** (`0054`). Sur
  `journal_pages`, le rôle authentifié n'a plus que des droits par colonne :
  insertion de `cabinet_id, patient_id, title, body, trigger_label, shared,
  position`, mise à jour de `title, body, trigger_label, shared, position`.
  `lu_le` n'est posé que par `cabinet_marquer_page_lue()` et
  `cabinet_repondre_a_la_page()`. Une colonne ajoutée plus tard que l'espace
  patient doit écrire devra être accordée nommément.
- **Un rappel arrive masqué sur l'écran verrouillé tant que la personne n'a
  pas choisi de l'afficher** (`0055`). `rappels_a_pousser()` rend lui-même le
  texte neutre (« Un nouveau mot dans votre espace ») : le contenu masqué ne
  quitte pas la base, et le serveur le masque encore si la colonne `masque`
  manque. `preferences_rappels` (discrétion, rappel du soir) n'a aucune
  politique ni droit pour `authenticated` : la personne la lit et la règle
  par `patient_preferences_rappels()` / `patient_regler_rappels()`, le cabinet
  n'y a pas accès. Les rappels qui reviennent (`rappels_recurrents`) se
  programment et s'arrêtent par deux fonctions ; la base écrit le mot du
  jour dans le passage de la minute, une fois par jour et par rappel
  (contrainte `push_notifications_occurrence_unique`). `0055` redéfinit
  `declencher_rappels()`, `rappels_a_pousser()` et `patient_mots()` : une
  migration postérieure qui y touche part de ces définitions.
- **`audit_log` est en ajout seul** : `update` et `delete` sont révoqués.
- **Un compte à double authentification n'est membre de son cabinet qu'en
  `aal2`** (`0056`). `is_cabinet_member()` et `est_titulaire_du_cabinet()`
  exigent, pour un compte qui a un facteur vérifié dans `auth.mfa_factors`,
  un jeton `aal2` ; un compte sans facteur ne voit rien changer, le côté
  patient non plus. La condition est écrite dans le corps des deux fonctions
  — pas en politiques restrictives, qui laisseraient ouvertes les fonctions
  `security definer` et le stockage. Une migration qui redéfinit l'une des
  deux doit repartir de `0056` : `tests/double_authentification.sql` échoue
  sinon.
- **Un cabinet fermé ferme la porte de ses patients, pas celle de sa
  praticienne** (`0057`). `cabinets.archived_at` ne se pose et ne s'efface
  que par le propriétaire du revendeur (`revendeur_fermer_cabinet()`, ou
  écriture directe gardée par un déclencheur), daté par la base et inscrit au
  journal (`cabinet.ferme`, `cabinet.rouvert`). Fermé, le cabinet n'est plus
  en règle (`abonnement_en_regle()`), `is_patient_record()` et « le patient
  lit sa fiche » exigent `cabinet_ouvert()`, `my_context()` ne rend plus la
  fiche, `cabinet_vitrine()` ne répond plus et `claim_access()` n'y rattache
  personne ; `is_cabinet_member()` n'est pas touchée. Les fonctions de rappels
  de `0055` filtrent sur `patients.archived_at` seulement : une migration qui
  y touche ajoute `and public.cabinet_ouvert(p.cabinet_id)`. L'équipe du
  revendeur : seul un propriétaire invite, relance, annule et retire
  (`retirer_du_revendeur()`), la base signe l'invitation, et `claim_access()`
  n'honore que celle d'un propriétaire en place ou de la plateforme. Le
  navigateur ne met à jour que `resellers.name` et `resellers.support_email`,
  pour le propriétaire.
- **Une demande d'essai ne s'écrit que par le serveur** (`0060`). La page
  d'accueil envoie le formulaire à `api/invitations` (geste
  `demande-essai`), qui vérifie le CAPTCHA quand `HCAPTCHA_SECRET` est posé,
  puis appelle `deposer_demande_essai()` avec la clé de service — la seule à
  pouvoir l'exécuter : ouverte à `anon`, elle aurait rendu le CAPTCHA
  contournable. La fonction relit chaque champ, exige le consentement, et
  borne à trois demandes par adresse et par jour, trente par heure sur la
  plateforme. `demandes_essai` n'a aucun droit pour `anon` ; les membres du
  revendeur qui l'accueille (`resellers.accueille_demandes`, un seul à la
  fois) la lisent, l'effacent, et n'en changent que `statut` et
  `note_interne`.
- **Une note d'honoraires ne s'écrit que par la base** (`0053`). Le rôle
  authentifié n'a que `select` sur `notes_honoraires` ; il émet par
  `cabinet_emettre_note_honoraires()` — numéro = plus grand du cabinet + 1,
  sous verrou de la ligne `cabinet_facturation`, donc sans trou — et annule
  par `cabinet_annuler_note_honoraires()`, qui garde le numéro. Supprimer une
  fiche détache ses notes (`patient_id` nul) sans les effacer : ce sont des
  pièces comptables. L'anamnèse (`dossier_anamneses`) et les notes datées
  (`dossier_notes`) suivent la fiche, et ne se lisent qu'au cabinet.
- **Une vente ne se rembourse que par le serveur, et le reste** (`0058`).
  `orders` n'a toujours aucune politique d'écriture : `api/shop` (geste
  `rembourser`, réservé à la titulaire, second facteur compris) rembourse avec
  la clé Stripe du cabinet puis note `status = 'remboursee'`, `rembourse_at`,
  `stripe_refund_id`. Un déclencheur empêche une vente remboursée de
  redevenir payée ou d'être réécrite. Rembourser ne retire rien au patient ;
  la garde de `0045` ne tenant que les ventes payées, la praticienne peut
  ensuite retirer l'audio depuis la fiche. Le livre des recettes se lit par
  dates d'encaissement et de remboursement (deux index partiels). Les ventes
  d'une fiche supprimée partent avec elle (`on delete cascade` de `0010`,
  inchangé) : l'écran invite à exporter avant.
- **Un solde de crédits ne s'écrit pas, il se somme.** `credit_ledger` est en
  ajout seul, et `insert`, `update`, `delete` y sont révoqués pour le rôle
  authentifié : seul le serveur y écrit. Une thérapeute ne peut donc pas se
  créditer, ni effacer une consommation, et chaque mouvement garde sa raison.
  `cabinet_credit_balance()` fait la somme ; `cabinet_ai_billing()` rend au
  cabinet son mode, son solde et son découvert — rien du revendeur.
- **`reseller_secrets` n'a ni politique ni droit pour `authenticated`**, comme
  `cabinet_secrets` (0009) : la clé Anthropic et la clé Stripe du revendeur
  vivent chiffrées, et ne sortent que côté serveur. `reseller_ai_settings` se
  lit par son revendeur mais ne s'écrit que par le serveur, qui éprouve chaque
  clé par un appel réel avant de l'enregistrer.
- **La prochaine séance est un instant, et son rappel s'écrit d'avance**
  (`0059`). `patients.next_session_at` (fixé à l'heure de Paris) prime sur le
  texte libre `next_session`, gardé en repli pour les fiches d'avant. Le
  déclencheur `rappeler_la_veille()` écrit, quand la date est fixée, un mot
  programmé la veille à 18 h (« Votre séance est demain à 14 h 30. », sans
  auteur) : il part par le chemin de tous les mots, sans que
  `declencher_rappels()`, `rappels_a_pousser()` ni `patient_mots()` soient
  redéfinies. `rappels_de_seance` (aucune politique, aucun droit pour
  `authenticated`) retient pour quelle séance il a été écrit : la même date
  resauvée n'en écrit pas un second, et un mot annulé par le cabinet ne revient
  pas. Déplacée, effacée, suivi clos : le mot en attente s'annule ; parti, il
  reste. Rien ne s'écrit quand la veille à 18 h est déjà passée.
- **Le parcours par défaut d'un programme ne s'écrit que par la base**
  (`0059`). `exercices_du_programme` se lit par le cabinet seul, ne s'écrit que
  par `cabinet_regler_parcours_type()` (la liste entière d'un coup, douze
  exercices au plus, types de l'atelier) et ne va au patient que par
  `cabinet_appliquer_parcours_type()` : les exercices choisis, à la suite de
  son parcours, sans doubler ce qu'il a déjà, jamais pour un suivi clos ni
  pour la fiche d'un autre cabinet.

## Hébergement — à régler avant toute donnée réelle

Supabase n'est pas certifié **HDS**. Pour des données de santé en France, cette
certification est une obligation légale. Cette base convient au développement,
à la démonstration et à la vente ; avant qu'une patiente y écrive une vraie
note, il faut une bascule vers un hébergeur certifié (OVHcloud, Scaleway,
Clever Cloud) ou un accord équivalent. Le schéma est du PostgreSQL standard,
sans extension propriétaire, précisément pour que cette bascule reste possible.

## La base est vierge

Aucune donnée de démonstration n'est versée en base. Tout ce qui existe est
créé depuis l'interface : le revendeur ouvre un cabinet et invite sa
praticienne, la praticienne crée ses patients. La seule ligne posée à la main
est l'organisation du revendeur et son invitation — il faut bien une première
porte.

Les données fictives de `src/data/` servent uniquement à l'affichage de
démonstration, quand l'application tourne sans base configurée. Elles ne sont
jamais écrites.

## Exécuter

```bash
# Une base NEUVE (locale, branche) : les fichiers dans l'ordre de leur numéro.
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
# Chaque épreuve finit par « REUSSITE : … » (une exception, qui annule tout).
psql "$DATABASE_URL" -f supabase/tests/isolation.sql
```

Contre la base du projet, jamais `supabase db push` : voir « Fichiers du dépôt
et historique de la base » plus haut.
