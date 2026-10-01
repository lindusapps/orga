# Validation de L’Indus Staff V30.1

Version construite à partir de `LIndus_Staff_V29_Demo_Desktop.zip`, le 1er octobre 2026.

## Contrôles exécutés

**24 tests de logique réussis**, exécutés sur le JavaScript final avec Node.js et
une simulation minimale du document. Ils vérifient les fonctions réelles de
l’application et certains gestionnaires d’événements ; ils ne mesurent pas le
rendu d’un navigateur.

- Chargement de l’application, reprise des données V29 et conservation de la clé de stockage.
- Génération des trois vues ; mois de cinq et six semaines, jours des mois voisins.
- Affichage de tous les salariés actifs, y compris un compte ajouté avec un nom long.
- Navigation jour, semaine et mois ; changement d’année et année bissextile.
- Disponibilité distincte d’une présence ; sélection d’un seul créneau déclaré.
- Fin du service modifiable, durée après minuit et créneaux personnalisés.
- Congé et absence : couleurs distinctes et suppression de l’affectation horaire.
- Publication, actualisation du calendrier et maintien du dernier planning publié pendant les modifications.
- Actualisation de l’accueil et planning personnel Employé.
- Détection des plages non couvertes, y compris couverture partielle et départ anticipé.
- Verrouillage du jeudi et déverrouillage individuel.
- Dimanche exclu du planning standard ; événement exceptionnel possible le dimanche.
- Refus de publier un horaire dont la disponibilité a été retirée.
- Restrictions des actions Direction et absence de collègues dans l’accueil Employé.
- Prévisualisation et synthèse de la période.
- Publication mensuelle excluant les dates des mois voisins.
- Appel des gestionnaires de navigation et de changement de date.

Contrôles de structure supplémentaires : syntaxe JavaScript, unicité des
identifiants HTML, conservation des identifiants V29, logo intégré inchangé et
comparaison des écrans hors accueil/planning avec l’original, avant la retouche
Débrief V30.1.

Le script `tests/test-planning.cjs` permet de reproduire les tests de logique :

```sh
node tests/test-planning.cjs
```

Aucune bibliothèque à installer. Les données des tests restent en mémoire ;
elles ne modifient pas les données du navigateur.

## Contrôles visuels restant à effectuer

Le moteur de navigateur automatisé n’est pas installé dans l’environnement de
travail. La tentative d’ouverture du fichier dans le navigateur intégré a été
refusée par sa politique de sécurité sur les URL locales. Aucun contrôle visuel
réussi n’est donc revendiqué.

1. Ouvrir `index.html`, choisir Direction puis Planning, à **1366 × 768**, puis
   **1920 × 1080**. Vérifier les sept colonnes et l’absence de défilement horizontal.
2. Parcourir la vue Mois jusqu’à la dernière ligne. Tester octobre 2026 (cinq
   semaines) et août 2026 (six semaines), avec leurs dates de chevauchement.
3. Faire défiler le calendrier : les jours/dates doivent rester fixés en haut de
   chaque bande et les noms à gauche. Vérifier que la navigation ne recouvre pas
   le calendrier et que la dernière ligne est accessible.
4. Passer en Semaine et Jour. Vérifier la navigation et les interactions réelles
   souris/clavier, notamment l’ouverture/fermeture du détail d’une cellule.
5. Sélectionner une disponibilité le 3 octobre, ajuster la fin, prévisualiser,
   publier, puis se reconnecter comme Employé pour consulter l’horaire publié.
6. Ajouter un événement, vérifier l’encadrement rouge et la mention ÉVÉNEMENT.
7. Vérifier le jeudi verrouillé puis l’ouverture d’un seul de ses créneaux.
8. À **390 × 844** et **768 × 1024**, vérifier les cartes mobiles, la navigation
   tactile, les disponibilités et la publication depuis l’interface conservée.
9. Vérifier l’accueil, la checklist, la recherche de cocktails, les débriefs,
   le pointage et l’administration dans le navigateur cible.

Les accès sont ceux d’une démo locale, sans garantie d’authentification serveur
ni synchronisation entre appareils, comme dans l’archive V29 fournie.

## Retouche Débrief V30.1

Texte agrandi, contraste renforcé, liserés latéraux verts/rouges et statuts
textuels discrets. Les champs de rédaction ont également été agrandis.
Contrôle de structure effectué : les trois cartes portent le bon statut, les
grands badges sont retirés, les autres écrans et le JavaScript sont inchangés
par rapport à la V30. Aucun nouveau test de logique nécessaire pour cette
retouche de présentation. Le rendu visuel reste à confirmer dans le navigateur.

## Préparation du dépôt public

Les huit valeurs de sels/empreintes de mots de passe des comptes prédéfinis
ont été retirées. Le test de persistance utilise des valeurs factices en mémoire
pour vérifier que les identifiants déjà enregistrés localement restent conservés.
Les accès rapides Direction et Employé sont conservés. Les 24 tests ont été
réexécutés sur cette version destinée au dépôt.
