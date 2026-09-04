-- L'adresse publique d'un cabinet passe de klaroweb.site/c/<slug> à
-- klaroweb.site/<slug>. Le préfixe protégeait la racine ; il disait aussi le
-- fournisseur dans l'adresse même que le cabinet imprime sur ses cartes,
-- c'est-à-dire tout ce que la marque blanche est censée taire.
--
-- CE QUI CHANGE ICI N'EST PAS L'ADRESSE — elle se règle dans le routage — MAIS
-- CE QU'UN IDENTIFIANT A LE DROIT D'ÊTRE. Tant que les cabinets vivaient sous
-- /c/, un cabinet nommé « mon » ou « api » était sans conséquence. À la racine,
-- il capturerait une route du produit : le cabinet deviendrait inaccessible, et
-- la page qu'il masque aussi.
--
-- POURQUOI EN BASE, ET PAS SEULEMENT DANS L'ÉCRAN DU REVENDEUR. Les cabinets
-- sont créés depuis le navigateur, sous RLS : l'écran propose un identifiant,
-- mais rien n'oblige à passer par l'écran. Une vérification côté client rend un
-- message lisible ; seule une contrainte empêche l'écriture.
--
-- LA LISTE EST VOLONTAIREMENT PLUS LARGE QUE LES ROUTES D'AUJOURD'HUI. Réserver
-- « tarifs » alors qu'aucune page ne s'appelle ainsi ne coûte rien. Le réclamer
-- le jour où un cabinet l'a imprimé sur ses cartes coûte l'adresse de quelqu'un
-- — et on ne reprend pas l'adresse d'un cabinet. Elle doit rester le miroir de
-- CHEMINS_RESERVES, dans src/lib/vitrine.ts.

alter table public.cabinets
  drop constraint if exists cabinets_slug_forme;

alter table public.cabinets
  add constraint cabinets_slug_forme check (
    slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'
    and slug not in (
      -- Ce qui est déjà servi.
      'mon', 'api', 'c', 'e', 'assets', 'auth', 'admin', 'static', 'public',
      'index', 'patient', 'embed', 'favicon', 'robots', 'sitemap', 'manifest',
      -- Les pages qu'un produit finit toujours par vouloir.
      'accueil', 'home', 'a-propos', 'apropos', 'about', 'aide', 'help', 'faq',
      'support', 'contact', 'tarifs', 'prix', 'pricing', 'blog', 'actualites',
      'presse', 'equipe', 'partenaires', 'demo', 'essai', 'docs', 'doc',
      'guide', 'nouveautes', 'statut', 'status',
      -- Les mentions légales, qu'on ne choisit pas d'avoir.
      'cgv', 'cgu', 'legal', 'mentions', 'confidentialite', 'cookies', 'rgpd',
      -- Le vocabulaire du produit : ambigu comme adresse de cabinet.
      'klaro', 'cabinet', 'cabinets', 'therapeute', 'therapeutes', 'patients',
      'revendeur', 'revendeurs', 'compte', 'connexion', 'login', 'logout',
      'deconnexion', 'inscription', 'signup', 'app', 'espace', 'boutique',
      -- Ce qu'une infrastructure réclame tôt ou tard.
      'www', 'cdn', 'media', 'img', 'images', 'files', 'fichiers', 'css', 'js',
      'fonts', 'webhook', 'webhooks', 'health', 'stripe', 'supabase',
      'well-known'
    )
  );

comment on constraint cabinets_slug_forme on public.cabinets is
  'L''identifiant est une adresse à la racine du domaine : il doit en avoir la forme, et ne pas heurter une route du produit. Miroir de CHEMINS_RESERVES (src/lib/vitrine.ts).';
