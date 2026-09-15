# hack42 — tout pour développer pendant le hackathon

> ⚠️ **Ce fichier contient des mots de passe et des secrets en clair.**
> Il ne va **jamais** dans le fork `hack42-hub` : le dépôt est **public**. Ni dans
> son wiki, ni dans une issue. À partager dans l'équipe, puis à supprimer à la fin
> du hackathon (vendredi 18/09), avec les services.

---

## 1. Les adresses

| Quoi | Adresse | Pour |
|---|---|---|
| **Hub prod** | https://hack42-hub.duckdns.org | la démo, suit le dernier tag `v*` |
| **Hub staging** | https://hack42-staging.duckdns.org | le travail en cours, suit `main` |
| Keycloak commun | https://auth.hack42-suite.duckdns.org | un seul compte pour tout (realm `lasuite`) |
| Docs | https://docs.hack42-suite.duckdns.org | éditeur de documents |
| Meet | https://meet.hack42-suite.duckdns.org | visio |
| LiveKit | https://livekit.hack42-suite.duckdns.org | audio et vidéo de Meet (rien à faire) |
| People | https://people.hack42-suite.duckdns.org | annuaire (1036 fiches) |
| Matrix staging | https://matrix.hack42-staging.duckdns.org | Synapse du staging, serveur `hack42-staging.duckdns.org` |
| MAS staging | https://mas.hack42-staging.duckdns.org | authentification Matrix du staging |
| Matrix prod | https://matrix.hack42-hub.duckdns.org | Synapse de la prod, serveur `hack42-hub.duckdns.org` |
| MAS prod | https://mas.hack42-hub.duckdns.org | authentification Matrix de la prod |
| Code | https://github.com/Gregory-Marquiset/hack42-hub | le fork, public |
| Wiki | https://github.com/Gregory-Marquiset/hack42-hub/wiki | objectifs, déploiement |

## 2. Les comptes

| Qui | Identifiant | Mot de passe |
|---|---|---|
| L'équipe | `matorgue`, `lnunez`, `gmarquis`, `cdutel`, `michen`, `aykrifa` | votre mot de passe habituel |
| Démonstration | `demo0` à `demo9` | `Hack42Demo2026` |

- Le **même compte** sur les deux Hub, Docs, Meet et People.
- Adresse mail de chacun : `login@hack42-suite.duckdns.org`.
- Identifiant Matrix : `@login:hack42-staging.duckdns.org` sur le staging, `@login:hack42-hub.duckdns.org` sur la prod.
- Les 6 comptes de l'équipe administrent le realm Keycloak `lasuite` (voir §6.1). Les démos ne peuvent pas changer leur mot de passe.
- Dix mots de passe faux : compte bloqué un quart d'heure.

---

## 3. Lancer le Hub sur son PC

### 3.1 Prérequis

**Linux**
- Docker et Docker Compose v2, votre utilisateur dans le groupe `docker` (`sudo usermod -aG docker $USER`, puis se reconnecter).
- `make`, `git`, `curl`.

**Windows 11** (testé le 15/09)
1. PowerShell en administrateur : `wsl --install --no-distribution`, puis **redémarrer**.
2. Installer Docker Desktop (backend WSL2), le lancer, attendre « Engine running ».
3. Installer Git pour Windows (Git Bash) et `make` : `winget install ezwinports.make`.
4. Tout lancer **dans Git Bash**. Ne pas utiliser le `make` de MSYS2 : il ne voit pas `OS=Windows_NT` et prend la mauvaise configuration.

**macOS** (non testé)
- Docker Desktop, `make` (outils Xcode : `xcode-select --install`).

### 3.2 Cloner

```bash
git clone https://github.com/Gregory-Marquiset/hack42-hub.git
cd hack42-hub
```

Les branches du hackathon partent de `main` : `git switch -c ma-fonctionnalite main`.

### 3.3 Démarrer

```bash
make bootstrap FLUSH_ARGS='--no-input'   # la première fois : images, base, démo (5 à 15 min)
make run-matrix                          # Synapse, MAS, Element
docker compose up -d frontend-development   # run-matrix arrête le front : on le relance
```

Puis http://localhost:9800, connexion `hub` / `hub`.

Ensuite, les jours suivants : `make run-matrix` puis `docker compose up -d frontend-development`.
Après un `git pull` qui touche aux dépendances : `make bootstrap FLUSH_ARGS='--no-input'` à nouveau.

### 3.4 Les services en local

| Service | Adresse | Identifiants |
|---|---|---|
| Front du Hub | http://localhost:9800 | `hub` / `hub` |
| API Django | http://localhost:9801 | admin : http://localhost:9801/admin, `admin@example.com` / `admin` (après `make superuser`) |
| Keycloak local | http://localhost:9802 | `admin` / `admin` |
| Nginx (médias, Keycloak) | http://localhost:9803 | — |
| Mails de test | http://localhost:9804 | — |
| MinIO | http://localhost:9806 | — |
| Element (client Matrix de test) | http://localhost:9807 | SSO puis `hub` / `hub` |
| Synapse | http://localhost:9808 | serveur `localhost` |
| MAS | http://localhost:9810 | délègue à Keycloak |
| PostgreSQL | port 9812 | `user` / `pass` |
| Redis | port 9813 | — |

Comptes de test du realm local : `hub`/`hub`, `user-e2e-chromium`/`password-e2e-chromium`, `user-e2e-webkit`/`password-e2e-webkit`, `user-e2e-firefox`/`password-e2e-firefox`.

### 3.5 Commandes utiles

| Commande | Effet |
|---|---|
| `make status` | état des conteneurs |
| `make logs` | journaux du backend |
| `make stop` / `make stop-matrix` | arrêter |
| `make down` / `make down-matrix` | tout supprimer (conteneurs, volumes) |
| `make migrate` / `make makemigrations` | migrations Django |
| `make superuser` | admin Django `admin@example.com` / `admin` |
| `make seed-matrix` | salons de test (demande `python3`) |
| `make reset-matrix` | repartir d'un Matrix vide |
| `make reset-keycloak` | réimporter le realm local |
| `make test` / `make lint` | tests et lint backend |
| `make frontend-lint` / `make frontend-test` | lint et tests front |
| `make run-frontend-development` | front en local hors Docker (après `make frontend-development-install`) |

---

## 4. Brancher son Hub local sur la Suite (Docs, Meet, comptes communs)

Seulement si vous travaillez sur Docs, Meet ou People. Le PC parle aux services par
**Internet en HTTPS** : pas de VPN, pas de SSH. Votre Synapse reste local (les bots
et les salons du staging n'y sont pas).

**Django** — créer ou compléter `env.d/development/common.local` (ignoré par git) :

```env
OIDC_OP_AUTHORIZATION_ENDPOINT=https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/auth
OIDC_OP_TOKEN_ENDPOINT=https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/token
OIDC_OP_JWKS_ENDPOINT=https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/certs
OIDC_OP_USER_ENDPOINT=https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/userinfo
OIDC_OP_INTROSPECTION_ENDPOINT=https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/token/introspect
OIDC_OP_LOGOUT_ENDPOINT=https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/logout
OIDC_RP_CLIENT_ID=hub-local
OIDC_RP_CLIENT_SECRET=Cezfeo8o5zXklQ2wCwVRokwScSUt7LnA
OIDC_REDIRECT_ALLOWED_HOSTS="localhost:9800,auth.hack42-suite.duckdns.org"
# pour que Django garde le jeton de l'utilisateur et appelle Docs avec :
OIDC_STORE_ACCESS_TOKEN=True
```

**MAS** — dans `docker/matrix/mas/config.yaml`, bloc `upstream_oauth2` :

```yaml
      issuer: https://auth.hack42-suite.duckdns.org/realms/lasuite
      client_id: matrix-auth-local
      client_secret: 198iOANJAcQi6mWiN1OqkPrXFLzrN1Wu
      authorization_endpoint: https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/auth
      token_endpoint: https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/token
      jwks_uri: https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/certs
      userinfo_endpoint: https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/userinfo
```

⚠️ Ce fichier est suivi par git : **ne jamais le commiter**. Avant un commit :
`git checkout -- docker/matrix/mas/config.yaml`.

Relancer :

```bash
make run-matrix
docker compose up -d --force-recreate app-dev frontend-development
```

Se connecter sur http://localhost:9800 avec son compte d'équipe.

---

## 5. Travailler sur le dépôt

- Branche depuis `main`, PR vers `main` du fork. Fusionné dans `main` → **staging** en 2 minutes.
- Tag `v*` sur `main` → **prod** en 2 minutes : `git tag v0.2.0 && git push origin v0.2.0`.
- Messages de commit (convention La Suite) :
  ```
  ✨(frontend) add the meeting button

  Courte description du pourquoi.
  ```
  gitmoji collé à la parenthèse, titre sans majuscule, < 80 caractères, ligne vide, description obligatoire,
  `git commit -s` (Signed-off-by) et signature `-S` si possible. Pas de ligne « co-authored by » d'IA.
- Suivre un déploiement : section **Deployments** de la page GitHub du dépôt.

---

## 6. Les API et l'administration de chaque service

### 6.1 Keycloak commun

| Accès | Adresse | Identifiants |
|---|---|---|
| Console complète (realm master) | https://auth.hack42-suite.duckdns.org/admin/ | `admin` / `PcROfYshXxkXCFMDYDcc6cEIwodYrFOX` |
| Console du realm `lasuite` | https://auth.hack42-suite.duckdns.org/admin/lasuite/console/ | votre compte d'équipe |
| Découverte OIDC | https://auth.hack42-suite.duckdns.org/realms/lasuite/.well-known/openid-configuration | — |

**Les clients du realm `lasuite`** (tous confidentiels) :

| Client | Utilisé par | Secret |
|---|---|---|
| `hub-local` | votre Django local | `Cezfeo8o5zXklQ2wCwVRokwScSUt7LnA` |
| `matrix-auth-local` | votre MAS local | `198iOANJAcQi6mWiN1OqkPrXFLzrN1Wu` |
| `hub-staging` | Django du staging | `H8U87dW16tPmy0eNYkhYcNCBFo00P5hn` |
| `matrix-auth-staging` | MAS du staging | `1pCiVbmYrW1DFixisExrR5PFRbWqzUQ0` |
| `hub-prod` | Django de la prod | `9iIaPpPb0pReUbpdi24M2nBCiGtRjpdX` |
| `matrix-auth-prod` | MAS de la prod | `VmubmdY5Z4JknG2i3GgfkWBkkyglKy4v` |
| `docs` | Docs (connexion et vérification des jetons) | `FRKqSEuC4BCvqURRmXuGbt61bMF6mL33` |
| `meet` | Meet | `9JyNVTLdOuF8KW0SG2ZvEme1SJAzVnHk` |
| `people` | People | `idP2MOz4iMV0AXaUFMOKiwhm3aLVovbI` |

⚠️ Changer un secret de `*-staging`, `*-prod`, `docs`, `meet` ou `people` dans la console
**casse** le service qui l'utilise : prévenir Greg.

Les jetons de `hub-staging`, `hub-prod` et `hub-local` contiennent déjà `docs` dans leur audience.

**API d'administration** :

```bash
# jeton administrateur
TOKEN=$(curl -s https://auth.hack42-suite.duckdns.org/realms/master/protocol/openid-connect/token \
  -d grant_type=password -d client_id=admin-cli \
  -d username=admin -d 'password=PcROfYshXxkXCFMDYDcc6cEIwodYrFOX' | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

# lister les comptes du realm
curl -s -H "Authorization: Bearer $TOKEN" https://auth.hack42-suite.duckdns.org/admin/realms/lasuite/users
```

**Obtenir le jeton d'un utilisateur en ligne de commande** (pour tester Docs) : la
connexion directe par mot de passe est coupée. Pour l'autoriser sur `hub-local` :
console `lasuite` → Clients → `hub-local` → **Direct access grants** : On. Puis :

```bash
curl -s https://auth.hack42-suite.duckdns.org/realms/lasuite/protocol/openid-connect/token \
  -d grant_type=password -d client_id=hub-local -d client_secret=Cezfeo8o5zXklQ2wCwVRokwScSUt7LnA \
  -d username=gmarquis -d 'password=<mot de passe>' -d scope=openid
```

### 6.2 Docs

| Accès | Adresse | Identifiants |
|---|---|---|
| Application | https://docs.hack42-suite.duckdns.org | votre compte |
| Admin Django | https://docs.hack42-suite.duckdns.org/admin/ | `admin@hack42-suite.duckdns.org` / `NsPtbaLXsGzrfFUeLnLS47FQ` |

**API externe** : jeton Keycloak d'un utilisateur, émis pour `hub-staging`, `hub-prod` ou `hub-local`.

```bash
curl -s -H "Authorization: Bearer <jeton utilisateur>" \
  https://docs.hack42-suite.duckdns.org/external_api/v1.0/documents/
```

| Route | Ouvert |
|---|---|
| `/external_api/v1.0/documents/` | lister, lire, créer, enfants |
| `/external_api/v1.0/documents/{id}/accesses/` | lister, lire, créer, modifier, supprimer |
| `/external_api/v1.0/documents/{id}/invitations/` | lister, lire, créer, supprimer |
| `/external_api/v1.0/users/me/` | l'utilisateur du jeton |

Sans jeton : 401. **Pas encore testé avec un vrai jeton utilisateur** : notez le résultat.
Pas de mail : les invitations par mail ne partent pas.

### 6.3 Meet

| Accès | Adresse | Identifiants |
|---|---|---|
| Application | https://meet.hack42-suite.duckdns.org | votre compte |
| Admin Django | https://meet.hack42-suite.duckdns.org/admin/ | `admin@hack42-suite.duckdns.org` / `gXwyTieyw5IvCF6pfnRaaaK2` |

**Applications** (API externe, créées dans l'admin, rubrique Applications) :

| Application | Identifiant | Secret |
|---|---|---|
| `hub-local` | `VMfG8qUBfKbw3Jb7ekVr20Hv0s131zwW4oqdZM5x` | `sDFTX3xwt1PhS1PUBhG7scqIrKcZiWwdJP8G3xgG7ioMAPcOzL0JC3ENaaBAvSRxeZ3VbVDzGf3TDpQmBHcxVNAGDuEJk54FdcbCRIi8TC10pz0JuOCPTDJRtUyNW3yr` |
| `hub-staging` | `QNcJdlKICLeWb8e6FvmnyukonrJBe0uTfNxxdwv0` | `Oem6e6EZvkCAXdmOIQfJYKQBKG3XNInjp9Xg8YSvk7sFYTOavo4UDeZI3ASEBbgPYkMpMBIEipqMw4IlxSaECTrBe637ZHPuT0v964hZix2UxYrh4T0qFH3sXuDX21cB` |
| `hub-prod` | `QqTboxnFCrQ3nJDYlkGhiYbu36YJhHqtf8Kfaq24` | `tTgbBuCy0HTTs1iSlUGOfKS2NkkUsx4TNID2ANw3iLJA1G66vmH3sVblP5rjktWwWQ0V3ig1wRTXIvaMspMRz0bwmc9BhIbtwvD1UB0Krn6PeGeLC3iisPBDJjjxCOGk` |

Portées : créer, lire et lister des salles. Uniquement pour des mails `@hack42-suite.duckdns.org`.

**Créer une salle (testé)** :

```bash
# 1. jeton au nom d'un utilisateur, valable 1 h
curl -s https://meet.hack42-suite.duckdns.org/external-api/v1.0/application/token/ \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"VMfG8qUBfKbw3Jb7ekVr20Hv0s131zwW4oqdZM5x","client_secret":"sDFTX3xwt1PhS1PUBhG7scqIrKcZiWwdJP8G3xgG7ioMAPcOzL0JC3ENaaBAvSRxeZ3VbVDzGf3TDpQmBHcxVNAGDuEJk54FdcbCRIi8TC10pz0JuOCPTDJRtUyNW3yr","grant_type":"client_credentials","scope":"gmarquis@hack42-suite.duckdns.org"}'

# 2. la salle : réponse 201 avec url, slug, access_level
curl -s https://meet.hack42-suite.duckdns.org/external-api/v1.0/rooms/ \
  -H "Authorization: Bearer <access_token>" -H 'Content-Type: application/json' -d '{}'
```

Aussi : `GET /external-api/v1.0/rooms/` et `GET /external-api/v1.0/rooms/{id}/`.
Pas d'enregistrement, pas de transcription, pas de résumé.

### 6.4 People

| Accès | Adresse | Identifiants |
|---|---|---|
| Application | https://people.hack42-suite.duckdns.org | votre compte |
| Admin Django | https://people.hack42-suite.duckdns.org/admin/ | `admin@hack42-suite.duckdns.org` / `2PbJxjOGBVow0nmNca3SC1KJ` |

- Une seule organisation : la DINUM (SIRET `13002526500013`). Toute l'équipe et les 1036 fiches y sont.
- Les fiches des 100 bots du Hub en font partie (`customFields.matrix` porte leur ancien identifiant Matrix de l'époque Tchap).
- **Contacts** : `GET /api/v1.0/contacts/?q=<texte>`, uniquement avec la session du navigateur
  connecté à People (cookie `people_sessionid`), pas avec un jeton Keycloak.
- **API serveur** (`/resource-server/v1.0/` : équipes, `scim/Me`) : elle attend un jeton avec le
  scope `groups`, qui n'existe pas dans notre realm → **non opérationnelle** en l'état. Elle n'expose
  pas les contacts de toute façon.
- People tourne en mode développement (pages d'erreur détaillées).

### 6.5 Matrix (Synapse et MAS)

| | Staging | Prod |
|---|---|---|
| Synapse (API client et admin) | https://matrix.hack42-staging.duckdns.org | https://matrix.hack42-hub.duckdns.org |
| Nom de serveur | `hack42-staging.duckdns.org` | `hack42-hub.duckdns.org` |
| MAS | https://mas.hack42-staging.duckdns.org | https://mas.hack42-hub.duckdns.org |
| **Jeton admin Synapse** (compte `@veilleur`) | `mct_xyRF8zfxmw2uPPXFubqyC7CEw8XR6p_L5QSJ4` | `mct_OLqS3xgA0ZGCpqlCNoHBheqOz22Hw9_0q8CCW` |

Le jeton `veilleur` sert aussi aux bots : **ne pas le révoquer**.

**API d'administration Synapse** (staging ici) :

```bash
S=https://matrix.hack42-staging.duckdns.org
T=mct_xyRF8zfxmw2uPPXFubqyC7CEw8XR6p_L5QSJ4
curl -s -H "Authorization: Bearer $T" "$S/_synapse/admin/v2/users?limit=20"                     # comptes
curl -s -H "Authorization: Bearer $T" "$S/_synapse/admin/v1/rooms?limit=20"                     # salons
curl -s -H "Authorization: Bearer $T" "$S/_synapse/admin/v2/users/@gmarquis:hack42-staging.duckdns.org"
curl -s -X POST -H "Authorization: Bearer $T" "$S/_synapse/admin/v1/join/<room_id>" \
  -d '{"user_id":"@gmarquis:hack42-staging.duckdns.org"}'                                        # faire entrer quelqu'un
```

**API client** : avec le jeton d'un utilisateur. Pas de connexion par mot de passe (MAS le refuse) :
- depuis le Hub connecté dans le navigateur : outils de développement → Application → stockage
  local, entrée qui contient `matrixOidc` → `accessToken` ;
- ou demander à Greg un jeton émis par MAS (`mas-cli manage issue-compatibility-token <login>`).

```bash
curl -s -H "Authorization: Bearer <jeton>" "$S/_matrix/client/v3/account/whoami"
curl -s -H "Authorization: Bearer <jeton>" "$S/_matrix/client/v3/joined_rooms"
curl -s -X PUT -H "Authorization: Bearer <jeton>" \
  "$S/_matrix/client/v3/rooms/<room_id>/send/m.room.message/$(date +%s%N)" \
  -d '{"msgtype":"m.text","body":"bonjour"}'
```

**MAS** : pas d'API d'administration ouverte. Création de comptes, jetons, verrouillage :
`mas-cli` sur la VM, par Greg.

### 6.6 Django des Hub

| | Staging | Prod |
|---|---|---|
| Admin | https://hack42-staging.duckdns.org/admin/ | https://hack42-hub.duckdns.org/admin/ |
| Identifiants | `admin@example.com` / `3H5weh9RZlo9QS6O3kUn` | `admin@example.com` / `xgeGP1g1PKtuWH4n6Ykw` |
| Config publique | https://hack42-staging.duckdns.org/api/v1.0/config/ | https://hack42-hub.duckdns.org/api/v1.0/config/ |

L'API `/api/v1.0/` (dont `users/?q=` pour la recherche) s'utilise avec la session du navigateur.

### 6.7 Les bots

- 100 agents fictifs par environnement, dans l'espace « Pole logiciels — DINUM » et ses salons.
- Leur parler : écrire leur prénom dans un salon, ou leur écrire en privé.
- Tableau de bord (réseau de la maison uniquement) : http://192.168.1.131:8099 (staging), http://192.168.1.130:8099 (prod).
- Code : dépôt privé `Gregory-Marquiset/hack42-bots`.

---

## 7. Les serveurs (pour info)

| Machine | IP | Contenu |
|---|---|---|
| VM 130 `hack-prod-01` | 192.168.1.130 | Hub prod, bots prod |
| VM 131 `hack-staging-01` | 192.168.1.131 | Hub staging, bots staging, People |
| VM 132 `hack-suite-01` | 192.168.1.132 | Keycloak commun, Docs, Meet, LiveKit |
| `caddy-01` | 192.168.1.105 | HTTPS de toutes les adresses |

- SSH depuis le réseau de la maison seulement : `ssh greg@<ip>`.
- Déploiement automatique toutes les 2 minutes (`main` → staging, tag → prod) : `journalctl -u hub-deploiement -f` sur la VM.
- La Suite : `cd ~/suite && docker compose ps` sur la VM 132 ; `./installer.sh` remet tout en place.
- People : `cd ~/people && docker compose ps` sur la VM 131 ; après un redémarrage de la VM :
  `docker compose up -d --pull never app-dev frontend-dev celery-dev celery-beat-dev nginx maildev dimail`.
- Secrets sur les VM : `~/suite/.env`, `~/suite/meet-applications.env`, `~/hack42-admins.txt` (132),
  `~/deploiement/suite.env`, `~/hub-comptes.txt`, `~/bots/etat/` (130 et 131).

## 8. À la fin du hackathon

- Supprimer ce fichier partout où il a été copié.
- Arrêter ou supprimer la VM 132, les bots, les applications Meet.
- Ou, si le projet continue : changer **tous** les mots de passe et secrets de ce document,
  refermer les consoles d'administration et l'auto-connexion des démos.
