# modules/sonic_log_renderer.py
"""
Parses the key:value OCR output from the Sonic Log blueprint
and renders it as a structured HTML form matching the original document layout.
"""
import re


def parse_sonic_log(ocr_text: str) -> dict:
    """Parse the flat key:value OCR output into a dictionary."""
    data = {}
    lines = ocr_text.strip().splitlines()
    run_table_lines = []
    in_table = False

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("RUN_TABLE:"):
            in_table = True
            continue
        if in_table:
            run_table_lines.append(line)
            continue
        if ":" in line:
            key, _, value = line.partition(":")
            data[key.strip()] = value.strip()

    data["_run_table_raw"] = run_table_lines
    return data


def parse_run_table(raw_lines: list) -> list:
    """Parse markdown table lines into list of row dicts."""
    rows = []
    headers = []
    for line in raw_lines:
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.split("|") if c.strip()]
        if all(set(c) <= set("-: ") for c in cells):
            continue  # separator row
        if not headers:
            headers = cells
        else:
            row = {}
            for i, h in enumerate(headers):
                row[h] = cells[i] if i < len(cells) else "BLANK"
            rows.append(row)
    return rows


def v(data: dict, key: str) -> str:
    """Get value, return em-dash for BLANK or missing."""
    val = data.get(key, "BLANK").strip()
    if val.upper() == "BLANK" or val == "":
        return '<span style="color:#aaa;">—</span>'
    return val


def render_sonic_log_html(ocr_text: str) -> str:
    """
    Takes the raw OCR text output and returns a full HTML string
    that reproduces the Sonic Log form layout.
    """
    d = parse_sonic_log(ocr_text)
    rows = parse_run_table(d.get("_run_table_raw", []))

    # Build run table rows HTML
    run_rows_html = ""
    for row in rows:
        run_rows_html += f"""
        <tr>
          <td>{row.get('Run No', '—')}</td>
          <td>{row.get('Bit', '—')}</td>
          <td>{row.get('Bore Hole From', '—')}</td>
          <td>{row.get('Bore Hole To', '—')}</td>
          <td>{row.get('Size', '—')}</td>
          <td>{row.get('Wgt', '—')}</td>
          <td>{row.get('Casing From', '—')}</td>
          <td>{row.get('Casing To', '—')}</td>
        </tr>"""

    # Add empty rows for visual consistency
    for _ in range(max(0, 4 - len(rows))):
        run_rows_html += "<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>"

    html = f"""
<style>
  .slform * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  .slform {{
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #111;
    border: 2px solid #111;
    width: 100%;
    background: #fff;
  }}
  .slform .hrow {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 2px solid #111;
  }}
  .slform .hcell {{
    padding: 10px 14px;
  }}
  .slform .hcell:first-child {{ border-right: 2px solid #111; }}
  .slform .logo {{ font-size: 22px; font-weight: bold; letter-spacing: 2px; }}
  .slform .logo-sub {{ font-size: 11px; color: #555; margin-top: 3px; }}
  .slform .stamp-title {{ font-size: 20px; font-weight: bold; text-align: center; margin-top: 4px; }}
  .slform .stamp-note {{ font-size: 10px; color: #888; text-align: center; }}
  .slform .stamp-lbl {{ font-size: 10px; color: #888; text-align: center; }}

  .slform .body3 {{
    display: grid;
    grid-template-columns: 100px 1fr 160px;
    border-bottom: 1.5px solid #111;
  }}
  .slform .col-border {{ border-right: 1.5px solid #111; }}
  .slform .pad {{ padding: 6px 8px; }}
  .slform .lbl {{ font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }}
  .slform .val {{ font-size: 11px; margin-top: 2px; min-height: 14px; }}
  .slform .frow {{ display: flex; align-items: baseline; gap: 5px; margin-bottom: 4px; }}
  .slform .frow .lbl {{ min-width: 55px; white-space: nowrap; }}
  .slform .frow .val {{ border-bottom: 0.5px solid #999; flex: 1; padding-bottom: 1px; }}

  .slform .loc3 {{
    display: grid;
    grid-template-columns: 100px 1fr 160px;
    border-bottom: 1.5px solid #111;
  }}
  .slform .loc-lbl-col {{
    border-right: 1.5px solid #111;
    display: flex;
    align-items: center;
    justify-content: center;
    font-style: italic;
    font-size: 11px;
    padding: 6px;
  }}
  .slform .sec-row {{
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
    margin-top: 4px;
  }}

  .slform .datum3 {{
    display: grid;
    grid-template-columns: 160px 1fr 170px;
    border-bottom: 1.5px solid #111;
  }}
  .slform .datum-lbl-col {{
    border-right: 1.5px solid #111;
    padding: 6px 8px;
    font-size: 9px;
    color: #666;
    line-height: 1.9;
  }}
  .slform .elev-row {{
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    margin-bottom: 3px;
  }}

  .slform .main2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1.5px solid #111;
  }}
  .slform .main-left {{ border-right: 1.5px solid #111; padding: 6px 8px; }}
  .slform .main-right {{ padding: 6px 8px; }}
  .slform .mrow {{ display: flex; align-items: baseline; gap: 4px; margin-bottom: 4px; }}
  .slform .mrow .lbl {{ min-width: 130px; white-space: nowrap; }}
  .slform .mrow .val {{ border-bottom: 0.5px solid #999; flex: 1; padding-bottom: 1px; }}

  .slform .recv-box {{
    border: 1.5px solid #111;
    padding: 6px 10px;
    margin-top: 6px;
    background: #f7f7f7;
  }}
  .slform .recv-title {{
    font-size: 13px;
    font-weight: bold;
    text-align: center;
    letter-spacing: 2px;
    border-bottom: 0.5px solid #999;
    padding-bottom: 4px;
    margin-bottom: 4px;
  }}
  .slform .recv-date {{
    font-size: 15px;
    font-weight: bold;
    text-align: center;
    letter-spacing: 2px;
    margin-top: 4px;
  }}
  .slform .recv-footer {{
    font-size: 9px;
    text-align: center;
    color: #666;
    margin-top: 4px;
    border-top: 0.5px solid #999;
    padding-top: 3px;
    line-height: 1.6;
  }}

  .slform .tbl-section {{ padding: 6px 8px; }}
  .slform .tbl-hdr {{ font-size: 9px; text-transform: uppercase; color: #666; letter-spacing: 0.06em; margin-bottom: 5px; font-weight: bold; }}
  .slform .run-tbl {{ width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }}
  .slform .run-tbl th {{
    font-size: 9px;
    font-weight: bold;
    text-align: left;
    padding: 3px 4px;
    border: 0.5px solid #111;
    background: #eee;
    color: #333;
  }}
  .slform .run-tbl td {{
    padding: 5px 4px;
    border: 0.5px solid #111;
    min-height: 22px;
  }}
</style>

<div class="slform">

  <!-- HEADER -->
  <div class="hrow">
    <div class="hcell">
      <div class="logo">LOG-TECH</div>
      <div class="logo-sub">Topeka, KS</div>
    </div>
    <div class="hcell">
      <div class="stamp-lbl">Official stamp area</div>
      <div class="stamp-title">SONIC LOG</div>
      <div class="stamp-note">(do not fill)</div>
    </div>
  </div>

  <!-- FILING / COMPANY / OTHER SERVICES -->
  <div class="body3">
    <div class="pad col-border">
      <div class="lbl">Filing no</div>
      <div class="val" style="font-size:13px;font-weight:bold;">{v(d,'FILING_NO')}</div>
      <div style="margin-top:8px;"><div class="lbl">Log type</div><div class="val">{v(d,'LOG_TYPE')}</div></div>
      <div style="margin-top:8px;"><div class="lbl">Type log</div><div class="val">{v(d,'TYPE_LOG')}</div></div>
    </div>
    <div class="pad col-border">
      <div class="frow"><span class="lbl">Company</span><span class="val">{v(d,'COMPANY')}</span></div>
      <div class="frow"><span class="lbl">Well</span><span class="val">{v(d,'WELL')}</span></div>
      <div class="frow"><span class="lbl">Field</span><span class="val">{v(d,'FIELD')}</span></div>
      <div class="frow"><span class="lbl">County</span><span class="val">{v(d,'COUNTY')}</span></div>
      <div class="frow"><span class="lbl">State</span><span class="val">{v(d,'STATE')}</span></div>
    </div>
    <div class="pad">
      <div class="lbl">Other services</div>
      <div style="margin-top:6px;border-bottom:0.5px solid #999;min-height:14px;">{v(d,'OTHER_SERVICES_1')}</div>
      <div style="margin-top:4px;border-bottom:0.5px solid #999;min-height:14px;">{v(d,'OTHER_SERVICES_2')}</div>
      <div style="margin-top:8px;"><div class="lbl">Dual. Ind. Dual.</div></div>
      <div style="margin-top:4px;border-bottom:0.5px solid #999;min-height:14px;">{v(d,'DUAL_IND_DUAL')}</div>
    </div>
  </div>

  <!-- LOCATION -->
  <div class="loc3">
    <div class="loc-lbl-col col-border">Topeka, KS</div>
    <div class="pad col-border">
      <div class="frow"><span class="lbl">Location</span><span class="val">{v(d,'LOCATION')}</span></div>
      <div class="frow"><span class="lbl">API</span><span class="val">{v(d,'API')}</span></div>
      <div class="sec-row">
        <div class="mrow"><span class="lbl">SEC</span><span class="val">{v(d,'SEC')}</span></div>
        <div class="mrow"><span class="lbl">TWP</span><span class="val">{v(d,'TWP')}</span></div>
        <div class="mrow"><span class="lbl">RGE</span><span class="val">{v(d,'RGE')}</span></div>
      </div>
    </div>
    <div class="pad">
      <div class="lbl">Other services</div>
      <div style="margin-top:4px;font-size:10px;line-height:1.9;">
        <div>Dual. IND.</div>
        <div>Dual.</div>
      </div>
    </div>
  </div>

  <!-- DATUM / ELEVATION -->
  <div class="datum3">
    <div class="datum-lbl-col">
      <div>Permanent datum</div>
      <div>Log measured from</div>
      <div>Drilling measured from</div>
    </div>
    <div class="pad col-border">
      <div class="lbl">Ground level</div>
      <div style="font-size:13px;font-weight:bold;margin-top:2px;">K.F. &nbsp; {v(d,'ELEV_KF')}</div>
      <div style="font-size:12px;font-weight:bold;margin-top:3px;">KELLY BUSHING</div>
      <div style="font-size:9px;color:#888;margin-top:4px;">Ft above perm datum</div>
    </div>
    <div class="pad">
      <div class="elev-row"><span style="color:#666;">Elev.</span><span>{v(d,'GROUND_LEVEL')}</span></div>
      <div class="elev-row"><span style="color:#666;">Elev. KB</span><span>{v(d,'ELEV_KB')}</span><span style="color:#666;margin-left:8px;">Wgt.</span><span>—</span></div>
      <div class="elev-row"><span style="color:#666;">DF</span><span>{v(d,'ELEV_DF')}</span></div>
      <div class="elev-row"><span style="color:#666;">GL</span><span>{v(d,'ELEV_GL')}</span></div>
    </div>
  </div>

  <!-- MAIN LOG DATA -->
  <div class="main2">
    <div class="main-left">
      <div class="mrow"><span class="lbl">Date</span><span class="val">{v(d,'DATE')}</span></div>
      <div class="mrow"><span class="lbl">Run no</span><span class="val">{v(d,'RUN_NO')}</span></div>
      <div class="mrow"><span class="lbl">Type log</span><span class="val">{v(d,'TYPE_LOG_RUN')}</span></div>
      <div class="mrow"><span class="lbl">Depth — Driller</span><span class="val">{v(d,'DEPTH_DRILLER')}</span></div>
      <div class="mrow"><span class="lbl">Depth — Logger</span><span class="val">{v(d,'DEPTH_LOGGER')}</span></div>
      <div class="mrow"><span class="lbl">Bottom logged interval</span><span class="val">{v(d,'BOTTOM_LOGGED_INTERVAL')}</span></div>
      <div class="mrow"><span class="lbl">Top logged interval</span><span class="val">{v(d,'TOP_LOGGED_INTERVAL')}</span></div>
      <div class="mrow"><span class="lbl">Type fluid in hole</span><span class="val">{v(d,'TYPE_FLUID_IN_HOLE')}</span></div>
      <div class="mrow"><span class="lbl">Salinity PPM Cl</span><span class="val">{v(d,'SALINITY_PPM_CL')}</span></div>
      <div class="mrow"><span class="lbl">Density</span><span class="val">{v(d,'DENSITY')}</span></div>
      <div class="mrow"><span class="lbl">Level</span><span class="val">{v(d,'LEVEL')}</span></div>
      <div class="mrow"><span class="lbl">Max rec. temp., Deg F</span><span class="val">{v(d,'MAX_REC_TEMP_DEG_F')}</span></div>
      <div class="mrow"><span class="lbl">Operating rig time</span><span class="val">{v(d,'OPERATING_RIG_TIME')}</span></div>
      <div class="mrow"><span class="lbl">Equip no. &amp; location</span><span class="val">{v(d,'EQUIP_NO_LOCATION')}</span></div>
      <div class="mrow"><span class="lbl">Recorded by</span><span class="val">{v(d,'RECORDED_BY')}</span></div>
      <div class="mrow"><span class="lbl">Witnessed by</span><span class="val">{v(d,'WITNESSED_BY')}</span></div>
    </div>
    <div class="main-right">
      <div class="recv-box">
        <div class="recv-title">RECEIVED</div>
        <div style="font-size:10px;text-align:center;">{v(d,'COMMISSION_NAME')}</div>
        <div class="recv-date">{v(d,'DATE_RECEIVED')}</div>
        <div class="recv-footer">{v(d,'CONSERVATION_DIVISION')}<br>{v(d,'CONSERVATION_OFFICER')}</div>
      </div>
      <div style="margin-top:8px;font-size:10px;color:#555;">
        {v(d,'ADDITIONAL_STAMPS')}
      </div>
    </div>
  </div>

  <!-- RUN TABLE -->
  <div class="tbl-section">
    <div class="tbl-hdr">Run log — Bore hole record &amp; casing record</div>
    <table class="run-tbl">
      <thead>
        <tr>
          <th style="width:32px;">Run no</th>
          <th style="width:36px;">Bit</th>
          <th colspan="2" style="text-align:center;">Bore hole record</th>
          <th style="width:30px;">Size</th>
          <th style="width:30px;">Wgt</th>
          <th colspan="2" style="text-align:center;">Casing record</th>
        </tr>
        <tr>
          <th></th><th></th>
          <th style="width:50px;">From</th>
          <th style="width:50px;">To</th>
          <th></th><th></th>
          <th style="width:50px;">From</th>
          <th style="width:50px;">To</th>
        </tr>
      </thead>
      <tbody>
        {run_rows_html}
      </tbody>
    </table>
  </div>

</div>
"""
    return html
