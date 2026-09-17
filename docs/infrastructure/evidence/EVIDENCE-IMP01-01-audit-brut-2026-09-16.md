# EVIDENCE-IMP01-01 — Sorties brutes de l'audit MikroTik (MASQUÉES)

> **Implementation** : IMP-01 (étape 2/2)
> **Date de collecte** : 16 septembre 2026, ~14h49–15h05 (heure routeur = heure réelle, Africa/Porto-Novo, GMT+1)
> **Collecteur** : propriétaire (sur site, terminal WinBox, compte `admin`)
> **Équipement** : RB951Ui-2HnD — RouterOS 6.49.17 (stable) — LAN `192.168.88.254/24`
> **Masquage appliqué** : MAC clientes (`XX` sur les 3 derniers octets), noms d'utilisateurs hotspot (3 premières lettres + `***`), codes voucher (`vc-***`), octets finaux des IP clientes dans les journaux de vente. Aucun mot de passe, clé ou secret n'apparaissait dans les sorties reçues. Le routeur était en service normal (clients connectés) pendant l'audit.
> **Statut** : sorties reçues telles quelles ; les commandes en échec ou tronquées sont signalées `[ÉCHEC]` / `[TRONQUÉ]` et reprises dans l'addendum `GUIDE-01-ADDENDUM-R1.md`.

---

## SECTION A — Identité, version, ressources, horloge

### A1 — /system identity print

```
name: MikroTik
```

### A2 — /system resource print

```
                   uptime: 1w2d5h28m35s
                  version: 6.49.17 (stable)
               build-time: Aug/07/2024 11:47:14
         factory-software: 6.46.6
              free-memory: 90.7MiB
             total-memory: 128.0MiB
                      cpu: MIPS 74Kc V4.12
                cpu-count: 1
            cpu-frequency: 600MHz
                cpu-load: 10%
           free-hdd-space: 104.2MiB
          total-hdd-space: 128.0MiB
  write-sect-since-reboot: 44457
         write-sect-total: 45372
               bad-blocks: 0%
        architecture-name: mipsbe
               board-name: RB951Ui-2HnD
                 platform: MikroTik
```

### A3 — /system package print

```
Flags: X - disabled
 #   NAME                     VERSION
 0   routeros-mipsbe          6.49.17
 1   system                   6.49.17
 2 X ipv6                     6.49.17
 3   wireless                 6.49.17
 4   hotspot                  6.49.17
 5   mpls                     6.49.17
 6   routing                  6.49.17
 7   ppp                      6.49.17
 8   dhcp                     6.49.17
 9   security                 6.49.17
10   advanced-tools           6.49.17
```

> Absents de la liste : `user-manager`, `ntp` (paquet), `routerboard`… → pas de User Manager installé.

### A4 — /system clock print

```
                  time: 14:56:33
                  date: sep/16/2026
  time-zone-autodetect: yes
        time-zone-name: Africa/Porto-Novo
            gmt-offset: +01:00
            dst-active: no
```

> Heure réelle au moment de la collecte : ~14h56 le 16/09/2026 → **horloge correcte**.

### A5 — /system ntp client print

```
           enabled: no
     primary-ntp: 0.0.0.0
   secondary-ntp: 0.0.0.0
  server-dns-names:
              mode: broadcast
```

> **SNTP désactivé.** Combiné aux dates de fichiers en `jan/02/1970` (section G) → l'horloge repart de zéro après coupure d'alimentation (pas de RTC secourue).

---

## SECTION B — Interfaces et Wi-Fi

### B1 — /interface print

```
Flags: D - dynamic, X - disabled, R - running, S - slave
 #     NAME                                TYPE       ACTUAL-MTU L2MTU  MAX-L2MTU
 0  R  ether1                              ether            1500  1598       2028
 1  RS ether2                              ether            1500  1598       2028
 2  RS ether3                              ether            1500  1598       2028
 3   S ether4                              ether            1500  1598       2028
 4   S ether5                              ether            1500  1598       2028
 5   S wlan1                               wlan             1500  1600       2290
 6  R  DEOGRACIAS                          bridge           1500  1598
```

### B2 — /interface wireless print

```
 0    name="wlan1" mtu=1500 l2mtu=1600 mac-address=F4:1E:57:63:26:A3 arp=enabled
      interface-type=Atheros AR9300 mode=ap-bridge
      ssid="DEOGRACIAS WIFI ZONE C" frequency=2412 band=2ghz-b/g/n
      channel-width=20/40mhz-XX secondary-frequency="" scan-list=default
      wireless-protocol=any vlan-mode=no-tag vlan-id=1 wds-mode=disabled
      wds-default-bridge=none wds-ignore-ssid=no bridge-mode=enabled
      default-authentication=yes default-forwarding=yes default-ap-tx-limit=0
      default-client-tx-limit=0 hide-ssid=no security-profile=default
      compression=no
```

### B2b — /interface wireless security-profiles print

```
 0 * name="default" mode=none authentication-types="" unicast-ciphers=aes-ccm
     group-ciphers=aes-ccm wpa-pre-shared-key="" wpa2-pre-shared-key=""
     supplicant-identity="MikroTik" eap-methods=passthrough
     ... (autres champs par défaut) ...
     radius-mac-authentication=no radius-mac-accounting=no
     group-key-update=5m management-protection=disabled
```

> Wi-Fi **ouvert** (`mode=none`) — normal pour un hotspot à portail captif. Aucune clé à masquer.

---

## SECTION C — Adressage, routage, DNS, DHCP, pools

### C1 — /ip address print

```
Flags: X - disabled, I - invalid, D - dynamic
 #   ADDRESS            NETWORK         INTERFACE
 0   192.168.88.254/24  192.168.88.0    DEOGRACIAS
 1 D 192.168.100.7/24   192.168.100.0   ether1
```

> **WAN dynamique** (flag `D`) → adresse attribuée par DHCP client depuis la box opérateur (192.168.100.1). À confirmer en R1.

### C2 — /ip route print

```
 0 ADS  0.0.0.0/0                          192.168.100.1             1
 1 ADC  192.168.88.0/24    192.168.88.254  DEOGRACIAS                0
 2 ADC  192.168.100.0/24   192.168.100.7   ether1                    0
```

### C3 — /ip dns print

```
                      servers: 8.8.8.8,8.8.4.4
              dynamic-servers: 192.168.100.1
        allow-remote-requests: no
                   cache-size: 2048KiB
                   cache-used: 288KiB
  (autres champs par défaut)
```

### C4 — /ip pool print

```
 # NAME                                           RANGES
 0 dhcp_pool0                                     192.168.88.1-192.168.88.253
```

### C5 — /ip dhcp-server print

```
 0    dhcp1     DEOGRACIAS                    dhcp_pool0       1d10m      yes
```

### C5b — /ip dhcp-server lease print (20 baux dynamiques, extraits masqués)

```
 0 D 192.168.88.3    56:C0:2B:XX:XX:XX  bound   50m2s
 1 D 192.168.88.58   92:49:B1:XX:XX:XX  bound   15h19m7s
 2 D 192.168.88.63   7E:27:58:XX:XX:XX  bound   3h37m19s
 ... (20 baux dynamiques au total, aucun bail statique) ...
```

---

## SECTION D — HotSpot

### D1 — /ip hotspot print detail

```
 0   name="hotspot1" interface=DEOGRACIAS address-pool=dhcp_pool0 profile=hsprof1
     idle-timeout=5m keepalive-timeout=none login-timeout=none
     addresses-per-mac=1 ip-of-dns-name=192.168.88.254 proxy-status="running"
```

### D2 — /ip hotspot profile print detail

```
 0 * name="default" hotspot-address=0.0.0.0 dns-name="" html-directory=hotspot
     html-directory-override="" rate-limit="" http-proxy=0.0.0.0:0
     smtp-server=0.0.0.0 login-by=cookie,http-chap http-cookie-lifetime=3d
     split-user-domain=no use-radius=no

 1   name="hsprof1" hotspot-address=192.168.88.254 dns-name="deogracias.bj"
     html-directory=hotspot DEOGRACIAS html-directory-override="" rate-limit=""
     http-proxy=0.0.0.0:0 smtp-server=0.0.0.0
     login-by=cookie,http-chap,http-pap,mac-cookie http-cookie-lifetime=3d
     split-user-domain=no use-radius=yes radius-accounting=yes
     radius-interim-update=received nas-port-type=wireless-802.11
     radius-default-domain="" radius-location-id="" radius-location-name=""
     radius-mac-format=XX:XX:XX:XX:XX:XX
```

> ⚠️ **ANOMALIE D'AFFICHAGE** : `html-directory=hotspot DEOGRACIAS` — la valeur réelle est probablement `hotspot` (seul dossier présent en G1) avec un artefact de copie/retour à la ligne. À re-vérifier en R1 (commande R1.3).
> ⚠️ `use-radius=yes` + `radius-accounting=yes` sur hsprof1 alors que `/radius` est VIDE (section I) → configuration résiduelle sans effet.

### D3 — Walled garden

```
/ip hotspot walled-garden print     → AUCUNE entrée (en-tête seul)
/ip hotspot walled-garden ip print  → AUCUNE entrée (en-tête seul)
```

### D4 — /ip hotspot active print detail (masqué)

```
 0    ;;; sep/17/2026 09:09:49
      server=hotspot1 user="hna***" address=192.168.88.183
      mac-address=8E:55:AC:XX:XX:XX login-by="mac-cookie" uptime=4h11m6s
      session-time-left=30m48s keepalive-timeout=2m

 1    ;;; vc-***-**-**.**.**-
      server=hotspot1 user="rdk***" address=192.168.88.194
      mac-address=46:36:E2:XX:XX:XX login-by="http-chap" uptime=4h4m17s
      session-time-left=55m43s keepalive-timeout=2m

 2    ;;; sep/17/2026 11:11:21
      server=hotspot1 user="tiz***" address=192.168.88.196
      mac-address=F6:B6:63:XX:XX:XX login-by="mac-cookie" uptime=17m52s
      session-time-left=2h37m32s keepalive-timeout=2m

 3    ;;; vc-***-**-**.**.**-
      server=hotspot1 user="esp***" address=192.168.88.226
      mac-address=56:F0:22:XX:XX:XX login-by="http-chap" uptime=14m23s
      session-time-left=4h45m37s keepalive-timeout=2m

 4    ;;; vc-***-**-**.**.**-
      [sortie interrompue ici par la copie — au moins 5 sessions actives]
```

> Les commentaires `;;;` des sessions montrent les DEUX états du commentaire utilisateur :
> code voucher Mikmon avant premier login (`vc-***`), date d'expiration calculée après login (`sep/17/2026 09:09:49`).
> Sommes uptime + session-time-left : sess.1 = **5h00m00s pile**, sess.3 = **5h00m00s pile**, sess.0 = 4h41m54s, sess.2 = 2h55m24s.

### D5 — Hosts

```
/ip hotspot host print count-only → 10
/ip hotspot host print limit=10   → [ÉCHEC] "expected end of command (line 1 column 24)"
```

### D6 — /ip hotspot ip-binding print

```
Flags: X - disabled, P - bypassed, B - blocked
 #   MAC-ADDRESS       ADDRESS                         TO-ADDRESS      SERVER
 0 P 80:AF:CA:XX:XX:XX 192.168.88.200                  192.168.88.200  hotspot1
```

> **1 binding bypassé** : la machine `192.168.88.200` est exemptée d'authentification en permanence. Propriétaire à identifier (question humaine, R1.12).

---

## SECTION E — Profils utilisateurs (P2 + P4)

### E1 — /ip hotspot user profile print detail [TRONQUÉ]

```
 0 * name="default" idle-timeout=none keepalive-timeout=2m status-autorefresh=1m
     shared-users=1 add-mac-cookie=yes mac-cookie-timeout=3d address-list=""
     transparent-proxy=no

 1   name="5-HEURES" address-pool=dhcp_pool0 idle-timeout=none
     keepalive-timeout=2m status-autorefresh=1m shared-users=1
     add-mac-cookie=yes mac-cookie-timeout=3d parent-queue=none address-list=""
     on-login=:put (",remc,100,24h,100,,Disable,"); {:local comment [ /ip
         hotspot user get [/ip hotspot user find where name="$user"] comment];
         :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up"
         or $comment = "") do={ :local date [ /system clock get date ];:local
         year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ]; /sys sch
         add name="$user" disable=no start-date=$date interval="24h"; :delay 5s;
         :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-
         run]; :local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic
         $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp
         ("$d$s$year $t"); /ip hotspot user set comment="$exp" [find where
         name="$user"];}; :if ($getxp = 8) do={ /ip hotspot user set
         comment="$date $exp" [find where name="$user"];}; :if ($getxp > 15)
         do={ /ip hotspot user set comment="$exp" [find where
         name="$user"];};:delay 5s; /sys sch remove [find where name="$user"];
         [TRONQUÉ — la suite (log de vente /system script add … comment="mikhmon")
          est visible dans la sortie E2 du profil 1-MOIS, identique au prix/validité près]
```

> **La liste des autres profils (12-HEURES, 24-HEURES, 72-HEURES, 1-SEMAINE, Admin-free, 1-HEURES…) n'a pas pu être collée** (sortie trop longue). Les champs `session-timeout` et `rate-limit` de chaque profil ne sont pas visibles dans la copie reçue → **objet de la relance R1.1/R1.2**.

### E2 — /ip hotspot user profile print where name~"MOIS" (P2)

```
 0   name="1-MOIS" address-pool=dhcp_pool0 idle-timeout=none keepalive-timeout=2>[TRONQUÉ: 2m]
     status-autorefresh=1m shared-users=1 add-mac-cookie=yes
     mac-cookie-timeout=3d parent-queue=none address-list=""
     on-login=:put (",remc,4000,40d,4000,,Disable,"); {:local comment [ /ip
         hotspot user get [/ip hotspot user find where name="$user"] comment];
         :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up"
         or $comment = "") do={ :local date [ /system clock get date ];:local
         year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ]; /sys sch
         add name="$user" disable=no start-date=$date interval="40d"; :delay 5s;
         :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-
         run]; :local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic
         $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp
         ("$d$s$year $t"); /ip hotspot user set comment="$exp" [find where
         name="$user"];}; :if ($getxp = 8) do={ /ip hotspot user set
         comment="$date $exp" [find where name="$user"];}; :if ($getxp > 15)
         do={ /ip hotspot user set comment="$exp" [find where
         name="$user"];};:delay 5s; /sys sch remove [find where name="$user"];
         :local mac $"mac-address"; :local time [/system clock get time ];
         /system script add name="$date-|-$time-|-$user-|-4000-|-$address-|-$mac-
         |-40d-|-1-MOIS-|-1-MOIS-|-$comment" owner="$month$year" source="$date"
         comment="mikhmon"}}
```

> **P2 CLOS** : le profil 4 000 F s'appelle **`1-MOIS`** ; validité **40 jours** (interval=40d), prix **4000** (ligne `remc`) — conforme Grille A.
> Le script On-Login est **inline dans chaque profil** (pas dans `/system script`) : c'est pourquoi H2 (`where name~"login"`) n'a rien trouvé.

---

## SECTION F — Utilisateurs HotSpot (tickets)

### F1 — Volumes

```
/ip hotspot user print count-only                    → 4155
/ip hotspot user print count-only where disabled=yes → 0
```

### F2 — Répartition par profil

```
profile="1-HEURES"  → 0
profile="5-HEURES"  → 2311
profile="12-HEURES" → 299
profile="24-HEURES" → 503
profile="72-HEURES" → 622
profile="1-SEMAINE" → 164
profile="1-MOIS"    → 198
                      -----
Sous-total connu    → 4097   (reste 58 utilisateurs sur d'autres profils : Admin-free / default / autre)
```

### F3 — Échantillons

```
/ip hotspot user print detail limit=10 → [ÉCHEC] "expected end of command (line 1 column 31)"
/ip hotspot user print detail where comment~"mikhmon" limit=5 → aucune ligne (en-tête seul)
   → les UTILISATEURS hotspot ne portent pas le commentaire "mikhmon" ; ce commentaire
     marque les ENTRÉES DE /system script (journal des ventes), pas les users.
```

### F4 — limit-uptime

```
/ip hotspot user print where limit-uptime!="0s" limit=10 → aucune ligne (en-tête seul)
   → AUCUN utilisateur n'a de limit-uptime. L'expiration ne passe PAS par limit-uptime.
```

---

## SECTION G — Fichiers (P5)

### G1/G2 — /file print (et filtre ~"hotspot", résultat identique)

```
 # NAME                    TYPE                         SIZE CREATION-TIME
 0 hotspot                 directory                         jan/02/1970 01:16:46
 1 hotspot/alogin.html     .html file                   1094 jan/02/1970 01:16:46
 2 hotspot/api.json        .json file                    311 jan/02/1970 01:16:46
 3 hotspot/css             directory                         jan/02/1970 01:16:46
 4 hotspot/css/style.css   .css file                    4053 jan/02/1970 01:16:46
 5 hotspot/error.html      .html file                    640 jan/02/1970 01:16:46
 6 hotspot/errors.txt      .txt file                    3719 jan/02/1970 01:16:46
 7 hotspot/favicon.ico     .ico file                     903 jan/02/1970 01:16:46
 8 hotspot/img             directory                         jan/02/1970 01:16:46
 9 hotspot/img/password... .svg file                     644 jan/02/1970 01:16:46
10 hotspot/img/user.svg    .svg file                     444 jan/02/1970 01:16:46
11 hotspot/login.html      .html file                   4423 jan/02/1970 01:16:46
12 hotspot/logout.html     .html file                   1459 jan/02/1970 01:16:46
13 hotspot/md5.js          .js file                     7.0KiB jan/02/1970 01:16:46
14 hotspot/radvert.html    .html file                   1204 jan/02/1970 01:16:46
15 hotspot/redirect.html   .html file                    330 jan/02/1970 01:16:46
16 hotspot/rlogin.html     .html file                    877 jan/02/1970 01:16:46
17 hotspot/status.html     .html file                   2855 jan/02/1970 01:16:46
18 hotspot/xml             directory                         jan/02/1970 01:16:46
19 hotspot/xml/WISPAcce... .xsd file                    4251 jan/02/1970 01:16:46
20 hotspot/xml/alogin.html .html file                    839 jan/02/1970 01:16:46
```

> **P5 (localisation) CLOS** : portail dans `/hotspot` — structure MikroTik standard avec personnalisation légère (style.css 4 Ko, icônes SVG, api.json). Dates `jan/02/1970` = horloge non secourue au boot (voir A5/N2).
> **Contenu des fichiers NON récupéré** (étape G3 non faite) → relance R1.9 (glisser-déposer WinBox).

### G4 — Scripts/schedulers de boot

```
/system script print where owner="system"        → aucune ligne
/system scheduler print where start-date=jan/01/1970 → aucune ligne
```

> Aucun script de démarrage automatique détecté par ces deux filtres.

---

## SECTION H — Mécanisme d'expiration

### H1/H2 — /system script print (et print detail, résultat identique — 3 entrées collées) [TRONQUÉ ?]

```
Flags: I - invalid
 0   ;;; mikhmon
     name="sep/22/2025-|-14:13:49-|-rxi***-|-100-|-192.168.88.253-|-
     26:A4:47:XX:XX:XX-|-24h-|-5-HEURES-|-vc-***-**-**.**.**-"
     owner="sep2025"
     policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon
     dont-require-permissions=no run-count=0 source=sep/22/2025

 1   ;;; mikhmon
     name="sep/22/2025-|-17:16:06-|-rne***-|-200-|-192.168.88.251-|-
     BA:79:03:XX:XX:XX-|-24h-|-12-HEURES-|-vc-***-**-**.**.**-"
     owner="sep2025" run-count=0 source=sep/22/2025

 2   ;;; mikhmon
     name="sep/22/2025-|-17:19:06-|-frf***-|-100-|-192.168.88.250-|-
     0E:F2:A7:XX:XX:XX-|-24h-|-5-HEURES-|-vc-***-**-**.**.**-"
     owner="sep2025" run-count=0 source=sep/22/2025
```

> **Journal des ventes Mikmon** : chaque premier login crée une entrée `/system script` dont le NOM est l'enregistrement de vente :
> `date-|-heure-|-utilisateur-|-prix-|-ip-|-mac-|-validité-|-profil-|-code_voucher_original`
> `comment="mikhmon"`, `owner=<mois><année>`, `source=<date>`, jamais exécutée (`run-count=0`).
> Les 3 entrées collées datent de sep/2025 ; le nombre TOTAL d'entrées est inconnu (copie tronquée ?) → relance R1.5 (count-only).
> `/system script print detail where name~"login"` → aucune ligne : le On-Login n'est PAS un script nommé, il est **inline dans les profils** (voir E1/E2).

### H3 — /system script environment print

```
(vider — aucune variable)
```

### H4 — Schedulers

```
/system scheduler print count-only → 7
/system scheduler print detail limit=30 → [ÉCHEC] "expected end of command (line 1 column 32)"
```

> **7 schedulers présents, contenu inconnu** → relance R1.4. Le On-Login crée puis supprime un scheduler temporaire par premier login (`/sys sch add … ; /sys sch remove`) : les 7 restants ne viennent a priori PAS de ce mécanisme (sauf logins en cours au moment exact de la commande).

### H5 — Cas réel

```
/ip hotspot user print detail where name="LE_NOM_VU_EN_D4" → aucune ligne
   [le placeholder du guide n'a pas été remplacé par un nom réel — sans conséquence,
    les données de session D4 + commentaires suffisent ; reprise en R1.6/R1.11]
```

---

## SECTION I — RADIUS (P1)

### I1 — /radius print detail

```
Flags: X - disabled
(aucune entrée)
```

### I2 — /user aaa print

```
      use-radius: no
       accounting: yes
   interim-update: 0s
    default-group: read
    exclude-groups:
```

> **P1 CLOS** : aucun serveur RADIUS configuré (`/radius` vide), AAA local (`use-radius: no`). Le `use-radius=yes` du profil hotspot `hsprof1` est une **configuration résiduelle sans effet** (RouterOS retombe sur l'authentification locale faute de serveur déclaré). Aucun paquet `user-manager` installé (A3).

---

## SECTION J — Comptes, groupes, services

### J1 — /user print

```
Flags: E - expired, X - disabled
 #    NAME              GROUP             ADDRESS            LAST-LOGGED-IN
 0    ;;; system default user
      admin             full                               sep/16/2026 14:49:40
```

> **Un seul compte : `admin` (groupe full)**. Aucun compte technique, aucun compte invité.

### J2 — /user group print detail

```
 0 name="read"  policy=local,telnet,ssh,reboot,read,test,winbox,password,web,sniff,
      sensitive,api,romon,tikapp,!ftp,!write,!policy,!dude   skin=default
 1 name="write" policy=local,telnet,ssh,reboot,read,write,test,winbox,password,web,
      sniff,sensitive,api,romon,tikapp,!ftp,!policy,!dude    skin=default
 2 name="full"  policy=local,telnet,ssh,ftp,reboot,read,write,policy,test,winbox,
      password,web,sniff,sensitive,api,romon,tikapp,!dude    skin=default
```

### J3 — /user active print

```
 0    sep/16/2026 14:52:02 admin   192.168.88.240
 1    sep/16/2026 14:52:05 admin   192.168.88.240
 2    sep/16/2026 14:52:06 admin   192.168.88.240
 3    sep/16/2026 14:55:42 admin   192.168.88.240
```

> 4 sessions admin simultanées depuis le même poste (192.168.88.240 = poste de l'audit).

### J4 — /ip service print

```
Flags: X - disabled, I - invalid
 #   NAME      PORT ADDRESS                                       CERTIFICATE
 0   telnet      23
 1   ftp         21
 2   www         80
 3   ssh         22
 4 XI www-ssl    443                                              none
 5   api       8728
 6   winbox    8291
 7   api-ssl   8729                                               none
```

> **telnet, ftp, www, ssh, api, winbox, api-ssl : TOUS activés, SANS restriction d'adresse** (`address` vide = toutes interfaces, y compris WAN 192.168.100.7 en double NAT). Seul www-ssl est désactivé (et invalide, sans certificat). Cible principale d'IMP-03.

### J5 — /system logging print

```
 0  * info      memory
 1  * error     memory
 2  * warning   memory
 3  * critical  echo
 4    hotspot   disk   →  (info, debug)
```

> Le topic `hotspot` en **info+debug vers le disque** : usure flash à surveiller (128 Mo, `write-sect-since-reboot: 44457` en 9 jours).

---

## SECTION K — Pare-feu

### K1 — /ip firewall mangle print detail

```
 0    chain=postrouting action=change-ttl new-ttl=set:1 passthrough=no
      out-interface=DEOGRACIAS log=no log-prefix=""
```

> **CONFORME doc 07 §34** — règle change-ttl intacte, unique règle mangle.

### K2 — /ip firewall nat print (10 règles, toutes dynamiques `D`)

```
 0  D chain=dstnat action=jump jump-target=hotspot hotspot=from-client
 1  D chain=hotspot action=jump jump-target=pre-hotspot
 2  D chain=hotspot action=redirect to-ports=64872 protocol=udp dst-port=53
 3  D chain=hotspot action=redirect to-ports=64872 protocol=tcp dst-port=53
 4  D chain=hotspot action=redirect to-ports=64873 protocol=tcp hotspot=local-dst dst-port=80
 5  D chain=hotspot action=redirect to-ports=64875 protocol=tcp hotspot=local-dst dst-port=443
 6  D chain=hotspot action=jump jump-target=hs-unauth protocol=tcp hotspot=!auth
 7  D chain=hotspot action=jump jump-target=hs-auth protocol=tcp hotspot=auth
 8  D chain=hs-unauth action=redirect to-ports=64874 protocol=tcp dst-port=80
 9  D chain=hs-unauth action=redirect to-ports=64874 protocol=tcp dst-port=3128
```

### K3 — /ip firewall filter print (10 règles, toutes dynamiques `D`)

```
 0  D chain=forward action=jump jump-target=hs-unauth hotspot=from-client,!auth
 1  D chain=forward action=jump jump-target=hs-unauth-to hotspot=to-client,!auth
 2  D chain=input action=jump jump-target=hs-input hotspot=from-client
 3  D chain=input action=drop protocol=tcp hotspot=!from-client dst-port=64872-64875
 4  D chain=hs-input action=jump jump-target=pre-hs-input
 5  D chain=hs-input action=accept protocol=udp dst-port=64872
 6  D chain=hs-input action=accept protocol=tcp dst-port=64872-64875
 7  D chain=hs-input action=jump jump-target=hs-unauth hotspot=!auth
 8  D chain=hs-unauth action=reject reject-with=tcp-reset protocol=tcp
 9  D chain=hs-unauth action=reject reject-with=icmp-net-prohibited
```

> Aucune règle statique personnalisée visible dans NAT/filter : uniquement l'outillage hotspot standard. **CONFORME doc 07 §33.**

---

## SECTION L — Divers

```
/queue simple print count-only → 1
/queue simple print limit=10   → [ÉCHEC] "expected end of command (line 1 column 21)"
/queue tree print              → aucune ligne
/ip arp print count-only       → 93
```

> **1 queue simple inconnue** → relance R1.7.

---

## RÉCAPITULATIF DES COMMANDES EN ÉCHEC / TRONQUÉES

| Réf. | Commande | Problème | Reprise |
|---|---|---|---|
| D5 | `/ip hotspot host print limit=10` | syntaxe `limit` refusée après `print` simple | R1.10 |
| E1 | `/ip hotspot user profile print detail` | sortie trop longue, profils 2..n non collés ; `session-timeout`/`rate-limit` non visibles | R1.1 + R1.2 |
| E2 | idem (1-MOIS) | `keepalive-timeout=2>` coupé | R1.2 |
| F3 | `/ip hotspot user print detail limit=10` | syntaxe refusée | R1.11 |
| H1 | `/system script print` | 3 entrées collées, total inconnu | R1.5 |
| H4 | `/system scheduler print detail limit=30` | syntaxe refusée ; 7 schedulers non vus | R1.4 |
| H5 | placeholder non remplacé | — | R1.6 |
| G3 | téléchargement WinBox des HTML | non effectué | R1.9 |
| L1 | `/queue simple print limit=10` | syntaxe refusée | R1.7 |

> Note syntaxe RouterOS 6.49 : `print limit=N` fonctionne **uniquement combiné à `where`** (`print detail where … limit=5` a fonctionné). Les commandes de R1 en tiennent compte.
