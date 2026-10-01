# L’Indus Staff — V30.1

Démo autonome de gestion d’équipe, issue de l’application V29 existante.

## Ouvrir

Ouvrir `index.html` dans un navigateur, puis choisir **Accès Direction** ou
**Accès Employé**. Aucun outil de compilation ni aucune dépendance n’est requis.

## Évolutions

- Planning Direction sur ordinateur : Jour, Semaine et Mois, avec semaines complètes.
- Disponibilités, horaires retenus et planning publié clairement séparés.
- Congés, absences, verrouillage du jeudi et journées exceptionnelles.
- Fin de service modifiable et synthèse des heures et de la couverture.
- Débriefs agrandis, meilleur contraste et liserés de réception verts ou rouges.
- Présentation mobile conservée et planning personnel pour les employés.

Consulter `LISEZ_MOI.txt` pour l’utilisation et la reprise des données locales.

## Validation

```sh
node tests/test-planning.cjs
```

24 tests de logique exécutés avec Node.js, sans dépendance. Leur document simulé
ne remplace pas les vérifications de rendu dans un navigateur. Les contrôles
visuels restants sont détaillés dans `VALIDATION.md`.

## Portée

Cette version utilise le stockage local du navigateur. Elle ne comprend ni
backend Supabase, ni déploiement Vercel, ni authentification serveur.

Les anciens sels et empreintes de mots de passe intégrés aux comptes de démo
ne sont pas inclus dans ce dépôt public. Utiliser les boutons d’accès démo ;
les identifiants déjà enregistrés localement sont conservés par la migration.
