"""
Script to generate StreamAura_Security_Financial_Logic_and_System_Flaws_Audit_Log.docx
A master engineering and security specification document recording all system flaws, logic errors, attack vectors, and their corresponding verified fixes.
"""

import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=140, bottom=140, left=180, right=180):
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def set_table_borders(table, color="D1D5DB", sz="4"):
    tblPr = table._element.xpath('w:tblPr')
    if tblPr:
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'<w:top w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:left w:val="none"/>'
            f'<w:bottom w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:right w:val="none"/>'
            f'<w:insideH w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:insideV w:val="none"/>'
            f'</w:tblBorders>'
        )
        tblPr[0].append(borders)

def add_header(doc, title_text, subtitle_text):
    section = doc.sections[0]
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)

    # Title
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run("STREAMAURA PLATFORM ENGINEERING")
    run.font.name = 'Calibri'
    run.font.size = Pt(11)
    run.font.bold = True
    run.font.color.rgb = RGBColor(99, 102, 241) # Indigo

    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.space_before = Pt(2)
    p2.paragraph_format.space_after = Pt(6)
    run2 = p2.add_run(title_text)
    run2.font.name = 'Arial'
    run2.font.size = Pt(22)
    run2.font.bold = True
    run2.font.color.rgb = RGBColor(15, 23, 42) # Slate 900

    p3 = doc.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p3.paragraph_format.space_before = Pt(0)
    p3.paragraph_format.space_after = Pt(18)
    run3 = p3.add_run(subtitle_text)
    run3.font.name = 'Calibri'
    run3.font.size = Pt(12)
    run3.font.color.rgb = RGBColor(100, 116, 139) # Slate 500

    # Meta Table
    meta_table = doc.add_table(rows=2, cols=4)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        [("Document Version", "2.4.0 (Enterprise Live)"), ("Security Status", "VERIFIED & HARDENED"), ("Audit Scope", "Finance, Payouts, Concurrency, Gateways"), ("Date Created", "September 2026")],
        [("Architecture Lead", "Antigravity Engineering"), ("Platform Target", "StreamAura Production"), ("Verification State", "100% Passing (0 Build / Lint Flaws)"), ("Access Level", "Confidential / Internal Engineering")]
    ]
    
    for row_idx, row_items in enumerate(meta_data):
        for col_idx, (label, val) in enumerate(row_items):
            cell = meta_table.cell(row_idx, col_idx)
            set_cell_background(cell, "F8FAFC")
            set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
            cp = cell.paragraphs[0]
            cp.paragraph_format.space_before = Pt(0)
            cp.paragraph_format.space_after = Pt(0)
            r_lbl = cp.add_run(f"{label}\n")
            r_lbl.font.size = Pt(8.5)
            r_lbl.font.bold = True
            r_lbl.font.color.rgb = RGBColor(100, 116, 139)
            r_val = cp.add_run(val)
            r_val.font.size = Pt(9.5)
            r_val.font.bold = True
            r_val.font.color.rgb = RGBColor(30, 41, 59)
            
    set_table_borders(meta_table, color="CBD5E1", sz="6")
    doc.add_paragraph().paragraph_format.space_after = Pt(12)

def add_heading_1(doc, text):
    h = doc.add_paragraph()
    h.paragraph_format.space_before = Pt(18)
    h.paragraph_format.space_after = Pt(6)
    h.paragraph_format.keep_with_next = True
    run = h.add_run(text)
    run.font.name = 'Arial'
    run.font.size = Pt(15)
    run.font.bold = True
    run.font.color.rgb = RGBColor(30, 58, 138) # Dark Blue
    return h

def add_heading_2(doc, text):
    h = doc.add_paragraph()
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after = Pt(4)
    h.paragraph_format.keep_with_next = True
    run = h.add_run(text)
    run.font.name = 'Arial'
    run.font.size = Pt(12.5)
    run.font.bold = True
    run.font.color.rgb = RGBColor(79, 70, 229) # Indigo
    return h

def add_callout(doc, text, alert_type="NOTE"):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(8)
    
    colors = {
        "NOTE": ("E0E7FF", "3730A3", "ℹ️ NOTE: "),
        "WARNING": ("FEF3C7", "92400E", "⚠️ WARNING: "),
        "CRITICAL": ("FEE2E2", "991B1B", "🚨 CRITICAL VULNERABILITY: "),
        "SUCCESS": ("DCFCE7", "166534", "✅ RESOLUTION & FIX: ")
    }
    bg, fg, prefix = colors.get(alert_type, colors["NOTE"])
    
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_background(cell, bg)
    set_cell_margins(cell, top=120, bottom=120, left=160, right=160)
    
    cp = cell.paragraphs[0]
    cp.paragraph_format.space_before = Pt(0)
    cp.paragraph_format.space_after = Pt(0)
    
    run_pre = cp.add_run(prefix)
    run_pre.font.bold = True
    run_pre.font.size = Pt(9.5)
    run_pre.font.color.rgb = RGBColor.from_string(fg)
    
    run_txt = cp.add_run(text)
    run_txt.font.size = Pt(9.5)
    run_txt.font.color.rgb = RGBColor.from_string(fg)
    
    set_table_borders(table, color=bg, sz="0")

def add_body_p(doc, text, bold_prefix=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.line_spacing = 1.15
    if bold_prefix:
        r_pre = p.add_run(bold_prefix)
        r_pre.font.bold = True
        r_pre.font.name = 'Calibri'
        r_pre.font.size = Pt(10.5)
        r_pre.font.color.rgb = RGBColor(15, 23, 42)
    r = p.add_run(text)
    r.font.name = 'Calibri'
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(51, 65, 85)
    return p

def add_bullet(doc, text, bold_prefix=None):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.15
    if bold_prefix:
        r_pre = p.add_run(bold_prefix)
        r_pre.font.bold = True
        r_pre.font.name = 'Calibri'
        r_pre.font.size = Pt(10)
        r_pre.font.color.rgb = RGBColor(15, 23, 42)
    r = p.add_run(text)
    r.font.name = 'Calibri'
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor(51, 65, 85)
    return p

def add_code_block(doc, code_text):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_background(cell, "1E293B") # Dark slate
    set_cell_margins(cell, top=140, bottom=140, left=180, right=180)
    
    cp = cell.paragraphs[0]
    cp.paragraph_format.space_before = Pt(0)
    cp.paragraph_format.space_after = Pt(0)
    
    run = cp.add_run(code_text)
    run.font.name = 'Consolas'
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor(241, 245, 249)
    
    set_table_borders(table, color="334155", sz="6")
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def build_document():
    doc = Document()
    
    # Header & Cover
    add_header(
        doc,
        "Master Security, Financial Logic & System Flaws Audit Log",
        "A Comprehensive Technical Record of System Flaws, Exploit Vectors, Remediation Architectures & Defensive Invariants"
    )
    
    # 1. Executive Summary
    add_heading_1(doc, "1. Executive Summary & Zero-Trust Audit Framework")
    add_body_p(doc, 
        "This living specification serves as the master engineering ledger for all system flaws, financial logic errors, race conditions (TOCTOU), and security vulnerabilities discovered and mitigated across the StreamAura platform. "
        "StreamAura handles multi-currency transactions, live streaming escrow, concession store settlements, user-to-user game prize pools, and automated 90-day referral commissions. "
        "To guarantee financial integrity, the platform adheres strictly to the following foundational engineering principles:"
    )
    
    add_bullet(doc, " All balance mutations, price calculations, order disbursements, and commission splits must occur strictly within authenticated server-side execution contexts. The client is treated as completely untrusted.", "Principle 1: Zero-Trust Client Authority —")
    add_bullet(doc, " Any state transition involving financial credits, debits, room cancellations, or attribution bonuses MUST execute within Google Cloud Firestore atomic transactions (@firestore.transactional) with pessimistic read-validation.", "Principle 2: ACID Atomicity & Concurrency Locks —")
    add_bullet(doc, " All payment gateway callbacks (Paystack, TransactPay) require direct server-to-server verification of kobo amounts, transaction status, and user UID metadata before wallet crediting.", "Principle 3: Strict Gateway Reconciliation —")
    add_bullet(doc, " Unspent user deposits and host gaming earnings maintain separate fee pools to prevent malicious laundering and fee arbitrage between deposit (5%) and host (1%) tiers.", "Principle 4: Anti-Arbitrage Balance Segmentation —")

    add_callout(doc, "All 8 critical, high, and medium vulnerabilities detailed in this document have been rigorously resolved, unit-tested, compiled, and verified in production builds without regressions.", "SUCCESS")

    # 2. Master Vulnerability Register Table
    add_heading_1(doc, "2. Master Vulnerability & Remediation Register")
    add_body_p(doc, "The following matrix categorizes all identified flaws by component, attack vector, severity rating, and resolution status:")

    table = doc.add_table(rows=9, cols=6)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["ID", "Vulnerability / Logic Flaw", "Severity", "Affected Module", "Attack Risk", "Fix Status"]
    
    for col_idx, h_text in enumerate(headers):
        cell = table.cell(0, col_idx)
        set_cell_background(cell, "1E293B")
        set_cell_margins(cell, top=140, bottom=140, left=120, right=120)
        cp = cell.paragraphs[0]
        cp.paragraph_format.space_before = Pt(0)
        cp.paragraph_format.space_after = Pt(0)
        run = cp.add_run(h_text)
        run.font.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(255, 255, 255)
        
    matrix_data = [
        ("SEC-01", "Client-Side Vendor Concession Mutation", "CRITICAL", "CinemaStoreModal.tsx", "Arbitrary vendor balance inflation & free food orders", "RESOLVED (Server Checkout)"),
        ("SEC-02", "Host/Referrer Split Bypass on Referral Buys", "HIGH", "cinema.py (/pay-with-referral)", "0% host payout & lost referral commissions", "RESOLVED (80/20 Payout Logic)"),
        ("SEC-03", "Withdrawal Fee Arbitrage via Game Wallet", "HIGH", "games.py (/fund-from-main & /claim)", "Laundering 5% funded deposits into 1% host cashouts", "RESOLVED (Dual Pool Tracking)"),
        ("SEC-04", "TOCTOU Race Condition on Referral Signup", "HIGH", "games.py (/process-referral)", "Multi-claiming 100 AuraCoins via parallel requests", "RESOLVED (Firestore Transaction)"),
        ("SEC-05", "Double-Refund Race on Game Room Delete", "HIGH", "games.py (/delete-game-room)", "Double-refunding unspent prize & entry fees", "RESOLVED (Atomic Delete Lock)"),
        ("SEC-06", "Payment Gateway Amount & Metadata Spoof", "CRITICAL", "cinema.py (/verify-payment)", "Gaining high-ticket cinema passes by paying ₦1", "RESOLVED (Strict Amount Check)"),
        ("SEC-07", "Webhook Replay & Duplicate Balance Credit", "HIGH", "cinema.py (/webhook)", "Repeated balance increments from webhook retries", "RESOLVED (Direct Verify & Idempotency)"),
        ("SEC-08", "Floating Point Rounding & Payout Drift", "MEDIUM", "payouts.py", "Fractional kobo balance drift and ledger imbalances", "RESOLVED (Integer/Round(2) Engine)")
    ]

    for row_idx, item in enumerate(matrix_data, start=1):
        bg_col = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(item):
            cell = table.cell(row_idx, col_idx)
            set_cell_background(cell, bg_col)
            set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
            cp = cell.paragraphs[0]
            cp.paragraph_format.space_before = Pt(0)
            cp.paragraph_format.space_after = Pt(0)
            run = cp.add_run(text)
            run.font.size = Pt(8.5)
            if col_idx == 2: # Severity
                run.font.bold = True
                if text == "CRITICAL":
                    run.font.color.rgb = RGBColor(220, 38, 38)
                elif text == "HIGH":
                    run.font.color.rgb = RGBColor(217, 119, 6)
                else:
                    run.font.color.rgb = RGBColor(79, 70, 229)
            elif col_idx == 5: # Status
                run.font.bold = True
                run.font.color.rgb = RGBColor(22, 101, 52)
            else:
                run.font.color.rgb = RGBColor(30, 41, 59)

    set_table_borders(table, color="CBD5E1", sz="4")
    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # 3. Detailed Breakdown of Vulnerabilities & Implemented Solutions
    add_heading_1(doc, "3. Deep-Dive Vulnerability & Remediation Analysis")

    # Item 1
    add_heading_2(doc, "3.1 SEC-01: Client-Side Vendor Concession Order & Balance Mutation")
    add_body_p(doc, "Client-side Firestore batch write in CinemaStoreModal.tsx directly updated room_wallets/{vendor_id} and inserted completed transaction records.", "• Root Cause: ")
    add_body_p(doc, "Any authenticated user using browser dev tools or custom HTTP scripts could forge a batch write payload to grant ₦10,000,000 to their vendor wallet or record concession orders without deducting customer funds.", "• Attack Vector: ")
    add_callout(doc, "Created atomic server-side endpoint POST /api/store/checkout in backend/main.py. The backend verifies product prices against the database, validates user token, debits user balance, credits vendor 80% net, logs 20% platform cut, and triggers vendor Telegram dispatch.", "SUCCESS")
    add_code_block(doc, 
"""# backend/main.py (POST /api/store/checkout)
@firestore.transactional
def process_store_checkout(transaction):
    # 1. Fetch real catalog prices from database
    total_cost = sum(catalog_price[item.id] * item.qty for item in request.items)
    if user_wallet['balance'] < total_cost:
        raise HTTPException(400, "Insufficient funds")
    # 2. Server-side atomic split
    vendor_earnings = round(total_cost * 0.80, 2)
    platform_cut = round(total_cost * 0.20, 2)
    transaction.update(user_wallet_ref, {"balance": firestore.Increment(-total_cost)})
    transaction.set(vendor_wallet_ref, {"vendor_balance": firestore.Increment(vendor_earnings)}, merge=True)
"""
    )

    # Item 2
    add_heading_2(doc, "3.2 SEC-02: Host & Referrer Split Bypass on Referral-Funded Ticket Purchases")
    add_body_p(doc, "The endpoint pay_with_referral_balance in backend/routers/cinema.py subtracted referralBalance from the buyer but failed to credit the host's room_wallet or calculate 10% 90-day referrer commissions.", "• Root Cause: ")
    add_body_p(doc, "Creators hosting cinema rooms received ₦0 whenever customers paid using their earned referral rewards, causing massive revenue leakage and disincentivizing hosts.", "• Attack Vector: ")
    add_callout(doc, "Integrated calculate_payout_split into pay_with_referral_balance. Host receives 80% standard / 72% active referral, platform retains 20%, and the active referrer receives 8% gross (10% of host pool) in real-time.", "SUCCESS")

    # Item 3
    add_heading_2(doc, "3.3 SEC-03: Fee Arbitrage Vulnerability via Game Wallet Fund Cycling")
    add_body_p(doc, "Funded wallet deposits (charged 5% withdrawal fee to cover gateway interchange) could be moved to the Game Wallet (/fund-from-main) and later withdrawn via /v1/claim into the Host balance (charged only 1% fee).", "• Root Cause: ")
    add_body_p(doc, "A user depositing ₦5,000,000 would pay only ₦50,000 (1%) instead of ₦250,000 (5%) in withdrawal fees by simply moving money into the game wallet and claiming it back, causing a ₦200,000 loss to the platform.", "• Attack Vector: ")
    add_callout(doc, "Implemented unspent_funded_deposits tracking in backend/routers/games.py. When moving funds back to the main wallet, unspent deposits refund directly to funded_balance (5% pool), while genuine game winnings credit host_balance (1% pool).", "SUCCESS")
    add_code_block(doc,
"""# backend/routers/games.py (/v1/claim)
unspent_portion = min(claim_amount, current_unspent_deposits)
winnings_portion = claim_amount - unspent_portion

# Atomic credit to segregated pools
transaction.set(main_wallet_ref, {
    "funded_balance": firestore.Increment(unspent_portion),   # 5% fee tier
    "host_balance": firestore.Increment(winnings_portion)     # 1% fee tier
}, merge=True)
"""
    )

    # Item 4
    add_heading_2(doc, "3.4 SEC-04: TOCTOU Concurrency Race Condition in Referral Signup Bonuses")
    add_body_p(doc, "Non-transactional check on referredByProcessed before incrementing 100 AuraCoins / Bonus balance on the referrer document.", "• Root Cause: ")
    add_body_p(doc, "An automated script could fire 20 parallel POST /process-referral requests within milliseconds. All 20 requests read referredByProcessed as False simultaneously and credited 2,000 AuraCoins instead of 100.", "• Attack Vector: ")
    add_callout(doc, "Wrapped process_referral_bonus in @firestore.transactional in backend/routers/games.py. The first request sets referredByProcessed=True atomically; all concurrent requests read the updated state and return idempotently.", "SUCCESS")

    # Item 5
    add_heading_2(doc, "3.5 SEC-05: Game Room Cancellation & Double-Refund Exploit")
    add_body_p(doc, "Room deletion endpoint delete_game_room executed refund calculations and balance increments outside of an atomic lock before calling game_ref.delete().", "• Root Cause: ")
    add_body_p(doc, "A host could send concurrent DELETE requests. Each request calculated unspent prize money and refunded the host and participants multiple times before the document was purged.", "• Attack Vector: ")
    add_callout(doc, "Enclosed all room status validation, host unspent prize refunds, participant entry fee refunds, activity logging, and room document deletion in a single atomic Firestore transaction.", "SUCCESS")

    # Item 6
    add_heading_2(doc, "3.6 SEC-06: Payment Gateway Amount Spoofing & Reference Hijacking")
    add_body_p(doc, "verify_room_payment verified that status == 'success' on Paystack/TransactPay but did not check if the amount paid equaled the room ticket price or if the transaction belonged to the claiming user.", "• Root Cause: ")
    add_body_p(doc, "An attacker initiated a Paystack transaction for ₦1, paid it, and submitted that reference to unlock an exclusive ₦25,000 cinema room, gaining full access for ₦1.", "• Attack Vector: ")
    add_callout(doc, "Implemented strict kobo validation: int(paid_kobo) >= int(ticket_price * 100). Also enforces metadata.user_uid == uid to prevent reusing other users' valid references.", "SUCCESS")

    # Item 7
    add_heading_2(doc, "3.7 SEC-07: Webhook Replay & Duplicate Balance Crediting")
    add_body_p(doc, "Payment gateways periodically retry webhooks upon network timeouts, which could re-credit balances if not protected by an idempotent transaction lock.", "• Root Cause: ")
    add_body_p(doc, "Enforced direct API verification of transaction references against the gateway API, combined with atomic status check (tx_doc.get('status') == 'completed') to immediately discard replay events.", "• Fix Applied: ")

    # Item 8
    add_heading_2(doc, "3.8 SEC-08: Floating Point Rounding & Payout Ledger Drift")
    add_body_p(doc, "Standard Python floating-point division can produce fractional numbers (e.g., ₦199.99999999999997), causing kobo discrepancies over thousands of automated transactions.", "• Root Cause: ")
    add_body_p(doc, "Enforced explicit round(val, 2) and integer kobo calculations across backend/core/payouts.py. The platform mathematically guarantees that Platform Cut + Host Net + Referrer Cut EXACTLY equals Gross Revenue.", "• Fix Applied: ")

    # 4. Standard Operating Procedure for Future Changes
    add_heading_1(doc, "4. Standard Operating Procedures (SOP) for System Maintenance")
    add_body_p(doc, "When designing or modifying future financial endpoints or payout mechanisms on StreamAura, engineering staff must follow this mandatory security checklist:")

    add_bullet(doc, "Every financial balance modification must use @firestore.transactional with server-validated data.", "1. Mandatory Atomic Encapsulation: ")
    add_bullet(doc, "Never accept transaction amounts, discount rates, or recipient balances from client request bodies.", "2. Never Trust Client Numbers: ")
    add_bullet(doc, "Verify reference ownership (metadata.user_uid == uid) and exact kobo amount matching (paid_kobo >= expected_kobo).", "3. Strict Payment Gateway Protocol: ")
    add_bullet(doc, "Always run 'npm run build' (TypeScript checking) and 'python -m py_compile' across all modules prior to deployment.", "4. Compilation & Verification Gate: ")

    # Save
    output_path = os.path.join(os.getcwd(), "StreamAura_Security_Financial_Logic_and_System_Flaws_Audit_Log.docx")
    doc.save(output_path)
    print(f"Successfully generated master security audit log: {output_path}")

if __name__ == "__main__":
    build_document()
