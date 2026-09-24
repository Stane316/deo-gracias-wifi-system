/**
 * IMP-22 — Fixtures SYNTHÉTIQUES read-only (formats réels EVIDENCE-IMP01 §D4/§E2,
 * valeurs dé-masquées inventées) : sessions actives et journal Mikhmon.
 *
 * Cohérences volontaires : cli001 (5-HEURES) : 4h11m6s + 48m54s = 5h pile ;
 * cli002 (24-HEURES) : 4h4m17s + 19h55m43s = 24h pile mais comment encore
 * `vc-…` => anomalie `session_vc_active` (conversion On-Login ratée, §4.4).
 */

export const HOTSPOT_ACTIVE_FIXTURE = `Flags: 
 0    ;;; sep/17/2026 09:09:49
      server=hotspot1 user="cli001" address=192.168.88.183
      mac-address=8E:55:AC:00:00:01 login-by="mac-cookie" uptime=4h11m6s
      session-time-left=48m54s keepalive-timeout=2m

 1    ;;; vc-002-09.16.26-
      server=hotspot1 user="cli002" address=192.168.88.194
      mac-address=46:36:E2:00:00:02 login-by="http-chap" uptime=4h4m17s
      session-time-left=19h55m43s keepalive-timeout=2m

 2    ;;; sep/17/2026 11:11:21
      server=hotspot1 user="tiz003" address=192.168.88.196
      mac-address=F6:B6:63:00:00:03 login-by="mac-cookie" uptime=17m52s
      session-time-left=2h37m32s keepalive-timeout=2m
`;

export const MIKHMON_JOURNAL_FIXTURE = `Flags: 
 0   name="sep/16/2026-|-09:02:11-|-cli001-|-100-|-192.168.88.183-|-8E:55:AC:00:00:01-|-24h-|-5-HEURES-|-5-HEURES-|-vc-001-09.16.26-" owner="sep2026" source="sep/16/2026" comment="mikhmon"
 1   name="sep/16/2026-|-10:15:40-|-cli002-|-300-|-192.168.88.194-|-46:36:E2:00:00:02-|-48h-|-24-HEURES-|-24-HEURES-|-vc-002-09.16.26-" owner="sep2026" source="sep/16/2026" comment="mikhmon"
 2   name="2026-09-15-|-08:00:00-|-old001-|-50-|-192.168.88.200-|-AA:BB:CC:00:00:04-|-1h-|-1-HEURE-|-1-HEURE-|-" owner="sep2026" source="2026-09-15" comment="mikhmon"
`;
