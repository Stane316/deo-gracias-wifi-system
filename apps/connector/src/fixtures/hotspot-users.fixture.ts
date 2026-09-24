/**
 * IMP-21 — Fixture SYNTHÉTIQUE de capture `/ip hotspot user` (RouterOS 6.49).
 *
 * Les captures réelles du 16/09 sont masquées (EVIDENCE-IMP01 §masquage) et ne
 * peuvent donc pas servir de fixture ; celle-ci reproduit fidèlement les deux
 * formats observés sur le RB951 (`print` tabulaire et `print detail`) :
 * - users legacy Mikmon (comment `vc-<seq>-<mm.dd.yy>-`, contrat §3) ;
 * - users `Admin-free` hors Grille A (contrat §5) ;
 * - un user désactivé (drapeau X) et un user au comment vide (anomalie §4.4).
 */
import { parseHotspotUsers, type HotspotUserRecord } from '../hotspot-parser.js';

export const HOTSPOT_USERS_TABULAR_FIXTURE = `Flags: X - disabled 
 #   NAME             PROFILE        UPTIME       BYTES-IN    BYTES-OUT    COMMENT        
 0   cli001           5-HEURES       00:12:33     1048576     524288       vc-001-09.16.26-
 1   cli002           24-HEURES      1d01:00:00   2097152     1048576      vc-002-09.16.26-
 2 X cli003           72-HEURES      00:00:00     0           0            vc-003-09.16.26-
 3   admin-free-1     Admin-free     12d00:00:00  1024        2048                        
 4   cli004           1-MOIS         5d05:20:11   8388608     4194304      vc-004-09.15.26-
`;

export const HOTSPOT_USERS_DETAIL_FIXTURE = `Flags: X - disabled 
 0    name="cli001" profile="5-HEURES" limit-uptime="05:00:00" comment="vc-001-09.16.26-"
      disabled=no uptime=12m33s bytes-in=1048576 bytes-out=524288
 1    name="cli002" profile="24-HEURES" limit-uptime="1d" comment="vc-002-09.16.26-"
      disabled=no uptime=1d1h bytes-in=2097152 bytes-out=1048576
 2 X  name="cli003" profile="72-HEURES" limit-uptime="3d" comment="vc-003-09.16.26-"
      disabled=yes
 3    name="admin-free-1" profile="Admin-free" disabled=no
 4    name="cli004" profile="1-MOIS" limit-uptime="40d" comment="vc-004-09.15.26-"
      disabled=no
`;

/** Inventaire legacy de départ pour le DryRunConnector (5 users). */
export function seedLegacyInventory(): HotspotUserRecord[] {
  return parseHotspotUsers(HOTSPOT_USERS_TABULAR_FIXTURE);
}
