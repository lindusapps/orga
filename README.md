# L’Indus Staff — planning et comptes

Application statique avec planning jour/semaine/mois et débriefs lisibles.

## Connexion hébergée

L’identifiant est un numéro de téléphone et le mot de passe est choisi directement.
Aucun SMS, Twilio ou code par e-mail n’est utilisé dans ce parcours.

Supabase Auth utilise en interne un alias réservé `u<numero_international_sans_plus>@login.indussapp.invalid`. Ce n’est pas une boîte mail. Le fournisseur Auth email/password est utilisé ; le fournisseur Phone reste désactivé. Seul le téléphone est affiché dans l’application.

Les comptes doivent être créés par un administrateur via l’API Admin avec `email_confirm: true`. Le mot de passe n’est ni intégré au HTML ni stocké dans les tables métier. L’alias ne doit jamais servir à envoyer des invitations ou des messages de récupération.

Pour un nouveau projet, le premier compte doit être créé dans le tableau de bord Supabase, puis recevoir ses métadonnées serveur `staff_role: direction`, `staff_name`, `staff_login`, `staff_active: true`, `must_change_password: false`, `password_version: 0`. Relier ensuite son UUID à sa fiche `public.administrateurs` et passer la fiche à `actif`. La fiche seule ne donne aucun droit. Le premier compte administrateur a été créé et relié dans Supabase.

Déployer `supabase/functions/staff-admin/index.ts` avec `verify_jwt=true`. La fonction vérifie également l’utilisateur courant auprès d’Auth, son rôle dans la table privée staff_accounts et la version du mot de passe. La clé service reste dans le runtime Supabase. CORS autorise seulement les domaines de production listés dans le fichier.

Dans Admin, la direction choisit un mot de passe lors de la création ou de la réinitialisation d’un compte. Après une réinitialisation, son titulaire doit le changer. Pour modifier son propre mot de passe, le mot de passe actuel est demandé. Les sessions de l’interface sont en mémoire et nécessitent une reconnexion après rechargement ou expiration.

## Modules partagés

Appliquer une fois `database/modules.sql`, puis déployer `supabase/functions/staff-data/index.ts` avec `verify_jwt=true`. Les migrations sont déjà appliquées au projet de production et les deux fonctions sont déployées.

- Planning : brouillon et publication distincts, révision contrôlée pour détecter les modifications concurrentes. Les salariés ne reçoivent que leur planning publié.
- Disponibilités : saisie par le titulaire, visible par la direction ; écritures successives mises en file pour conserver les sélections rapides.
- Tâches : checklist partagée par journée (Europe/Paris), auteur visible uniquement par la direction.
- Débriefs : service publié du salarié et retour collectif de la direction.
- Pointages : début/fin enregistrés à l’heure du serveur, démarrage et arrêt idempotents ; correction par la direction avec motif.
- Signalements : enregistrement personnel et consultation par la direction.

Les tables métier des modules sont fermées aux rôles navigateur `anon` et `authenticated`. Seule la fonction serveur accède à ces tables après validation de l’utilisateur auprès d’Auth, du rôle actif et de la version du mot de passe. RLS reste activé sans politique publique : l’avis informatif « RLS Enabled No Policy » correspond ici au refus volontaire de l’accès direct. Voir [le contrôle Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Les données de démonstration et l’authentification locale sont supprimées. Le navigateur ne conserve que les préférences d’affichage du calendrier. Les jeux d’exemple de planning sont isolés dans `tests/initial-fixture.js` et ne sont pas chargés par l’application.

`vercel.json` relaie Auth et les fonctions depuis `/api/` sur le même domaine que l’application, sans cache. Le numéro reste un identifiant : aucun prestataire SMS n’est nécessaire. Une fusion sur la branche de production déclenche le déploiement GitHub/Vercel existant.

## Limites explicites

Les rappels automatiques ne sont pas configurés. L’activité de session est temporaire ; les validations et corrections sont conservées dans leurs modules. Les actualisations se font après chaque écriture et toutes les 20 secondes hors saisie, ou avec le bouton Actualiser. Une reconnexion est nécessaire après rechargement ou expiration de session.

La protection Supabase contre les mots de passe compromis est désactivée dans les réglages actuels du projet ; voir [le réglage Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). L’application impose déjà longueur et complexité aux créations et changements.

Le mot de passe du premier administrateur est celui choisi dans Supabase ; aucun mot de passe réel n’est présent dans ce dépôt public. Le test de connexion utilisateur avec ce mot de passe reste à confirmer.

## Vérification

Avec Node.js 24 :

```sh
node tests/test-planning.cjs
node tests/test-auth.cjs
node tests/test-data.cjs
```

25 scénarios de planning ; tests Auth et API métier simulés : rôles, filtres personnels, réinitialisation, identité et date serveur, disponibilités, validation de publication, conflit de révision et écritures rapides. Dans la base réelle, le démarrage/arrêt idempotent du pointage et les contraintes ont été vérifiés dans une transaction annulée. Aucun pointage de test n’est conservé.

## Comptes, fonctions et équipes

La direction dispose de trois fonctions dans le menu : **Direction**, **Employé**, **Responsable sécurité**. Les libellés et descriptions viennent de `staff_roles` ; `staff_accounts` conserve le nom, le numéro de connexion, la fonction, l’activation et la révision du compte. Les mots de passe restent dans Supabase Auth.

Les équipes Bar, Run et Sécu viennent de `equipes`. Un employé peut appartenir à plusieurs équipes, via sa fiche `employes` et `employes_equipes`. La création du compte et le formulaire Modifier permettent de choisir les équipes, la fonction et l’activation. Les comptes sans équipe sont explicitement indiqués. La direction voit le nombre d’employés actifs par équipe. Les fonctions Direction et Responsable sécurité ne sont pas des affectations d’employé.

Les droits sont relus dans SQL à chaque requête authentifiée. Une ancienne valeur de rôle dans un jeton ou dans les métadonnées Auth ne donne aucun privilège. Les accès directs des rôles navigateur aux tables de profils et d’équipes sont révoqués. Les RPC d’administration et de validation sont réservées au service serveur.

Le responsable sécurité dispose d’un écran séparé : date, agents Sécu actifs, créneaux disponibles, heure de fin, validation et publication du service individuel. Il ne reçoit ni les employés Bar/Run non rattachés à Sécu, ni leurs horaires, ni les tâches, débriefs, pointages ou comptes. Il ne peut pas créer des événements, modifier les créneaux communs, ouvrir les jeudis, éditer les autres modules ou gérer les affectations. Un employé multi-équipe incluant Sécu est considéré comme agent Sécu. Le responsable peut changer son propre mot de passe et se déconnecter.

La validation SQL vérifie sous verrou le rôle actuel, l’activation, l’appartenance à Sécu, la disponibilité, l’ouverture du créneau et la révision du planning. Elle modifie uniquement l’agent choisi et préserve les autres services. Le changement d’équipe retire immédiatement ce périmètre de validation. Les révisions des comptes et du planning évitent d’écraser une modification concurrente ; un administrateur ne peut pas retirer ses propres droits Direction et le dernier compte Direction actif est protégé.

Installation depuis les scripts : `database/modules.sql`, puis `database/accounts-teams.sql`, puis `database/security-manager.sql`, avec les tables équipes/administrateurs déjà présentes. Sur le projet actuel, toutes ces migrations sont appliquées. Déployer ensuite les versions correspondantes des fonctions `staff-admin` et `staff-data`, avec vérification JWT active.

Tests supplémentaires : `node tests/test-security.cjs`. `tests/security-sql.sql` vérifie les RPC réelles dans une transaction annulée, y compris les refus et la préservation du planning des autres équipes ; aucun compte ni pointage de test n’est conservé.
