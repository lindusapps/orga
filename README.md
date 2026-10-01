# L’Indus Staff — planning et comptes

Application statique avec planning jour/semaine/mois et débriefs lisibles.

## Connexion hébergée

L’identifiant est un numéro de téléphone et le mot de passe est choisi directement.
Aucun SMS, Twilio ou code par e-mail n’est utilisé dans ce parcours.

Supabase Auth utilise en interne un alias réservé `u<numero_international_sans_plus>@login.indussapp.invalid`. Ce n’est pas une boîte mail. Le fournisseur Auth email/password est utilisé ; le fournisseur Phone reste désactivé. Seul le téléphone est affiché dans l’application.

Les comptes doivent être créés par un administrateur via l’API Admin avec `email_confirm: true`. Le mot de passe n’est ni intégré au HTML ni stocké dans les tables métier. L’alias ne doit jamais servir à envoyer des invitations ou des messages de récupération.

Le premier compte doit être créé dans le tableau de bord Supabase, puis recevoir ses métadonnées serveur `staff_role: direction`, `staff_name`, `staff_login`, `staff_active: true`, `must_change_password: false`, `password_version: 0`. Relier ensuite son UUID à sa fiche `public.administrateurs` et passer la fiche à `actif`. La fiche seule ne donne aucun droit. Le premier compte administrateur a été créé et relié dans Supabase.

Déployer `supabase/functions/staff-admin/index.ts` avec `verify_jwt=true`. La fonction vérifie également l’utilisateur courant auprès d’Auth, son rôle dans app_metadata et la version du mot de passe. La clé service reste dans le runtime Supabase. CORS autorise seulement les domaines de production listés dans le fichier.

Dans Admin, la direction choisit un mot de passe lors de la création ou de la réinitialisation d’un compte. Après une réinitialisation, son titulaire doit le changer. Pour modifier son propre mot de passe, le mot de passe actuel est demandé. Les sessions de l’interface sont en mémoire et nécessitent une reconnexion après rechargement ou expiration.

## Limites et mise en production

Le premier compte est actif. Les tests automatisés Auth sont simulés ; le point d’entrée réel refuse les requêtes non authentifiées et accepte le précontrôle CORS du domaine de production. Un essai utilisateur de connexion/création/réinitialisation avec le mot de passe choisi reste à réaliser.

Les plannings, tâches, débriefs et pointages restent une démonstration locale. Ils ne sont pas synchronisés entre appareils par cette évolution. Les tables équipes et administrateurs ont été créées séparément dans Supabase.

Les accès rapides de démonstration ne fonctionnent qu’en ouvrant le fichier local ; ils sont retirés et ignorés sur le site hébergé. Aucun mot de passe utilisateur réel n’est présent dans ce dépôt public.

## Vérification

Avec Node.js 24 :

```sh
node tests/test-planning.cjs
node tests/test-auth.cjs
```

24 scénarios de planning ; tests d’authentification simulant les accès refusés, les rôles, la création, le mot de passe choisi, la réinitialisation, le remplacement des sessions locales et la déconnexion. Ces tests ne remplacent pas une vérification visuelle ni un test réel Supabase.
