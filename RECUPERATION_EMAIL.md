# Récupération du mot de passe par e-mail

La connexion reste basée sur le numéro de téléphone. L'adresse interne Supabase Auth n'est pas changée. Chaque utilisateur inscrit lui-même une adresse de récupération dans le menu de son profil, avec son mot de passe actuel, puis la vérifie grâce au lien reçu. Une adresse non vérifiée ne permet jamais de récupérer un compte.

Le bouton « Mot de passe oublié ? » demande le téléphone. Le serveur envoie uniquement à l'adresse déjà vérifiée ; le demandeur ne choisit pas le destinataire. La réponse publique est identique pour un compte absent, sans e-mail ou avec e-mail. Les comptes désactivés ne peuvent pas être récupérés.

## Activation de l'envoi

Aucun service d'envoi n'était configuré lors de l'ajout. Le bouton est présent et affiche honnêtement que l'envoi doit être configuré. Ne pas annoncer la récupération autonome comme opérationnelle avant un test réel d'envoi et de réception.

Configurer un domaine d'expédition chez Resend ou Brevo, puis enregistrer dans **Supabase > projet > Edge Functions > Secrets** :

- `STAFF_MAIL_PROVIDER` : `resend` ou `brevo`.
- `STAFF_MAIL_API_KEY` : clé privée du prestataire, uniquement dans Secrets.
- `STAFF_MAIL_FROM` : adresse d'expédition autorisée par le prestataire, sans nom d'affichage (ex. `comptes@votre-domaine.fr`).

Ne jamais enregistrer la clé dans GitHub, le HTML ou le navigateur. Le domaine `indussapp.vercel.app` ne peut pas servir de domaine d'expédition personnel. La fonction utilise une API HTTPS, pas les paramètres SMTP Supabase. Après configuration, vérifier une adresse sur un compte de test, demander un lien, changer le mot de passe et vérifier que les anciennes sessions et le lien utilisé sont refusés.

## Déploiement et sécurité

Appliquer `database/password-recovery.sql`, déployer `supabase/functions/staff-recovery/index.ts`, puis publier `index.html`. `staff-recovery` désactive le contrôle JWT de la passerelle car les demandes de récupération sont publiques, mais implémente son propre contrôle : JWT vivant + compte actif + version de mot de passe pour le profil, mot de passe actuel pour inscrire un e-mail, jeton secret pour vérifier ou réinitialiser. Les fonctions staff-admin/staff-data gardent leur contrôle JWT.

Les jetons aléatoires de 256 bits sont enregistrés uniquement sous forme de SHA-256, expirent après 30 minutes (vérification) ou 15 minutes (réinitialisation), et sont consommés atomiquement en SQL. Tous les liens du même compte sont invalidés lors de l'utilisation de l'un d'eux. Le lien est retiré de l'URL dès son ouverture, conservé uniquement en mémoire, et exige une action explicite : l'ouverture automatique par un scanner d'e-mails ne le consomme pas. Un rechargement après retrait du fragment nécessite de rouvrir le lien original.

Les données de récupération et les fonctions SQL sont réservées à service_role, avec RLS activée et sans droits anon/authenticated. Limites : 3 e-mails par compte et par heure, 50 e-mails globaux par heure, 300 demandes publiques par heure, 8 vérifications du mot de passe actuel par compte et par 15 minutes. Adapter les limites si l'équipe grandit. Les jetons expirés depuis plus d'un jour sont purgés lors des contrôles de limitation.

Le changement est effectué via Supabase Auth Admin ; cette opération révoque les sessions et incrémente aussi `password_version`, déjà contrôlée par les fonctions métier. Si Auth échoue après consommation du lien, demander un nouveau lien. Aucune session utilisateur n'est renvoyée par cette fonction.

## Validation

`tests/test-recovery.cjs` couvre la fonction avec services simulés et le parcours du navigateur (indisponibilité, preuve de propriété, erreur d'envoi, destinataire imposé, stockage haché, expiration, rejeu, mot de passe, retrait de l'URL). `tests/recovery-sql.sql` teste réellement les transactions, droits et règles SQL dans une transaction intégralement annulée. Les tests de connexion, session, droits, planning et publication doivent rester verts. L'envoi et la délivrabilité nécessitent encore le prestataire configuré.
