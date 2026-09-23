#!/usr/bin/env python3
# IMP-16 — Générateur de la migration 0010_seed_stock_mikmon.sql.
#
# WHY : le stock digital Mikmon du 17/09/2026 (660 tickets, manifeste IMP-06) doit
# entrer en base UNIQUEMENT sous forme d'empreintes sha256(code) — jamais de code en
# clair (leçons INC-01/INC-04, migration 0004). Les codes vivent dans les 6 PDFs du
# coffre propriétaire (hors dépôt) ; ce script les lit, les hache, et émet une
# migration SQL ne contenant QUE des empreintes hexadécimales de 64 caractères.
#
# USAGE (machine disposant des PDFs du coffre — JAMAIS dans la sandbox de l'agent,
# JAMAIS dans le dépôt) :
#   python3 tools/gen-seed-stock-0010.py /chemin/vers/dossier-pdf
#   → réécrit supabase/migrations/0010_seed_stock_mikmon.sql (déterministe :
#     mêmes PDFs => même fichier, à l'horodatage d'en-tête près).
#
# VALIDATIONS EXÉCUTÉES (échec = arrêt, rien n'est écrit) :
#   - sha256 de chaque PDF == empreinte du manifeste IMP-06 §2 (intégrité coffre) ;
#   - compte par lot == manifeste §1 (300/60/100/120/40/40 = 660) ;
#   - chaque code : [a-z0-9]{8}, séquence [n] continue 1..N, aucun doublon
#     intra-lot ni inter-lots ;
#   - ligne profil du voucher conforme à la Grille A (validité/uptime/prix attendus).
#
# SÉCURITÉ : aucun code en clair n'est écrit, affiché, ni logué par ce script ;
# seules les empreintes sha256 (irréversibles) entrent dans le fichier généré.
import hashlib
import json
import re
import sys
import uuid
from pathlib import Path

# Identifiants de lots STABLES (décidés une fois, générés au premier run le
# 23/09/2026) : les batches ont des UUID fixes pour que la migration soit
# idempotente (ON CONFLICT (id) DO NOTHING — tools/db-migrate.sh ré-applique tout).
BATCHES = [
    # (notes-tag,         offer_id,    quantité, sha256 du PDF du manifeste §2,                    uuid fixe du batch)
    ("mikmon-2026-09-17-B1", "5-HEURES",  300, "2c62a8285ae8491541406e2b6d0c6d27781f8333587b7e3b96e437bb0e22f9c1", "b1a5e9c2-4d7f-4e38-9a16-7f2d8c4b0e51"),
    ("mikmon-2026-09-17-B2", "12-HEURES",  60, "01a2c12ebc6acd2bc5d41f93c0bac453a8afb6fabe6c8328dc4ae599fe3c1e89", "c2b6f0d3-5e80-4f49-ab27-803e9d5c1f62"),
    ("mikmon-2026-09-17-B3", "24-HEURES", 100, "157bfc82e05fe56a34aea6a3ca9cead2dce72bcde524ff9ec573fae9a8589fde", "d3c7a1e4-6f91-405a-bc38-914fae6d2a73"),
    ("mikmon-2026-09-17-B4", "72-HEURES", 120, "18fb11a7c2e6a81bf05f42e6aae6a6b302198afca3ef0c38047a18447a8f6b45", "e4d8b2f5-70a2-416b-cd49-a250bf7e3b84"),
    ("mikmon-2026-09-17-B5", "1-SEMAINE",  40, "e6f6727cb80b7b3c09f7c2236b656cf698d416c4a6d3f2734b5d609eb66c3e5d", "f5e9c3a6-81b3-427c-de5a-b361c08f4c95"),
    ("mikmon-2026-09-17-B6", "1-MOIS",     40, "637c13cff788e65f348035e70e78d972b68bb448480b13361879ef573cf61e3d", "06f0d4b7-92c4-438d-ef6b-c472d1905da6"),
]

# Ligne profil imprimée sur chaque voucher — doit correspondre à la Grille A.
EXPECTED_PROFIL = {
    "5-HEURES":  "24h 5h cfa 100.00",
    "12-HEURES": "24h 12h cfa 200.00",
    "24-HEURES": "48h 1d cfa 300.00",
    "72-HEURES": "5d 3d cfa 500.00",
    "1-SEMAINE": "10d 1w cfa 1,000.00",
    "1-MOIS":    "40d 4w3d cfa 4,000.00",
}

PDF_NAME = {
    "5-HEURES":  "Voucher-DEOGRACIAS-5-HEURES-lot digital.pdf",
    "12-HEURES": "Voucher-DEOGRACIAS-12-HEURES-lot digital.pdf",
    "24-HEURES": "Voucher-DEOGRACIAS-24-HEURES-lot digital.pdf",
    "72-HEURES": "Voucher-DEOGRACIAS-72-HEURES-lot digital.pdf",
    "1-SEMAINE": "Voucher-DEOGRACIAS-1-SEMAINE-lot digital.pdf",
    "1-MOIS":    "Voucher-DEOGRACIAS-1-MOIS-lot digital.pdf",
}

ENTRY_RE = re.compile(r"\[(\d+)\]DEOGRACIAS\s*\nKode Voucher\s*\n([a-z0-9]+)\s*\n([^\n]*)")


def die(msg: str) -> None:
    print(f"ERREUR: {msg}", file=sys.stderr)
    sys.exit(1)


def extract(pdf_dir: Path) -> dict:
    try:
        from pypdf import PdfReader
    except ImportError:
        die("pypdf requis : pip install pypdf")
    lots = {}
    all_codes = set()
    for tag, offer_id, qty, sha_manifest, _batch_id in BATCHES:
        path = pdf_dir / PDF_NAME[offer_id]
        if not path.exists():
            die(f"PDF introuvable : {path}")
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        if sha != sha_manifest:
            die(f"empreinte PDF {offer_id} ≠ manifeste IMP-06 §2 (coffre altéré ?)")
        reader = PdfReader(str(path))
        text = "\n".join(p.extract_text() for p in reader.pages)
        entries = ENTRY_RE.findall(text)
        codes = [e[1] for e in entries]
        if len(codes) != qty:
            die(f"{offer_id}: {len(codes)} codes extraits, {qty} attendus (manifeste §1)")
        if len(set(codes)) != qty:
            die(f"{offer_id}: doublons internes")
        for c in codes:
            if not re.fullmatch(r"[a-z0-9]{8}", c):
                die(f"{offer_id}: code au format inattendu")
        seqs = [int(e[0]) for e in entries]
        if seqs != list(range(1, qty + 1)):
            die(f"{offer_id}: séquence [n] discontinue")
        profils = {e[2].strip() for e in entries}
        if profils != {EXPECTED_PROFIL[offer_id]}:
            die(f"{offer_id}: ligne profil inattendue (Grille A ?) : {profils}")
        if all_codes & set(codes):
            die(f"{offer_id}: doublons inter-lots")
        all_codes |= set(codes)
        lots[tag] = {
            "offer_id": offer_id,
            "qty": qty,
            "sha": sha,
            "entries": [
                # EMPREINTES SEULES — le code clair est immédiatement oublié.
                (hashlib.sha256(c.encode("utf-8")).hexdigest(), c[:2])
                for c in codes
            ],
        }
    if len(all_codes) != 660:
        die(f"total {len(all_codes)} ≠ 660")
    return lots


def emit(lots: dict, out_path: Path) -> None:
    lines = [
        "-- IMP-16 | 0010_seed_stock_mikmon",
        "-- SEED DU STOCK DIGITAL MIKMON du 17/09/2026 : 660 tickets (manifeste IMP-06,",
        "-- docs/infrastructure/stock-manifest-2026-09-17.md), répartition Grille A :",
        "-- B1 5-HEURES x300, B2 12-HEURES x60, B3 24-HEURES x100, B4 72-HEURES x120,",
        "-- B5 1-SEMAINE x40, B6 1-MOIS x40.",
        "--",
        "-- SÉCURITÉ (INC-01/INC-04) : SEULES les empreintes sha256(code) sont stockées —",
        "-- le code clair ne vit qu'au coffre (PDFs propriétaires, hors dépôt). La",
        "-- vérification d'un code se fait en comparant sha256(code_saisi) à code_hash.",
        "-- code_prefix_hint = 2 premiers caractères (aide au support ; l'espace restant",
        "-- à deviner demeure ~36^6 ; le code n'est valable QUE sur le Wi-Fi du site —",
        "-- précédent D2, risque assumé documenté au manifeste §4).",
        "--",
        "-- IDEMPOTENCE : tools/db-migrate.sh ré-applique toutes les migrations ; les",
        "-- batches ont des UUID fixes et les INSERT utilisent ON CONFLICT DO NOTHING.",
        "-- Intégrité coffre : manifest_sha256 = empreinte du PDF source (manifeste §2,",
        "-- re-vérifiée à la génération du 23/09/2026).",
        "--",
        "-- mikrotik_comment reste NULL : les comments vc-<seq>-09.17.26- vivent côté",
        "-- routeur ; la réconciliation IMP-24 associera par username hotspot (= code).",
        "--",
        "-- FICHIER GÉNÉRÉ — régénérable : tools/gen-seed-stock-0010.py <dossier-PDFs-coffre>",
        "-- (nécessite les PDFs du coffre, jamais présents dans le dépôt).",
        "",
        "-- Garde : le catalogue Grille A (0008) doit être présent avant le seed.",
        "DO $$",
        "BEGIN",
        "  IF (SELECT count(*) FROM public.plans",
        "      WHERE offer_id IN ('5-HEURES','12-HEURES','24-HEURES','72-HEURES','1-SEMAINE','1-MOIS')",
        "        AND active_to IS NULL) <> 6 THEN",
        "    RAISE EXCEPTION '0010: plans Grille A (0008) absents ou incomplets — seed refusé';",
        "  END IF;",
        "END;",
        "$$;",
        "",
    ]
    for tag, offer_id, qty, sha_manifest, batch_id in BATCHES:
        lot = lots[tag]
        assert lot["offer_id"] == offer_id and lot["qty"] == qty
        lines += [
            f"-- Lot {tag[-2:]} : {offer_id} x{qty}",
            "WITH batch AS (",
            "  INSERT INTO public.ticket_batches (id, source, quantity, generated_at, manifest_sha256, notes)",
            f"  VALUES ('{batch_id}', 'mikmon-manual', {qty}, '2026-09-17 12:00:00+00',",
            f"          '{sha_manifest}', '{tag} ({offer_id}, manifeste IMP-06)')",
            "  ON CONFLICT (id) DO NOTHING",
            "  RETURNING id",
            ")",
            "INSERT INTO public.tickets (batch_id, code_hash, code_prefix_hint, plan_id)",
            "SELECT (SELECT COALESCE((SELECT id FROM batch),",
            f"                      (SELECT id FROM public.ticket_batches WHERE id = '{batch_id}'))),",
            "       v.code_hash, v.code_prefix_hint,",
            f"       (SELECT id FROM public.plans WHERE offer_id = '{offer_id}' AND active_to IS NULL LIMIT 1)",
            "FROM (VALUES",
        ]
        vals = ",\n".join(f"  ('{h}', '{p}')" for h, p in lot["entries"])
        lines.append(vals)
        lines += [
            ") AS v(code_hash, code_prefix_hint)",
            "ON CONFLICT (code_hash) DO NOTHING;",
            "",
        ]
    lines += [
        "-- Vérification finale : 6 batches et 660 tickets, distribution conforme.",
        "DO $$",
        "DECLARE",
        "  n_batches integer;",
        "  n_tickets integer;",
        "BEGIN",
        "  SELECT count(*) INTO n_batches FROM public.ticket_batches WHERE notes LIKE 'mikmon-2026-09-17-B%';",
        "  SELECT count(*) INTO n_tickets FROM public.tickets t",
        "    JOIN public.ticket_batches b ON b.id = t.batch_id",
        "   WHERE b.notes LIKE 'mikmon-2026-09-17-B%';",
        "  IF n_batches <> 6 OR n_tickets <> 660 THEN",
        "    RAISE EXCEPTION '0010: seed incomplet (batches=%, tickets=%, attendus 6/660)', n_batches, n_tickets;",
        "  END IF;",
        "  RAISE NOTICE '0010 OK : stock Mikmon 17/09 seedé (6 batches, 660 tickets hashés)';",
        "END;",
        "$$;",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main() -> None:
    if len(sys.argv) != 2:
        die("usage: gen-seed-stock-0010.py <dossier-des-6-PDFs-du-coffre>")
    pdf_dir = Path(sys.argv[1])
    lots = extract(pdf_dir)
    root = Path(__file__).resolve().parents[1]
    out = root / "supabase" / "migrations" / "0010_seed_stock_mikmon.sql"
    emit(lots, out)
    # Récap sans AUCUN code : comptes + empreintes des empreintes (traçabilité).
    recap = {
        tag: {
            "offer": lots[tag]["offer_id"],
            "n": lots[tag]["qty"],
            "digest_of_hashes": hashlib.sha256(
                json.dumps([h for h, _ in lots[tag]["entries"]]).encode()
            ).hexdigest()[:16],
        }
        for tag in lots
    }
    print(f"OK : {out}")
    print(json.dumps(recap, indent=2))


if __name__ == "__main__":
    main()
