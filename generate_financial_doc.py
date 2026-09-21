import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def create_element(name):
    return OxmlElement(name)

def set_cell_background(cell, fill_hex):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=140, bottom=140, left=200, right=200):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_table_borders(table, color="CCCCCC", sz="4", val="single"):
    tblPr = table._tbl.tblPr
    tblBorders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:insideV w:val="none"/>'
        f'<w:left w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(tblBorders)

def add_styled_heading(doc, text, level):
    h = doc.add_heading(text, level=level)
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after = Pt(6)
    run = h.runs[0]
    if level == 1:
        run.font.name = 'Calibri'
        run.font.size = Pt(17)
        run.font.bold = True
        run.font.color.rgb = RGBColor(15, 23, 42) # Slate 900
    elif level == 2:
        run.font.name = 'Calibri'
        run.font.size = Pt(13.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(234, 88, 12) # Orange 600
    elif level == 3:
        run.font.name = 'Calibri'
        run.font.size = Pt(11.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(71, 85, 105) # Slate 600
    return h

def add_callout(doc, title, text, bg_hex="F8FAFC", border_color="E2E8F0", title_color=RGBColor(15, 23, 42)):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    
    cell = tbl.rows[0].cells[0]
    cell.width = Inches(6.5)
    set_cell_background(cell, bg_hex)
    set_cell_margins(cell, top=160, bottom=160, left=240, right=240)
    
    # Left thick border
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:left w:val="single" w:sz="24" w:space="0" w:color="F97316"/>'
        f'<w:top w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>'
        f'<w:right w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>'
        f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>'
        f'</w:tcBorders>'
    )
    tcPr.append(tcBorders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(3)
    r_title = p.add_run(title + "\n")
    r_title.font.bold = True
    r_title.font.size = Pt(10.5)
    r_title.font.color.rgb = title_color
    
    r_text = p.add_run(text)
    r_text.font.size = Pt(9.5)
    r_text.font.color.rgb = RGBColor(51, 65, 85)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def format_cell(cell, text, bold=False, italic=False, color=RGBColor(30, 41, 59), font_size=9.5, align=WD_ALIGN_PARAGRAPH.LEFT):
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(text)
    run.font.name = 'Calibri'
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    return run

def build_document():
    doc = docx.Document()
    
    # Page setup - Margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.85)
        section.right_margin = Inches(0.85)
        
    # Document Title Block
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(2)
    t_run = title_p.add_run("STREAMAURA PLATFORM")
    t_run.font.name = 'Calibri'
    t_run.font.size = Pt(10)
    t_run.font.bold = True
    t_run.font.color.rgb = RGBColor(234, 88, 12) # Orange accent
    
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(2)
    h1.paragraph_format.space_after = Pt(6)
    h1_run = h1.add_run("Financial Architecture, Revenue Sharing Logic & Investor Guide")
    h1_run.font.name = 'Calibri'
    h1_run.font.size = Pt(22)
    h1_run.font.bold = True
    h1_run.font.color.rgb = RGBColor(15, 23, 42)
    
    sub = doc.add_paragraph()
    sub.paragraph_format.space_before = Pt(0)
    sub.paragraph_format.space_after = Pt(14)
    sub_run = sub.add_run("Comprehensive Technical & Mathematical Specification of Platform Cuts, Creator Payouts, Referral Commissions, Vendor Margins, and Withdrawal Handling Fees (80/20 Model)")
    sub_run.font.name = 'Calibri'
    sub_run.font.size = Pt(11)
    sub_run.font.italic = True
    sub_run.font.color.rgb = RGBColor(100, 116, 139)
    
    # Metadata pill
    meta_table = doc.add_table(rows=1, cols=4)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_widths = [Inches(1.6), Inches(1.6), Inches(1.6), Inches(1.7)]
    headers = [("VERSION", "2.0 (80/20 Standard)"), ("EFFECTIVE DATE", "September 2026"), ("CURRENCY", "NGN (₦) / Kobo"), ("TARGET AUDIENCE", "Team, Board & Investors")]
    
    for i, (k, v) in enumerate(headers):
        cell = meta_table.rows[0].cells[i]
        cell.width = meta_widths[i]
        set_cell_background(cell, "F1F5F9")
        set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r1 = p.add_run(f"{k}\n")
        r1.font.size = Pt(7.5)
        r1.font.bold = True
        r1.font.color.rgb = RGBColor(100, 116, 139)
        r2 = p.add_run(v)
        r2.font.size = Pt(9)
        r2.font.bold = True
        r2.font.color.rgb = RGBColor(15, 23, 42)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    
    # -------------------------------------------------------------
    # SECTION 1: EXECUTIVE SUMMARY
    # -------------------------------------------------------------
    add_styled_heading(doc, "1. Executive Summary & The 80/20 Strategic Model", 1)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "StreamAura is a next-generation real-time social entertainment ecosystem that bridges digital cinema streaming, "
        "interactive game-show tournaments ('Split or Steal'), cinema concession snack commerce, and viral affiliate network growth. "
        "To maximize creator acquisition, host monetization, and platform virality, StreamAura operates on a high-incentive "
    )
    r_bold = p.add_run("80/20 Revenue Split Architecture")
    r_bold.font.bold = True
    p.add_run(" (80% to Creators / Hosts / Vendors, and 20% to StreamAura Platform).")
    
    add_callout(
        doc,
        "CORE VALUE PROPOSITION FOR INVESTORS & CREATORS",
        "• 80% Creator Net: Industry-leading revenue share keeps top movie curators, game hosts, and food vendors exclusively on StreamAura.\n"
        "• 20% Sustainable Platform Cut: Automatically finances payment processing gateway fees, video sync relays, infrastructure, push notifications, and Telegram bot dispatch.\n"
        "• Viral 10% Referral Engine: Paid from the Host's 80% pool (8% of gross) for 90 days, creating a zero-customer-acquisition-cost (CAC) viral growth loop without diluting platform margins.\n"
        "• Transparent Liquidity & Fee Management: Strictly documented withdrawal handling fee policies (0% Vendor, 1% Host/Referral, 5% Refundable Deposit).",
        bg_hex="FFF7ED",
        border_color="FDBA74",
        title_color=RGBColor(194, 65, 12)
    )

    # -------------------------------------------------------------
    # SECTION 2: HIGH-LEVEL REVENUE MATRIX
    # -------------------------------------------------------------
    add_styled_heading(doc, "2. Master Revenue Split Matrix (The 80/20 Standard)", 1)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run("The table below details how every gross Naira earned across StreamAura is programmatically allocated between the Platform, the Host/Creator/Vendor, and the Affiliated Referrer:")

    matrix_table = doc.add_table(rows=5, cols=5)
    matrix_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    matrix_table.autofit = False
    set_table_borders(matrix_table, color="CBD5E1")
    
    col_widths = [Inches(1.7), Inches(1.1), Inches(1.1), Inches(1.3), Inches(1.3)]
    
    headers = ["Revenue Stream", "Platform Cut (20%)", "Host / Vendor Base (80%)", "Referrer Cut (90 Days)", "Final Host / Vendor Net"]
    for j, h_text in enumerate(headers):
        cell = matrix_table.rows[0].cells[j]
        cell.width = col_widths[j]
        set_cell_background(cell, "0F172A")
        set_cell_margins(cell, top=140, bottom=140, left=140, right=140)
        format_cell(cell, h_text, bold=True, color=RGBColor(255, 255, 255), font_size=8.5)
        
    rows_data = [
        ("Virtual Cinema Tickets (Paid Rooms)", "20% (₦200 per ₦1k)", "80% (₦800 per ₦1k)", "10% of Host Share\n(8% Gross / ₦80)", "72% during Referral\n(80% after 90 days)"),
        ("Game Entry Fees (Split or Steal)", "20% (₦200 per ₦1k)", "80% (₦800 per ₦1k)", "10% of Host Share\n(8% Gross / ₦80)", "72% during Referral\n(80% after 90 days)"),
        ("Burned Game Prizes (Both Steal/AFK)", "20% (₦200 per ₦1k)", "80% (₦800 per ₦1k)", "10% of Host Share\n(8% Gross / ₦80)", "72% during Referral\n(80% after 90 days)"),
        ("Cinema Snack Store (Vendor Sales)", "20% (₦200 per ₦1k)", "80% (₦800 per ₦1k)", "0% (Vendor stream is direct commerce)", "80% Net Credited\n(Instant Settlement)")
    ]
    
    for i, row in enumerate(rows_data):
        bg = "FFFFFF" if i % 2 == 0 else "F8FAFC"
        for j, text in enumerate(row):
            cell = matrix_table.rows[i+1].cells[j]
            cell.width = col_widths[j]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
            bold = (j == 0 or j == 4)
            color = RGBColor(16, 185, 129) if j == 4 else (RGBColor(234, 88, 12) if j == 1 else RGBColor(15, 23, 42))
            format_cell(cell, text, bold=bold, color=color, font_size=8.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # -------------------------------------------------------------
    # SECTION 3: VIRTUAL CINEMA ROOMS & TICKET MONETIZATION
    # -------------------------------------------------------------
    add_styled_heading(doc, "3. Virtual Cinema Rooms & Ticket Sales Architecture", 1)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "When a host creates a Paid Cinema Room, viewers purchase tickets via Paystack gateway integration. "
        "Upon cryptographic gateway webhook or verification confirmation, an atomic Firestore database transaction "
        "executes the `calculate_payout_split` protocol."
    )
    
    add_styled_heading(doc, "Mathematical Formulation & Revenue Split Equations", 2)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run("Let ")
    p.add_run("T").font.bold = True
    p.add_run(" be the gross ticket price set by the host (in Naira):\n")
    p.add_run("1. Platform Cut (P): ").font.bold = True
    p.add_run("P = round(T × 0.20, 2)\n")
    p.add_run("2. Host Base Pool (H_base): ").font.bold = True
    p.add_run("H_base = round(T × 0.80, 2)\n")
    p.add_run("3. Referrer Commission (R): ").font.bold = True
    p.add_run("If the host was referred and within 90 days of registration:\n")
    p.add_run("   R = round(H_base × 0.10, 2)  [Equivalent to 8% of Gross Ticket Price]\n")
    p.add_run("   Otherwise: R = ₦0.00\n")
    p.add_run("4. Final Host Net Payout (H_net): ").font.bold = True
    p.add_run("H_net = round(H_base - R, 2)\n")
    p.add_run("   → During Active 90-Day Referral: H_net = 72% of Gross (₦720 on ₦1,000)\n")
    p.add_run("   → Post 90 Days / Organic Host: H_net = 80% of Gross (₦800 on ₦1,000)")

    add_styled_heading(doc, "Cinema Ticket Purchase Walkthrough Table", 2)

    cinema_table = doc.add_table(rows=5, cols=5)
    cinema_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cinema_table.autofit = False
    set_table_borders(cinema_table, color="CBD5E1")
    
    c_widths = [Inches(1.2), Inches(1.2), Inches(1.3), Inches(1.4), Inches(1.4)]
    c_headers = ["Gross Ticket Price", "Platform Cut (20%)", "Host Pool (80%)", "Referrer Cut (10% of Pool)", "Host Final Credited"]
    
    for j, h_text in enumerate(c_headers):
        cell = cinema_table.rows[0].cells[j]
        cell.width = c_widths[j]
        set_cell_background(cell, "1E293B")
        set_cell_margins(cell, top=130, bottom=130, left=130, right=130)
        format_cell(cell, h_text, bold=True, color=RGBColor(255, 255, 255), font_size=8.5)
        
    c_rows = [
        ("₦500", "₦100 (20%)", "₦400 (80%)", "₦40 (8% of gross)", "₦360 (72% active) / ₦400 (standard)"),
        ("₦1,000", "₦200 (20%)", "₦800 (80%)", "₦80 (8% of gross)", "₦720 (72% active) / ₦800 (standard)"),
        ("₦5,000", "₦1,000 (20%)", "₦4,000 (80%)", "₦400 (8% of gross)", "₦3,600 (72% active) / ₦4,000 (standard)"),
        ("₦20,000", "₦4,000 (20%)", "₦16,000 (80%)", "₦1,600 (8% of gross)", "₦14,400 (72% active) / ₦16,000 (standard)")
    ]
    
    for i, row in enumerate(c_rows):
        bg = "FFFFFF" if i % 2 == 0 else "F8FAFC"
        for j, text in enumerate(row):
            cell = cinema_table.rows[i+1].cells[j]
            cell.width = c_widths[j]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=110, bottom=110, left=130, right=130)
            bold = (j == 0 or j == 4)
            color = RGBColor(16, 185, 129) if j == 4 else (RGBColor(234, 88, 12) if j == 1 else RGBColor(15, 23, 42))
            format_cell(cell, text, bold=bold, color=color, font_size=8.5)

    add_styled_heading(doc, "Room Creation Costs, Private Licensing & Perks", 2)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "• Public Free Rooms: 100% Free for hosts to create and broadcast.\n"
        "• Private VIP Rooms: Created with customized max seat licensing. Host pays a seat creation fee deductible from either their Funded Wallet, Host Earnings, Referral Balance, or non-withdrawable Bonus Wallet (₦2,500/seat premium rate for bonus).\n"
        "• TV Series & Episode Viewing: Non-withdrawable Signup Bonus tokens can be spent at ₦50/episode to unlock episodes without cash deduction."
    )

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # -------------------------------------------------------------
    # SECTION 4: CINEMA SNACK STORE (VENDOR COMMERCE ENGINE)
    # -------------------------------------------------------------
    add_styled_heading(doc, "4. Cinema Snack Store & Vendor Commerce Engine", 1)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "StreamAura integrates a real-time concession e-commerce system where physical food vendors and pop-up cinema snack suppliers "
        "sell popcorn, drinks, combo platters, and snacks to moviegoers directly inside active rooms."
    )
    
    add_callout(
        doc,
        "ZERO-DELAY VENDOR SETTLEMENT & 0% WITHDRAWAL MARKUP",
        "1. Instant Revenue Attribution: The exact moment an order is confirmed, the 20% platform fee is captured globally, and 80% net earnings are immediately committed to the vendor's dedicated store balance (room_wallets.vendor_balance).\n"
        "2. 0% Cashout Fee Guarantee: Vendors pay exactly 0% in withdrawal handling fees when transferring their funds to their bank accounts, as the 20% platform commission was already cleared at the point of sale.\n"
        "3. Automated Telegram Fulfillment: Every order immediately triggers a formatted dispatch manifest to the vendor's Telegram operations bot group with customer address, phone number, and ETA tracking.",
        bg_hex="F0FDF4",
        border_color="BBF7D0",
        title_color=RGBColor(21, 128, 61)
    )

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run("Vendor Mathematics Example:\n").font.bold = True
    p.add_run("• Customer Order: Popcorn Large + 2 Sodas = ₦4,500\n")
    p.add_run("• StreamAura Platform Fee (20%): ₦900 (covers operations, server sync, push notifications, and Telegram bot)\n")
    p.add_run("• Net Credited to Vendor Store Wallet (80%): ₦3,600\n")
    p.add_run("• Vendor Withdrawal to Bank: ₦3,600 requested → ₦3,600 received in bank (0% fee).")

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # -------------------------------------------------------------
    # SECTION 5: REAL-TIME INTERACTIVE GAMING ("SPLIT OR STEAL")
    # -------------------------------------------------------------
    add_styled_heading(doc, "5. Interactive Real-Time Gaming ('Split or Steal')", 1)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "'Split or Steal' is a multiplayer game-theory engine built on StreamAura WebSocket relays. "
        "Hosts fund round prize pools, and human contestants pay entry fees to compete for prize pots."
    )
    
    add_styled_heading(doc, "A. Entry Fee Pool Monetization", 2)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "Each round with 2 human contestants generates a gross entry pool:\n"
        "• Pool = 2 × Entry Fee\n"
        "• Platform Commission: 20% of Entry Pool\n"
        "• Host Base Earnings: 80% of Entry Pool (100% if room is administered by platform SuperAdmin)\n"
        "• Referrer Share (if host active < 90 days): 10% of Host Base (8% of Entry Pool)\n"
        "• Final Host Earnings: 72% (during referral) or 80% (standard)."
    )

    add_styled_heading(doc, "B. Prize Pool Resolution & Burn Mechanics", 2)
    
    game_table = doc.add_table(rows=5, cols=4)
    game_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    game_table.autofit = False
    set_table_borders(game_table, color="CBD5E1")
    
    g_widths = [Inches(1.8), Inches(1.5), Inches(1.6), Inches(1.6)]
    g_headers = ["Game Outcome", "Player Distribution", "Platform Fee", "Host Reclaim / Earnings"]
    
    for j, h_text in enumerate(g_headers):
        cell = game_table.rows[0].cells[j]
        cell.width = g_widths[j]
        set_cell_background(cell, "1E293B")
        set_cell_margins(cell, top=130, bottom=130, left=130, right=130)
        format_cell(cell, h_text, bold=True, color=RGBColor(255, 255, 255), font_size=8.5)
        
    g_rows = [
        ("Player A: Split\nPlayer B: Split", "Player A: 50% Prize\nPlayer B: 50% Prize", "0% (Prize won by players)", "₦0 (Prize distributed)"),
        ("Player A: Steal\nPlayer B: Split", "Player A: 100% Prize\nPlayer B: ₦0", "0% (Prize won by Player A)", "₦0 (Prize distributed)"),
        ("Player A: Split\nPlayer B: AFK / Forfeit", "Player A: 50% Prize\nPlayer B: ₦0", "20% of Burned 50%", "Host reclaims 80% of burned half (72% during active referral)"),
        ("Both Steal OR\nBoth AFK / Forfeit", "Player A: ₦0\nPlayer B: ₦0\n(100% Prize Burned)", "20% of Burned Prize", "Host reclaims 80% of burned prize (72% during active referral)")
    ]
    
    for i, row in enumerate(g_rows):
        bg = "FFFFFF" if i % 2 == 0 else "F8FAFC"
        for j, text in enumerate(row):
            cell = game_table.rows[i+1].cells[j]
            cell.width = g_widths[j]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=110, bottom=110, left=130, right=130)
            bold = (j == 0)
            color = RGBColor(234, 88, 12) if j == 2 else RGBColor(15, 23, 42)
            format_cell(cell, text, bold=bold, color=color, font_size=8.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # -------------------------------------------------------------
    # SECTION 6: DUAL-TIER REFERRAL ENGINE
    # -------------------------------------------------------------
    add_styled_heading(doc, "6. Dual-Tier Referral Network & Growth Engine", 1)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "StreamAura drives explosive organic customer acquisition through an automated two-tier referral mechanism "
        "combining instant utility token rewards with revenue-sharing affiliate commissions:"
    )
    
    add_styled_heading(doc, "Tier 1: Instant Signup Bonus (₦100 / 100 AuraCoins)", 2)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "• Reward Trigger: Awarded immediately to the referrer when a new user registers using their unique invite link (`/?ref={uid}`).\n"
        "• Utility Classification: Strictly non-withdrawable. Retained in the user's bonus ledger to fund cinema rooms, season episode unlocks (₦50/episode), or entry games.\n"
        "• Anti-Abuse Controls: Protected by single-device attribution flags (`referredByProcessed: true`) and automated fraud detection."
    )

    add_styled_heading(doc, "Tier 2: 90-Day Host Revenue Commission (10% of Host Share)", 2)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "• Eligibility Window: Active for exactly 90 days (3 calendar months / 7,776,000 seconds) from the newly registered user's signup timestamp.\n"
        "• Commission Rate: Referrer receives 10% of the host's 80% share (equivalent to 8% of total gross volume) whenever the referred user earns as a Cinema Room Host or Game Host.\n"
        "• Payout Ledger: Credited in real-time to the referrer's `referralBalance`.\n"
        "• Withdrawable: 100% withdrawable to any Nigerian commercial bank account with a standard 1% processing fee."
    )

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # -------------------------------------------------------------
    # SECTION 7: WITHDRAWALS & HANDLING FEES
    # -------------------------------------------------------------
    add_styled_heading(doc, "7. Withdrawals, Payment Gateways & Handling Fees", 1)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "All user payouts are processed through StreamAura's unified withdrawal endpoint (`/api/cinema/withdraw`). "
        "Transactions are backed by atomic database locks to eliminate balance duplication or race conditions. "
        "Handling fees are applied strictly according to balance origin:"
    )

    fee_table = doc.add_table(rows=5, cols=5)
    fee_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    fee_table.autofit = False
    set_table_borders(fee_table, color="CBD5E1")
    
    f_widths = [Inches(1.5), Inches(1.0), Inches(1.1), Inches(1.4), Inches(1.5)]
    f_headers = ["Balance Origin", "Handling Fee", "Payout Rate", "Example (₦10,000 Payout)", "Operational Rationale"]
    
    for j, h_text in enumerate(f_headers):
        cell = fee_table.rows[0].cells[j]
        cell.width = f_widths[j]
        set_cell_background(cell, "0F172A")
        set_cell_margins(cell, top=130, bottom=130, left=120, right=120)
        format_cell(cell, h_text, bold=True, color=RGBColor(255, 255, 255), font_size=8.5)
        
    f_rows = [
        ("Store Vendor Earnings\n(vendor_balance)", "0% (Zero Fee)", "100% Payout", "Requested: ₦10,000\nFee: ₦0\nCredited: ₦10,000", "20% platform commission was already deducted at purchase. Zero double-taxation."),
        ("Cinema Host Earnings\n(host_balance)", "1% Standard", "99% Payout", "Requested: ₦10,000\nFee: ₦100\nCredited: ₦9,900", "Covers Nigerian Interbank Settlement (NIP), bank transfer switch fees, and reconciliation."),
        ("Referral Commission\n(referralBalance)", "1% Standard", "99% Payout", "Requested: ₦10,000\nFee: ₦100\nCredited: ₦9,900", "Direct affiliate cash-out covering automated NIP batch transfer routing."),
        ("Funded / Deposit Refund\n(funded_balance)", "5% Handling", "95% Payout", "Requested: ₦10,000\nFee: ₦500\nCredited: ₦9,500", "Covers Paystack payment gateway deposit processing charges, chargeback reserves, and AML compliance.")
    ]
    
    for i, row in enumerate(f_rows):
        bg = "FFFFFF" if i % 2 == 0 else "F8FAFC"
        for j, text in enumerate(row):
            cell = fee_table.rows[i+1].cells[j]
            cell.width = f_widths[j]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=110, bottom=110, left=120, right=120)
            bold = (j == 0 or j == 2)
            color = RGBColor(16, 185, 129) if j == 2 else (RGBColor(234, 88, 12) if "5%" in text else RGBColor(15, 23, 42))
            format_cell(cell, text, bold=bold, color=color, font_size=8.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # -------------------------------------------------------------
    # SECTION 8: INVESTOR SUMMARY & FINANCIAL PROJECTIONS
    # -------------------------------------------------------------
    add_styled_heading(doc, "8. Investor & Board Financial Summary (Quick Reference)", 1)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "For financial modeling, platform valuation, and investor review, StreamAura delivers a predictable, asset-light, high-margin revenue model:"
    )

    summary_table = doc.add_table(rows=6, cols=3)
    summary_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    summary_table.autofit = False
    set_table_borders(summary_table, color="CBD5E1")
    
    s_widths = [Inches(2.2), Inches(2.0), Inches(2.3)]
    s_headers = ["Key Metric / Dimension", "Platform Standard Value", "Strategic Benefit"]
    
    for j, h_text in enumerate(s_headers):
        cell = summary_table.rows[0].cells[j]
        cell.width = s_widths[j]
        set_cell_background(cell, "1E293B")
        set_cell_margins(cell, top=130, bottom=130, left=130, right=130)
        format_cell(cell, h_text, bold=True, color=RGBColor(255, 255, 255), font_size=8.5)
        
    s_rows = [
        ("Gross Platform Take Rate", "20.0% Flat on all Gross GMV", "Stable, predictable revenue across cinema, games, and concessions."),
        ("Creator / Host Retained Pool", "80.0% Base GMV", "Highest host retention in digital cinema streaming."),
        ("Referral Margin Impact", "0.0% Platform Margin Dilution", "10% referral cut is funded entirely from the host's 80% pool (8% gross)."),
        ("Referral Incentive Window", "90 Days (3 Calendar Months)", "Incentivizes rapid onboarding and prevents perpetual affiliate debt."),
        ("Payment Processing Recovery", "5% Deposit Fee / 1% Transfer Fee", "Eliminates gateway leakage; 100% of payment provider costs are neutralized.")
    ]
    
    for i, row in enumerate(s_rows):
        bg = "FFFFFF" if i % 2 == 0 else "F8FAFC"
        for j, text in enumerate(row):
            cell = summary_table.rows[i+1].cells[j]
            cell.width = s_widths[j]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=110, bottom=110, left=130, right=130)
            bold = (j == 0)
            format_cell(cell, text, bold=bold, color=RGBColor(15, 23, 42), font_size=8.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(14)
    
    # Sign-off / Confidentiality Notice
    conf_p = doc.add_paragraph()
    conf_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    conf_run = conf_p.add_run("CONFIDENTIAL & PROPRIETARY — FOR STREAMAURA INTERNAL TEAM, ADVISORS & QUALIFIED INVESTORS ONLY")
    conf_run.font.size = Pt(7.5)
    conf_run.font.bold = True
    conf_run.font.color.rgb = RGBColor(148, 163, 184)
    
    out_path = os.path.join(os.getcwd(), "StreamAura_Financial_Model_and_Revenue_Sharing_Logic.docx")
    doc.save(out_path)
    print(f"Successfully generated: {out_path}")

if __name__ == "__main__":
    build_document()
