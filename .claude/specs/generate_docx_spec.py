import os
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# --- Styling Helper Functions ---

from docx.oxml.ns import nsdecls
from docx.oxml import parse_xml

def set_cell_shading(cell, color_hex):
    """Applies a background fill color to a table cell safely."""
    tcPr = cell._element.get_or_add_tcPr()
    # Remove existing shading elements to avoid corruption/sequence issues
    for shd in tcPr.xpath('w:shd'):
        tcPr.remove(shd)
    new_shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    tcPr.append(new_shd)

def apply_native_cell_padding(cell):
    """Applies clean spacing before and after text inside cell to act as padding."""
    for paragraph in cell.paragraphs:
        paragraph.paragraph_format.space_before = Pt(5)
        paragraph.paragraph_format.space_after = Pt(5)
        paragraph.paragraph_format.line_spacing = 1.15

def add_header_footer(doc):
    """Adds standard running header and footer with page number placeholders."""
    section = doc.sections[0]
    header = section.header
    hp = header.paragraphs[0]
    hp.text = "Anemal SaaS System Specification  |  Confidential"
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hp.style.font.size = Pt(8.5)
    hp.style.font.color.rgb = RGBColor(112, 128, 144)
    
    footer = section.footer
    fp = footer.paragraphs[0]
    fp.text = "Anemal Clinic Management Platform"
    fp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    fp.style.font.size = Pt(8.5)
    fp.style.font.color.rgb = RGBColor(112, 128, 144)

# --- Parser Functions ---

def parse_markdown_tables(filepath):
    """Parses a markdown file and extracts sections, paragraphs, and tables."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    parsed_items = []
    
    current_table = []
    in_table = False
    
    for line in lines:
        stripped = line.strip()
        
        # Heading 1
        if stripped.startswith('# '):
            if in_table and current_table:
                parsed_items.append(('table', current_table))
                current_table = []
                in_table = False
            parsed_items.append(('h1', stripped[2:]))
            
        # Heading 2
        elif stripped.startswith('## '):
            if in_table and current_table:
                parsed_items.append(('table', current_table))
                current_table = []
                in_table = False
            parsed_items.append(('h2', stripped[3:]))
            
        # Heading 3
        elif stripped.startswith('### '):
            if in_table and current_table:
                parsed_items.append(('table', current_table))
                current_table = []
                in_table = False
            parsed_items.append(('h3', stripped[4:]))
            
        # Table row
        elif stripped.startswith('|'):
            in_table = True
            # Ignore markdown separator line
            if '---|---|---' in stripped or '---' in stripped and len(stripped) < 25:
                continue
            cells = [c.strip() for c in stripped.split('|')[1:-1]]
            current_table.append(cells)
            
        # Bullet list
        elif stripped.startswith('- ') or stripped.startswith('* '):
            if in_table and current_table:
                parsed_items.append(('table', current_table))
                current_table = []
                in_table = False
            parsed_items.append(('bullet', stripped[2:]))
            
        # Plain text
        elif stripped:
            if in_table and current_table:
                parsed_items.append(('table', current_table))
                current_table = []
                in_table = False
            parsed_items.append(('text', stripped))
            
        else:
            if in_table and current_table:
                parsed_items.append(('table', current_table))
                current_table = []
                in_table = False
                
    if current_table:
        parsed_items.append(('table', current_table))
        
    return parsed_items

def parse_database_schema(filepath):
    """Parses database-schema.sql to extract table names, comments, and columns."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split into statements
    statements = content.split(';')
    tables = []
    indexes = []
    rls_policies = []
    
    for stmt in statements:
        stmt_clean = stmt.strip()
        if not stmt_clean:
            continue
            
        # Extract Tables
        if re.search(r'CREATE\s+TABLE\s+(\w+)', stmt_clean, re.IGNORECASE):
            table_name_match = re.search(r'CREATE\s+TABLE\s+(\w+)', stmt_clean, re.IGNORECASE)
            table_name = table_name_match.group(1)
            
            # Extract column definitions
            cols_part = stmt_clean[stmt_clean.find('(')+1:stmt_clean.rfind(')')]
            lines = cols_part.split('\n')
            columns = []
            
            for line in lines:
                line_clean = line.strip()
                if not line_clean or line_clean.startswith('--'):
                    continue
                # Simple extraction of col name, type, and comment
                parts = line_clean.split()
                if not parts:
                    continue
                col_name = parts[0]
                if col_name.upper() in ['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN']:
                    continue
                col_type = parts[1] if len(parts) > 1 else ''
                # Look for end-of-line comment
                comment = ''
                if '--' in line_clean:
                    comment = line_clean[line_clean.find('--')+2:].strip()
                
                columns.append({
                    'name': col_name,
                    'type': col_type,
                    'comment': comment
                })
                
            tables.append({
                'name': table_name,
                'columns': columns,
                'raw_sql': stmt_clean + ';'
            })
            
        # Extract Indexes
        elif re.search(r'CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)', stmt_clean, re.IGNORECASE):
            match = re.search(r'CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)', stmt_clean, re.IGNORECASE)
            if match:
                is_unique = match.group(1) is not None
                idx_name = match.group(2)
                tbl_name = match.group(3)
                cols = match.group(4)
                indexes.append({
                    'name': idx_name,
                    'table': tbl_name,
                    'columns': cols,
                    'unique': is_unique,
                    'raw_sql': stmt_clean + ';'
                })
                
        # Extract RLS Policies
        elif re.search(r'CREATE\s+POLICY\s+(\w+)\s+ON\s+(\w+)', stmt_clean, re.IGNORECASE):
            match = re.search(r'CREATE\s+POLICY\s+(\w+)\s+ON\s+(\w+)\s+USING\s*\(([^)]+)\)', stmt_clean, re.IGNORECASE)
            if match:
                pol_name = match.group(1)
                tbl_name = match.group(2)
                using_clause = match.group(3)
                rls_policies.append({
                    'name': pol_name,
                    'table': tbl_name,
                    'using': using_clause,
                    'raw_sql': stmt_clean + ';'
                })
                
    return tables, indexes, rls_policies

def parse_roadmap_tasks(filepath):
    """Parses phase4-tasks.md to extract sprints, tasks, efforts, priorities, and criteria."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    modules = []
    current_module = None
    current_task = None
    
    lines = content.split('\n')
    
    for line in lines:
        stripped = line.strip()
        
        # Module header
        if stripped.startswith('## Module '):
            if current_module:
                if current_task:
                    current_module['tasks'].append(current_task)
                    current_task = None
                modules.append(current_module)
            current_module = {
                'title': stripped[10:],
                'tasks': []
            }
            
        # Task header
        elif stripped.startswith('### Task '):
            if current_task and current_module:
                current_module['tasks'].append(current_task)
            current_task = {
                'title': stripped[9:],
                'agent': '',
                'effort': '',
                'priority': '',
                'checklist': [],
                'criteria': []
            }
            
        elif current_task:
            if stripped.startswith('**Agent:**'):
                current_task['agent'] = stripped[10:].strip()
            elif stripped.startswith('**Effort:**'):
                current_task['effort'] = stripped[11:].strip()
            elif stripped.startswith('**Priority:**'):
                current_task['priority'] = stripped[13:].strip()
            elif stripped.startswith('- [ ] ') or stripped.startswith('- [x] '):
                current_task['checklist'].append(stripped[6:].strip())
            elif stripped.startswith('- ✅'):
                current_task['criteria'].append(stripped[3:].strip())
                
    if current_module:
        if current_task:
            current_module['tasks'].append(current_task)
        modules.append(current_module)
        
    return modules

# --- Main Document Generator ---

def build_docx():
    print("Starting generation of rich Word document...")
    
    doc = Document()
    
    # Page setup - Standard Letter, 1 inch margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        section.page_width = Inches(8.5)
        section.page_height = Inches(11.0)
        
    # Standard styles setup
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Arial'
    style_normal.font.size = Pt(10.5)
    style_normal.font.color.rgb = RGBColor(45, 55, 72) # charcoal
    
    # ------------------ COVER PAGE ------------------
    
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_p.paragraph_format.space_before = Pt(120)
    title_p.paragraph_format.space_after = Pt(10)
    run_title = title_p.add_run("ANEMAL CLINIC MANAGEMENT PLATFORM")
    run_title.font.name = 'Arial'
    run_title.font.size = Pt(24)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(27, 54, 93) # Navy
    
    subtitle_p = doc.add_paragraph()
    subtitle_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle_p.paragraph_format.space_after = Pt(40)
    run_sub = subtitle_p.add_run("Complete Integrated Functional & Technical Specification Document")
    run_sub.font.name = 'Arial'
    run_sub.font.size = Pt(14)
    run_sub.font.italic = True
    run_sub.font.color.rgb = RGBColor(74, 85, 104) # Slate
    
    # Horizontal rule
    hr_p = doc.add_paragraph()
    hr_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    hr_p.paragraph_format.space_after = Pt(120)
    run_hr = hr_p.add_run("____________________________________________________")
    run_hr.font.color.rgb = RGBColor(27, 54, 93)
    
    meta_p = doc.add_paragraph()
    meta_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta_p.paragraph_format.space_after = Pt(6)
    r1 = meta_p.add_run("Version: ")
    r1.font.bold = True
    meta_p.add_run("1.2\n")
    
    r2 = meta_p.add_run("Date: ")
    r2.font.bold = True
    meta_p.add_run("May 31, 2026\n")
    
    r3 = meta_p.add_run("Target Audience: ")
    r3.font.bold = True
    meta_p.add_run("SaaS Stakeholders, Lead Architects, QA Engineers, DevOps\n")
    
    r4 = meta_p.add_run("Status: ")
    r4.font.bold = True
    run_status = meta_p.add_run("APPROVED & SYNCHRONIZED")
    run_status.font.bold = True
    run_status.font.color.rgb = RGBColor(46, 117, 89) # green
    
    doc.add_page_break()
    
    # Enable header/footer after cover page
    add_header_footer(doc)
    
    # ------------------ 1. INTRODUCTION ------------------
    
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(24)
    h1.paragraph_format.space_after = Pt(12)
    run_h1 = h1.add_run("1. Introduction & Overview")
    run_h1.font.size = Pt(18)
    run_h1.font.bold = True
    run_h1.font.color.rgb = RGBColor(27, 54, 93)
    
    p = doc.add_paragraph()
    p.add_run(
        "Anemal Clinic Management SaaS is an enterprise-grade multi-tenant software-as-a-service system. "
        "It is engineered specifically for veterinary clinics to handle tablet-based diagnostics, web-based counter operations, "
        "retail POS, multi-branch operations, real-time inventory management, and deep clinical auditing. "
        "This system enables clinics to run seamless processes across multiple geographic branches with isolated tenant "
        "security context via PostgreSQL Row-Level Security (RLS)."
    )
    
    p2 = doc.add_paragraph()
    p2.add_run(
        "This specification documents both the complete Functional Requirements (incorporating all 13 modules) "
        "and the Technical Architecture including database definitions, RLS constraints, indexing strategies, "
        "and integrations. This serves as the single source of truth for the entire development lifecycle."
    )
    
    # ------------------ 2. FUNCTIONAL SPECIFICATION ------------------
    
    h2 = doc.add_paragraph()
    h2.paragraph_format.space_before = Pt(24)
    h2.paragraph_format.space_after = Pt(12)
    run_h2 = h2.add_run("2. Functional Specifications")
    run_h2.font.size = Pt(18)
    run_h2.font.bold = True
    run_h2.font.color.rgb = RGBColor(27, 54, 93)
    
    # Grab data from functional-reqs.md
    fr_path = "claude/specs/functional-reqs.md"
    if os.path.exists(fr_path):
        print(f"Parsing functional requirements from {fr_path}...")
        parsed_fr = parse_markdown_tables(fr_path)
        
        for item_type, val in parsed_fr:
            if item_type == 'h1':
                continue # Already have main section headers
            elif item_type == 'h2':
                p_item = doc.add_paragraph()
                p_item.paragraph_format.space_before = Pt(18)
                p_item.paragraph_format.space_after = Pt(8)
                run_p = p_item.add_run(val)
                run_p.font.size = Pt(14)
                run_p.font.bold = True
                run_p.font.color.rgb = RGBColor(46, 107, 117) # Teal/Slate
            elif item_type == 'h3':
                p_item = doc.add_paragraph()
                p_item.paragraph_format.space_before = Pt(14)
                p_item.paragraph_format.space_after = Pt(6)
                run_p = p_item.add_run(val)
                run_p.font.size = Pt(12)
                run_p.font.bold = True
                run_p.font.color.rgb = RGBColor(74, 85, 104)
            elif item_type == 'text':
                doc.add_paragraph(val)
            elif item_type == 'bullet':
                doc.add_paragraph(val, style='List Bullet')
            elif item_type == 'table':
                # Convert markdown table data to docx table
                if len(val) < 1:
                    continue
                rows = len(val)
                cols = len(val[0])
                table = doc.add_table(rows=rows, cols=cols, style='Table Grid')
                table.alignment = WD_TABLE_ALIGNMENT.CENTER
                
                for r_idx, row_data in enumerate(val):
                    for c_idx, cell_value in enumerate(row_data):
                        # Ensure cell exists before assigning
                        if c_idx < len(table.rows[r_idx].cells):
                            cell = table.rows[r_idx].cells[c_idx]
                            cell.text = cell_value
                            apply_native_cell_padding(cell)
                            
                            # Format Header
                            if r_idx == 0:
                                set_cell_shading(cell, "1B365D") # Navy
                                for p_idx in range(len(cell.paragraphs)):
                                    cell.paragraphs[p_idx].alignment = WD_ALIGN_PARAGRAPH.LEFT
                                    for r in cell.paragraphs[p_idx].runs:
                                        r.font.bold = True
                                        r.font.color.rgb = RGBColor(255, 255, 255)
                                        r.font.size = Pt(9.5)
                            else:
                                # Alternating row colors
                                if r_idx % 2 == 0:
                                    set_cell_shading(cell, "F7FAFC")
                                for p_idx in range(len(cell.paragraphs)):
                                    for r in cell.paragraphs[p_idx].runs:
                                        r.font.size = Pt(9.0)
                
                # Add spacing after table
                spacer = doc.add_paragraph()
                spacer.paragraph_format.space_before = Pt(8)
                spacer.paragraph_format.space_after = Pt(8)
    else:
        print("Warning: functional-reqs.md not found!")
        doc.add_paragraph("Error: Complete Functional Requirements source file not found in path.")

    doc.add_page_break()

    # ------------------ 3. TECHNICAL SPECIFICATION ------------------
    
    h3_sec = doc.add_paragraph()
    h3_sec.paragraph_format.space_before = Pt(24)
    h3_sec.paragraph_format.space_after = Pt(12)
    run_h3 = h3_sec.add_run("3. Technical Architecture & Database Design")
    run_h3.font.size = Pt(18)
    run_h3.font.bold = True
    run_h3.font.color.rgb = RGBColor(27, 54, 93)
    
    doc.add_paragraph(
        "Anemal utilizes a shared-database, shared-schema deployment model for its multi-tenant software architecture. "
        "To strictly secure clinic records, PostgreSQL 15 Row-Level Security (RLS) is fully configured. "
        "This ensures that all queries are dynamically scoped using a session variable, preventing cross-tenant data leaks."
    )
    
    # Parse SQL file
    sql_path = "claude/specs/database-schema.sql"
    if os.path.exists(sql_path):
        print(f"Parsing SQL Database schema from {sql_path}...")
        tables, indexes, rls_policies = parse_database_schema(sql_path)
        
        # Sub-heading for Tables
        sh_t = doc.add_paragraph()
        sh_t.paragraph_format.space_before = Pt(18)
        sh_t.paragraph_format.space_after = Pt(8)
        run_sh = sh_t.add_run("3.1 Complete Database Catalog (25 Tables)")
        run_sh.font.size = Pt(14)
        run_sh.font.bold = True
        run_sh.font.color.rgb = RGBColor(46, 107, 117)
        
        doc.add_paragraph(
            "Every database table has enable_row_level_security active, and is isolated by the current_setting('app.current_tenant_id') variable context. "
            "Below is the complete detail of all 25 logical entities:"
        )
        
        # Let's list all tables and columns beautifully in tables
        for t in tables:
            tp = doc.add_paragraph()
            tp.paragraph_format.space_before = Pt(12)
            tp.paragraph_format.space_after = Pt(4)
            rt = tp.add_run(f"Table: {t['name']}")
            rt.font.size = Pt(11.5)
            rt.font.bold = True
            rt.font.color.rgb = RGBColor(74, 85, 104)
            
            # Create a table showing columns
            col_headers = ["Column Name", "Data Type", "Constraint / Description"]
            t_table = doc.add_table(rows=len(t['columns'])+1, cols=3, style='Table Grid')
            t_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            
            # Set Headers
            for c_idx, head in enumerate(col_headers):
                cell = t_table.rows[0].cells[c_idx]
                cell.text = head
                set_cell_shading(cell, "2E6B75") # Teal
                apply_native_cell_padding(cell)
                for r in cell.paragraphs[0].runs:
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(255, 255, 255)
                    r.font.size = Pt(9.0)
            
            # Set columns data
            for r_idx, col in enumerate(t['columns']):
                col_row_cells = t_table.rows[r_idx+1].cells
                col_row_cells[0].text = col['name']
                col_row_cells[1].text = col['type']
                col_row_cells[2].text = col['comment']
                
                for c_idx in range(3):
                    cell = col_row_cells[c_idx]
                    apply_native_cell_padding(cell)
                    if (r_idx+1) % 2 == 0:
                        set_cell_shading(cell, "F7FAFC")
                    for p in cell.paragraphs:
                        for r in p.runs:
                            r.font.size = Pt(8.5)
                            
            # Add spacer
            doc.add_paragraph().paragraph_format.space_after = Pt(6)
            
        doc.add_page_break()
        
        # Sub-heading for Indexes
        sh_idx = doc.add_paragraph()
        sh_idx.paragraph_format.space_before = Pt(18)
        sh_idx.paragraph_format.space_after = Pt(8)
        run_sh = sh_idx.add_run("3.2 Performance Indexes Strategy")
        run_sh.font.size = Pt(14)
        run_sh.font.bold = True
        run_sh.font.color.rgb = RGBColor(46, 107, 117)
        
        doc.add_paragraph(
            "High performance indexing is absolutely crucial in a shared-schema multi-tenant environment. "
            "Without correct index scoping by tenant_id, database query planners could trigger slow sequential scans, "
            "degrading tablet EMR response times. Below is the full index layout configured on PostgreSQL:"
        )
        
        idx_headers = ["Index Name", "Target Table", "Indexed Columns / Strategy"]
        idx_table = doc.add_table(rows=len(indexes)+1, cols=3, style='Table Grid')
        idx_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        
        for c_idx, head in enumerate(idx_headers):
            cell = idx_table.rows[0].cells[c_idx]
            cell.text = head
            set_cell_shading(cell, "1B365D") # Navy
            apply_native_cell_padding(cell)
            for r in cell.paragraphs[0].runs:
                r.font.bold = True
                r.font.color.rgb = RGBColor(255, 255, 255)
                r.font.size = Pt(9.0)
                
        for r_idx, idx in enumerate(indexes):
            row_cells = idx_table.rows[r_idx+1].cells
            row_cells[0].text = idx['name']
            row_cells[1].text = idx['table']
            row_cells[2].text = f"ON ({idx['columns']})" + (" [UNIQUE]" if idx['unique'] else "")
            
            for c_idx in range(3):
                cell = row_cells[c_idx]
                apply_native_cell_padding(cell)
                if (r_idx+1) % 2 == 0:
                    set_cell_shading(cell, "F7FAFC")
                for p in cell.paragraphs:
                    for r in p.runs:
                        r.font.size = Pt(8.5)
                        
        doc.add_paragraph().paragraph_format.space_after = Pt(12)
        
        # Sub-heading for RLS Policies
        sh_rls = doc.add_paragraph()
        sh_rls.paragraph_format.space_before = Pt(18)
        sh_rls.paragraph_format.space_after = Pt(8)
        run_sh = sh_rls.add_run("3.3 Data Isolation via Row-Level Security (RLS)")
        run_sh.font.size = Pt(14)
        run_sh.font.bold = True
        run_sh.font.color.rgb = RGBColor(46, 107, 117)
        
        doc.add_paragraph(
            "Every database transaction enforces tenant-level context automatically. "
            "The dynamic current_setting('app.current_tenant_id', TRUE)::INT is set per session. "
            "The following list represents all active RLS policies in the PostgreSQL cluster:"
        )
        
        pol_headers = ["Policy Name", "On Table", "Security Clause (USING)"]
        pol_table = doc.add_table(rows=len(rls_policies)+1, cols=3, style='Table Grid')
        pol_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        
        for c_idx, head in enumerate(pol_headers):
            cell = pol_table.rows[0].cells[c_idx]
            cell.text = head
            set_cell_shading(cell, "1B365D")
            apply_native_cell_padding(cell)
            for r in cell.paragraphs[0].runs:
                r.font.bold = True
                r.font.color.rgb = RGBColor(255, 255, 255)
                r.font.size = Pt(9.0)
                
        for r_idx, pol in enumerate(rls_policies):
            row_cells = pol_table.rows[r_idx+1].cells
            row_cells[0].text = pol['name']
            row_cells[1].text = pol['table']
            row_cells[2].text = f"USING (tenant_id = {pol['using']})"
            
            for c_idx in range(3):
                cell = row_cells[c_idx]
                apply_native_cell_padding(cell)
                if (r_idx+1) % 2 == 0:
                    set_cell_shading(cell, "F7FAFC")
                for p in cell.paragraphs:
                    for r in p.runs:
                        r.font.size = Pt(8.5)
                        
    else:
        print("Warning: database-schema.sql not found!")
        doc.add_paragraph("Error: Database schema SQL file not found.")
        
    doc.add_page_break()

    # ------------------ 4. ROADMAP & MILESTONES ------------------
    
    h4_sec = doc.add_paragraph()
    h4_sec.paragraph_format.space_before = Pt(24)
    h4_sec.paragraph_format.space_after = Pt(12)
    run_h4 = h4_sec.add_run("4. Active Development Roadmap & Sprints")
    run_h4.font.size = Pt(18)
    run_h4.font.bold = True
    run_h4.font.color.rgb = RGBColor(27, 54, 93)
    
    doc.add_paragraph(
        "Development operations for Anemal's latest capabilities (Phase 4) cover high-performance clinical, "
        "commercial operations, security mechanisms, and automated notification engines. Sprints are organized by modules:"
    )
    
    rm_path = "claude/roadmap/phase4-tasks.md"
    if os.path.exists(rm_path):
        print(f"Parsing roadmap from {rm_path}...")
        modules = parse_roadmap_tasks(rm_path)
        
        for mod in modules:
            mp = doc.add_paragraph()
            mp.paragraph_format.space_before = Pt(18)
            mp.paragraph_format.space_after = Pt(8)
            mr = mp.add_run(f"Module: {mod['title']}")
            mr.font.size = Pt(14)
            mr.font.bold = True
            mr.font.color.rgb = RGBColor(46, 107, 117)
            
            for task in mod['tasks']:
                tp = doc.add_paragraph()
                tp.paragraph_format.space_before = Pt(10)
                tp.paragraph_format.space_after = Pt(4)
                tr = tp.add_run(f"Task: {task['title']}")
                tr.font.size = Pt(11)
                tr.font.bold = True
                tr.font.color.rgb = RGBColor(74, 85, 104)
                
                # Metadata block
                meta_block = doc.add_paragraph()
                meta_block.paragraph_format.left_indent = Inches(0.2)
                meta_block.paragraph_format.space_after = Pt(4)
                meta_block.add_run("• Agent: ").font.bold = True
                meta_block.add_run(f"{task['agent']}    ")
                meta_block.add_run("• Effort: ").font.bold = True
                meta_block.add_run(f"{task['effort']}    ")
                meta_block.add_run("• Priority: ").font.bold = True
                meta_block.add_run(f"{task['priority']}\n")
                
                # Sprints list details
                if task['checklist']:
                    cl_p = doc.add_paragraph()
                    cl_p.paragraph_format.left_indent = Inches(0.4)
                    cl_p.paragraph_format.space_after = Pt(4)
                    cl_p.add_run("Development Checklist:\n").font.bold = True
                    for item in task['checklist']:
                        cl_p.add_run(f"⬜  {item}\n")
                        
                # Acceptance criteria
                if task['criteria']:
                    ac_p = doc.add_paragraph()
                    ac_p.paragraph_format.left_indent = Inches(0.4)
                    ac_p.paragraph_format.space_after = Pt(8)
                    ac_p.add_run("Acceptance Criteria:\n").font.bold = True
                    for crit in task['criteria']:
                        ac_p.add_run(f"✅  {crit}\n")
    else:
        print("Warning: phase4-tasks.md not found!")
        doc.add_paragraph("Error: Roadmap configuration source not found.")

    doc.add_page_break()

    # ------------------ 5. APPENDIX ------------------
    
    h5_sec = doc.add_paragraph()
    h5_sec.paragraph_format.space_before = Pt(24)
    h5_sec.paragraph_format.space_after = Pt(12)
    run_h5 = h5_sec.add_run("5. Appendices")
    run_h5.font.size = Pt(18)
    run_h5.font.bold = True
    run_h5.font.color.rgb = RGBColor(27, 54, 93)
    
    # Glossary
    doc.add_paragraph("5.1 Glossary").runs[0].font.bold = True
    doc.add_paragraph(
        "• Tenant: A single clinic subscriber organization in the SaaS model.\n"
        "• Branch: A physical retail clinic location belonging to a single Tenant.\n"
        "• EMR: Electronic Medical Record containing SOAP, vitals, and anatomy notes.\n"
        "• RLS: Row-Level Security enforced automatically at the PostgreSQL database engine layer."
    )
    
    # Source code artifacts
    doc.add_paragraph("5.2 Synchronized Project Code Artifacts").runs[0].font.bold = True
    doc.add_paragraph(
        "This specification is dynamically compiled directly from active code and specification references in AnimalClinic:\n"
        "• Functional Requirements Specification: claude/specs/functional-reqs.md\n"
        "• Active PostgreSQL Relational Schema: claude/specs/database-schema.sql\n"
        "• Phase 4 Engineering Roadmap tasks: claude/roadmap/phase4-tasks.md\n"
        "• Technical Architecture Overview: README.md\n"
        "• Development & Modification Audit History: HistoryLog.md"
    )
    
    # Footer notice
    doc.add_paragraph().paragraph_format.space_before = Pt(40)
    end_notice = doc.add_paragraph()
    end_notice.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_end = end_notice.add_run("--- End of System Specification Document ---")
    run_end.font.italic = True
    run_end.font.color.rgb = RGBColor(112, 128, 144)
    
    # Save the file
    out_dir = "claude/specs"
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "System_Specification.docx")
    doc.save(out_file)
    print(f"Word document saved successfully to {out_file}!")

if __name__ == "__main__":
    build_docx()
