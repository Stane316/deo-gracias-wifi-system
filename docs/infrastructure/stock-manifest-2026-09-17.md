# MANIFESTE DU STOCK DIGITAL — génération du 17/09/2026 (IMP-06)

> **Génération** : Mikhmon Windows, sur site, par le propriétaire, selon GUIDE-06 et le contrat Mikmon (`docs/infrastructure/mikhmon-contract.md`).
> **Statut déclaré par le propriétaire** : « guide suivi scrupuleusement, tickets générés, dump généré et stocké, tout est ok ». Les compteurs bruts et lignes de conformité n'ont pas été recopiés dans ce manifeste (niveau « validé par propriétaire ») ; la vérification technique exhaustive sera faite par la réconciliation Connector (IMP-24) : total routeur attendu ≈ 4 815 users (4 155 + 660), moins expirations naturelles des anciens.

## 1. Batches générés (660 tickets)

| Batch | Profil | Quantité | limit-uptime contractuel | Validité contractuelle | Support reçu |
|---|---|---|---|---|---|
| B1 | 5-HEURES | 300 | 05:00:00 | 24 h | PDF lot digital |
| B2 | 12-HEURES | 60 | 12:00:00 | 24 h | PDF lot digital |
| B3 | 24-HEURES | 100 | 1d00:00:00 | 48 h | PDF lot digital |
| B4 | 72-HEURES | 120 | 3d00:00:00 | 5 j | PDF lot digital |
| B5 | 1-SEMAINE | 40 | 7d00:00:00 | 10 j | PDF lot digital |
| B6 | 1-MOIS | 40 | 40d00:00:00 | 40 j | PDF lot digital |

Comments de génération : `vc-<n>-09.17.26-` (conforme contrat ; séquence Mikhmon propre).

## 2. Empreintes des supports (les supports eux-mêmes = SECRETS, hors dépôt)

| Fichier (coffre propriétaire : PC + USB + cloud chiffré) | SHA256 | Taille |
|---|---|---|
| Voucher-DEOGRACIAS-5-HEURES-lot digital.pdf | 2c62a8285ae8491541406e2b6d0c6d27781f8333587b7e3b96e437bb0e22f9c1 | 863 281 o |
| Voucher-DEOGRACIAS-12-HEURES-lot digital.pdf | 01a2c12ebc6acd2bc5d41f93c0bac453a8afb6fabe6c8328dc4ae599fe3c1e89 | 198 611 o |
| Voucher-DEOGRACIAS-24-HEURES-lot digital.pdf | 157bfc82e05fe56a34aea6a3ca9cead2dce72bcde524ff9ec573fae9a8589fde | 309 200 o |
| Voucher-DEOGRACIAS-72-HEURES-lot digital.pdf | 18fb11a7c2e6a81bf05f42e6aae6a6b302198afca3ef0c38047a18447a8f6b45 | 364 189 o |
| Voucher-DEOGRACIAS-1-SEMAINE-lot digital.pdf | e6f6727cb80b7b3c09f7c2236b656cf698d416c4a6d3f2734b5d609eb66c3e5d | 143 503 o |
| Voucher-DEOGRACIAS-1-MOIS-lot digital.pdf | 637c13cff788e65f348035e70e78d972b68bb448480b13361879ef573cf61e3d | 143 516 o |
| dg-stock-2026-09-17.txt (dump complet, codes inclus) | empreinte détenue par le propriétaire dans CHECKSUMS.txt | ~4 815 lignes |

## 3. Règles de conservation

- PDFs + dump = **coffre** (PC + USB + cloud zip protégé). Jamais dans le dépôt, jamais en clair au chat.
- L'import backend (IMP-18) se fera depuis le dump du coffre, via un canal propre (saisie/opération contrôlée), jamais depuis l'historique de conversation.
- Les tickets neufs n'expirent pas avant activation (moniteurs ignorants les comments `vc-`) : le stock peut dormir sans perte.

## 4. INCIDENT INC-04 — codes du stock digital transités par le chat

- Fait : les 6 PDFs joints contiennent les 660 codes ; ils ont transité par l'historique de conversation.
- Cadre appliqué : précédent D2 (INC-03) — codes utilisables uniquement sur le Wi-Fi du site ; historique privé → **risque assumé**.
- Option de rotation (tant que le propriétaire est sur site) : `/ip hotspot user remove [find where comment~"09.17.26"]` puis régénération GUIDE-06 (~45 min) — à demander explicitement si le propriétaire juge l'historique exposé.
- Garde-fou permanent : réconciliation IMP-24 (activations anormales, multi-activations d'un même code).
