"""CampusFlow — Streamlit edition (deploy free on https://share.streamlit.io).

One login, one dashboard, one calendar for campus service requests and study planning.
Data is stored in campusflow_data.json next to this file. On Streamlit Community Cloud
that file resets when the app restarts — fine for a hackathon demo. Seed data is recreated
automatically, and "Reset demo data" in the sidebar restores it at any time.

Run locally:  pip install -r requirements.txt && streamlit run streamlit_app.py
"""
from __future__ import annotations

import calendar
import json
import os
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

st.set_page_config(page_title="CampusFlow", page_icon="🌊", layout="wide")

DATA_FILE = Path(__file__).with_name("campusflow_data.json")
USERS = {
    "student@campus.edu": {"password": "password123", "role": "student", "name": "Aarav Mehta", "meta": "B.Tech CSE · Year 2"},
    "admin@campus.edu": {"password": "password123", "role": "admin", "name": "Dr. Priya Rao", "meta": "Campus Services Desk"},
}
DEPARTMENTS = ["Admin Office", "Lab Tech", "Maintenance", "HOD"]
STATUSES = ["Pending", "Assigned", "In Progress", "Completed"]
PRIORITIES = ["Low", "Normal", "High", "Urgent"]
TYPES = {
    "certificate": {"label": "Certificate", "dept": "Admin Office", "icon": "📜"},
    "lab": {"label": "Lab Equipment", "dept": "Lab Tech", "icon": "🔬"},
    "maintenance": {"label": "Maintenance", "dept": "Maintenance", "icon": "🛠️"},
    "leave": {"label": "Leave", "dept": "HOD", "icon": "🗓️"},
}
STATUS_COLOR = {"Pending": "#f5b544", "Assigned": "#b892ff", "In Progress": "#5ad1ff", "Completed": "#34d3a5"}
PALETTE = ["#7c9cff", "#34d3a5", "#b892ff", "#5ad1ff", "#e3a6ff", "#7fe0c9", "#a5b8ff"]
SLOT_TIMES = ["18:00", "19:15", "20:30", "16:30"]
DAY_ORDER = [0, 2, 4, 5, 1, 3, 6]  # Python weekday(): Mon=0 … extra blocks go Mon, Wed, Fri, Sat, Tue, Thu, Sun

# ---------------------------------------------------------------- styling
st.markdown(
    """
<style>
:root { --lime:#c6f36b; --brand:#7c9cff; }
.stApp { background: radial-gradient(1200px 600px at 85% -10%, rgba(124,156,255,.13), transparent 60%), #0a0f1e; }
h1, h2, h3 { letter-spacing: -.01em; }
.cf-card { background:#131c33; border:1px solid #24314f; border-radius:16px; padding:1rem 1.1rem; margin-bottom:.8rem; }
.cf-kpi .l { font-size:.75rem; color:#93a0bd; text-transform:uppercase; letter-spacing:.06em; font-weight:600; }
.cf-kpi .v { font-size:2rem; font-weight:800; line-height:1.1; }
.cf-kpi .h { color:#93a0bd; font-size:.82rem; }
.cf-id { font-family: ui-monospace, Menlo, monospace; color:#c6f36b; background:rgba(198,243,107,.08);
         border:1px solid rgba(198,243,107,.3); border-radius:8px; padding:.05rem .45rem; font-weight:700; font-size:.85rem; }
.cf-pill { display:inline-block; padding:.1rem .6rem; border-radius:99px; font-size:.75rem; font-weight:600; border:1px solid currentColor; }
.cf-step { display:flex; gap:4px; margin:.5rem 0 .2rem; } .cf-step span { flex:1; height:6px; border-radius:99px; background:#1a2542; }
.cf-chip { font-size:.72rem; padding:.1rem .35rem; border-radius:6px; margin:2px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#e8edf7; }
.cf-cal td { vertical-align:top; width:14.2%; height:92px; border:1px solid #24314f; padding:4px; background:#0e1528; }
.cf-cal th { color:#64718f; font-size:.72rem; text-transform:uppercase; padding:4px; text-align:left; }
.cf-cal table { width:100%; border-collapse:separate; border-spacing:4px; table-layout:fixed; }
.cf-today { outline:2px solid #c6f36b; }
.cf-out { opacity:.35; }
</style>
""",
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------- data
def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def at(days: int, h: int, m: int) -> str:
    return (datetime.combine(date.today() + timedelta(days=days), datetime.min.time()) + timedelta(hours=h, minutes=m)).isoformat(timespec="seconds")


def topics(prefix, names, done, hours):
    return [{"id": f"{prefix}-t{i+1}", "name": n, "hours": hours[i], "done": bool(done[i])} for i, n in enumerate(names)]


def seed() -> dict:
    t = date.today()
    y = t.year
    rid = lambda n: f"CF-{y}-{n:04d}"
    student = "student@campus.edu"
    data = {
        "counters": {str(y): 3},
        "settings": {"weeklyHours": 12},
        "subjects": [
            {"id": "sub-ds", "name": "Data Structures", "code": "CS201", "color": PALETTE[0], "examDate": str(t + timedelta(days=9)),
             "topics": topics("ds", ["Arrays & Linked Lists", "Stacks & Queues", "Trees & BST", "Heaps & Priority Queues", "Graphs: BFS / DFS", "Hashing"], [1, 1, 0, 0, 0, 0], [2, 2, 3, 2, 3, 2])},
            {"id": "sub-db", "name": "Database Systems", "code": "CS203", "color": PALETTE[1], "examDate": str(t + timedelta(days=16)),
             "topics": topics("db", ["ER Modeling", "Relational Algebra", "SQL Joins & Subqueries", "Normalization (1NF–BCNF)", "Transactions & ACID"], [1, 0, 0, 0, 0], [2, 2, 3, 2, 2])},
            {"id": "sub-ma", "name": "Engineering Maths III", "code": "MA201", "color": PALETTE[2], "examDate": str(t + timedelta(days=23)),
             "topics": topics("ma", ["Laplace Transforms", "Fourier Series", "Complex Variables", "Probability Distributions"], [1, 0, 0, 0], [3, 3, 3, 2])},
        ],
        "deadlines": [
            {"id": "dl-1", "subjectId": "sub-ds", "title": "Assignment 3 — BST implementation", "due": str(t + timedelta(days=4)), "done": False},
            {"id": "dl-2", "subjectId": "sub-db", "title": "Mini-project: ER diagram submission", "due": str(t + timedelta(days=7)), "done": False},
            {"id": "dl-3", "subjectId": "sub-ma", "title": "Problem Set 5", "due": str(t + timedelta(days=12)), "done": False},
        ],
        "requests": [
            {"id": rid(1), "type": "certificate", "title": "Bonafide certificate for summer internship", "details": "Needed for an internship application. 2 copies.",
             "priority": "High", "location": "", "status": "Completed", "department": "Admin Office", "student": student,
             "createdAt": at(-6, 10, 15), "updatedAt": at(-3, 15, 40), "completedAt": at(-3, 15, 40),
             "history": [{"status": "Pending", "at": at(-6, 10, 15), "note": "Request submitted"}, {"status": "Assigned", "at": at(-5, 11, 0), "note": "Assigned to Admin Office"},
                         {"status": "In Progress", "at": at(-4, 9, 30), "note": "Certificate being prepared"}, {"status": "Completed", "at": at(-3, 15, 40), "note": "Ready for pickup"}]},
            {"id": rid(2), "type": "lab", "title": "Arduino Uno kit ×2 for IoT mini-project", "details": "Two kits with breadboards and jumper wires.",
             "priority": "Normal", "location": "IoT Lab, Block C", "status": "Assigned", "department": "Lab Tech", "student": student,
             "createdAt": at(-2, 14, 20), "updatedAt": at(-1, 10, 0), "completedAt": None,
             "history": [{"status": "Pending", "at": at(-2, 14, 20), "note": "Request submitted"}, {"status": "Assigned", "at": at(-1, 10, 0), "note": "Assigned to Lab Tech"}]},
            {"id": rid(3), "type": "maintenance", "title": "Ceiling fan not working", "details": "Stopped working yesterday evening.",
             "priority": "Urgent", "location": "Hostel B, Room 214", "status": "Pending", "department": None, "student": student,
             "createdAt": at(-1, 21, 10), "updatedAt": at(-1, 21, 10), "completedAt": None,
             "history": [{"status": "Pending", "at": at(-1, 21, 10), "note": "Request submitted"}]},
        ],
        "blocks": [
            {"id": "blk-seed-done", "date": str(t - timedelta(days=2)), "start": "18:00", "subjectId": "sub-ds", "topicId": "ds-t2", "status": "done"},
            {"id": "blk-seed-missed", "date": str(t - timedelta(days=1)), "start": "18:00", "subjectId": "sub-ds", "topicId": "ds-t3", "status": "missed"},
        ],
        "notifications": [
            {"to": student, "text": f"{rid(1)} is Completed — ready for pickup.", "at": at(-3, 15, 40), "read": False},
            {"to": student, "text": f"{rid(2)} was assigned to Lab Tech.", "at": at(-1, 10, 0), "read": False},
            {"to": student, "text": "You missed yesterday’s Data Structures block (Trees & BST).", "at": at(0, 7, 0), "read": False},
            {"to": "admin", "text": f"New Urgent request {rid(3)}: Ceiling fan not working.", "at": at(-1, 21, 10), "read": False},
        ],
    }
    regenerate(data, mark_rescheduled=False)
    return data


def load() -> dict:
    if DATA_FILE.exists():
        try:
            d = json.loads(DATA_FILE.read_text())
            auto_mark_missed(d)
            return d
        except Exception:
            pass
    d = seed()
    save(d)
    return d


def save(d: dict) -> None:
    DATA_FILE.write_text(json.dumps(d, indent=1))


# ---------------------------------------------------------------- scheduler (rule-based)
def auto_mark_missed(d):
    today = str(date.today())
    for b in d["blocks"]:
        if b["status"] == "planned" and b["date"] < today:
            b["status"] = "missed"


def plan_blocks(subjects, weekly_hours, start: date):
    n = max(1, round(weekly_hours))
    per = {w: n // 7 for w in range(7)}
    for i in range(n % 7):
        per[DAY_ORDER[i]] += 1
    per = {w: min(v, len(SLOT_TIMES)) for w, v in per.items()}
    work = [{"id": s["id"], "exam": s["examDate"], "queue": [[t["id"], t["hours"]] for t in s["topics"] if not t["done"]]}
            for s in subjects if s.get("examDate")]
    work = [w for w in work if w["queue"]]
    out, now_hm = [], datetime.now().strftime("%H:%M")
    for i in range(180):
        d = start + timedelta(days=i)
        ds = str(d)
        open_ = [w for w in work if w["queue"]]
        if not open_ or all(w["exam"] <= ds for w in open_):
            break
        times = SLOT_TIMES[: per[d.weekday()]]
        if d == date.today():
            times = [t for t in times if t > now_hm]
        used = {}
        for tm in times:
            cand = [w for w in work if w["queue"] and w["exam"] > ds]
            if not cand:
                break

            def score(w):
                days_left = max(1, (date.fromisoformat(w["exam"]) - d).days)
                return sum(q[1] for q in w["queue"]) / days_left * (0.45 if used.get(w["id"]) else 1)

            pick = max(cand, key=score)
            item = pick["queue"][0]
            out.append({"id": "blk-" + uuid.uuid4().hex[:8], "date": ds, "start": tm, "subjectId": pick["id"], "topicId": item[0], "status": "planned"})
            item[1] -= 1
            if item[1] <= 0:
                pick["queue"].pop(0)
            used[pick["id"]] = used.get(pick["id"], 0) + 1
    return out


def regenerate(d, mark_rescheduled=True):
    auto_mark_missed(d)
    today = str(date.today())
    d["blocks"] = [b for b in d["blocks"] if not (b["status"] == "planned" and b["date"] >= today)]
    d["blocks"] += plan_blocks(d["subjects"], d["settings"]["weeklyHours"], date.today())
    if mark_rescheduled:
        for b in d["blocks"]:
            if b["status"] == "missed":
                b["status"] = "rescheduled"
    d["blocks"].sort(key=lambda b: b["date"] + b["start"])


# ---------------------------------------------------------------- helpers
def subject(d, sid):
    return next((s for s in d["subjects"] if s["id"] == sid), None)


def topic(d, sid, tid):
    s = subject(d, sid)
    return next((t for t in s["topics"] if t["id"] == tid), None) if s else None


def notify(d, to, text):
    d["notifications"].insert(0, {"to": to, "text": text, "at": now_iso(), "read": False})


def next_id(d):
    y = str(date.today().year)
    d["counters"][y] = d["counters"].get(y, 0) + 1
    return f"CF-{y}-{d['counters'][y]:04d}"


def update_request(d, r, status=None, department=None):
    notes = []
    if department and department != r["department"]:
        r["department"] = department
        notes.append(f"Assigned to {department}")
        if r["status"] == "Pending" and not status:
            status = "Assigned"
    if status and status != r["status"]:
        if status != "Pending" and not r["department"]:
            r["department"] = TYPES[r["type"]]["dept"]
            notes.append(f"Assigned to {r['department']}")
        r["status"] = status
        r["completedAt"] = now_iso() if status == "Completed" else None
    elif not notes:
        return
    r["updatedAt"] = now_iso()
    r["history"].append({"status": r["status"], "at": r["updatedAt"], "note": " · ".join(notes) or f"Status changed to {r['status']}"})
    notify(d, r["student"], f"{r['id']} is now {r['status']}" + (f" ({r['department']})" if r["department"] else "") + ".")


def pill(s):
    c = STATUS_COLOR[s]
    return f'<span class="cf-pill" style="color:{c}">{s}</span>'


def stepper(s):
    idx = STATUSES.index(s)
    c = STATUS_COLOR[s]
    bars = "".join(f'<span style="background:{c if i <= idx else "#1a2542"}"></span>' for i in range(4))
    return f'<div class="cf-step">{bars}</div><div style="display:flex;font-size:.7rem;color:#64718f">' + "".join(
        f'<span style="flex:1;{"color:#e8edf7" if i <= idx else ""}">{x}</span>' for i, x in enumerate(STATUSES)) + "</div>"


def kpi(label, value, hint, color="#c6f36b"):
    st.markdown(f'<div class="cf-card cf-kpi" style="border-left:4px solid {color}"><div class="l">{label}</div><div class="v">{value}</div><div class="h">{hint}</div></div>', unsafe_allow_html=True)


def fmt_dt(iso):
    return datetime.fromisoformat(iso).strftime("%d %b, %H:%M")


def fmt_duration(sec):
    if not sec:
        return "—"
    h = sec / 3600
    return f"{h:.1f} h" if h < 24 else f"{h/24:.1f} days"


def request_card(r):
    t = TYPES[r["type"]]
    st.markdown(
        f'<div class="cf-card"><div style="display:flex;justify-content:space-between;gap:.5rem"><b>{t["icon"]} {r["title"]}</b>{pill(r["status"])}</div>'
        f'<div style="color:#93a0bd;font-size:.82rem;margin-top:.2rem"><span class="cf-id">{r["id"]}</span> · {t["label"]} · {fmt_dt(r["createdAt"])}'
        f'{" · " + r["department"] if r["department"] else ""}</div>{stepper(r["status"])}</div>',
        unsafe_allow_html=True,
    )
    with st.expander(f"Details & timeline · {r['id']}"):
        st.code(r["id"], language=None)  # built-in copy button
        if r.get("details"):
            st.write(r["details"])
        if r.get("location"):
            st.caption(f"📍 {r['location']}")
        if r.get("fromDate"):
            st.caption(f"🗓️ {r['fromDate']} → {r.get('toDate') or r['fromDate']}")
        for h in reversed(r["history"]):
            st.markdown(f"- **{h['status']}** — {h['note']}  \n  <span style='color:#64718f;font-size:.8rem'>{fmt_dt(h['at'])}</span>", unsafe_allow_html=True)


# ---------------------------------------------------------------- pages
def page_login():
    left, right = st.columns([1.1, 1])
    with left:
        st.markdown("## 🌊 CampusFlow")
        st.markdown("# One campus. One login.<br/><span style='color:#c6f36b'>Everything flows.</span>", unsafe_allow_html=True)
        st.write("Request certificates, lab kits, repairs and leave — and plan every exam — from one dashboard and one calendar.")
    with right:
        st.markdown("### Sign in")
        with st.form("login"):
            email = st.text_input("Email", placeholder="you@campus.edu")
            pw = st.text_input("Password", type="password")
            ok = st.form_submit_button("Sign in →", type="primary", use_container_width=True)
        if ok:
            u = USERS.get(email.strip().lower())
            if u and u["password"] == pw:
                st.session_state.user = email.strip().lower()
                st.rerun()
            else:
                st.error("Wrong email or password.")


def page_dashboard(d, email):
    u = USERS[email]
    all_t = [t for s in d["subjects"] for t in s["topics"]]
    done = sum(t["done"] for t in all_t)
    pct = round(done / len(all_t) * 100) if all_t else 0
    today = str(date.today())
    upcoming_exams = sorted([s for s in d["subjects"] if s["examDate"] >= today], key=lambda s: s["examDate"])
    reqs = [r for r in d["requests"] if r["student"] == email]
    open_r = [r for r in reqs if r["status"] != "Completed"]
    notifs = [n for n in d["notifications"] if n["to"] == email]
    missed = [b for b in d["blocks"] if b["status"] == "missed" and not (topic(d, b["subjectId"], b["topicId"]) or {}).get("done")]

    st.markdown(f"## Hello, {u['name'].split()[0]} 👋")
    if missed:
        c1, c2 = st.columns([4, 1])
        c1.error(f"⚠️ You missed {len(missed)} study block(s): " + ", ".join(f"{topic(d, b['subjectId'], b['topicId'])['name']} ({b['date']})" for b in missed))
        if c2.button("Reschedule", type="primary", use_container_width=True):
            regenerate(d); save(d); st.rerun()

    k = st.columns(4)
    with k[0]:
        kpi("Study progress", f"{pct}%", f"{done}/{len(all_t)} topics complete")
    with k[1]:
        if upcoming_exams:
            ex = upcoming_exams[0]
            kpi("Next exam", f"{(date.fromisoformat(ex['examDate']) - date.today()).days} days", f"{ex['name']} · {ex['examDate']}", "#ff6b81")
        else:
            kpi("Next exam", "—", "No upcoming exams", "#ff6b81")
    with k[2]:
        kpi("Open requests", len(open_r), f"{len(reqs) - len(open_r)} completed", "#f5b544")
    with k[3]:
        kpi("Notifications", sum(not n["read"] for n in notifs), f"unread of {len(notifs)}")

    c1, c2 = st.columns([1.6, 1])
    with c1:
        st.markdown("#### Today’s study plan")
        tb = [b for b in d["blocks"] if b["date"] == today and b["status"] in ("planned", "done")]
        if not tb:
            st.info("No study blocks today.")
        for b in tb:
            s, t = subject(d, b["subjectId"]), topic(d, b["subjectId"], b["topicId"])
            if not s or not t:
                continue
            cc = st.columns([1, 5, 1.4])
            cc[0].markdown(f"`{b['start']}`")
            cc[1].markdown(f"<span style='color:{s['color']}'>■</span> **{t['name']}** · {s['name']}" + (" ✅" if b["status"] == "done" else ""), unsafe_allow_html=True)
            if b["status"] == "planned" and cc[2].button("Done", key="bd" + b["id"]):
                b["status"] = "done"; save(d); st.rerun()
        st.markdown("#### Recent requests")
        for r in reqs[:3]:
            request_card(r)
    with c2:
        st.markdown("#### Subject progress")
        for s in d["subjects"]:
            dn = sum(t["done"] for t in s["topics"])
            st.caption(f"{s['name']} · {dn}/{len(s['topics'])}")
            st.progress(dn / len(s["topics"]) if s["topics"] else 0.0)
        st.markdown("#### Notifications")
        for n in notifs[:5]:
            st.markdown(f"{'🟢' if not n['read'] else '⚪'} {n['text']}  \n<span style='color:#64718f;font-size:.78rem'>{fmt_dt(n['at'])}</span>", unsafe_allow_html=True)
        if notifs and st.button("Mark all read"):
            for n in notifs:
                n["read"] = True
            save(d); st.rerun()


def page_requests(d, email):
    u = USERS[email]
    c1, c2 = st.columns([1, 1.1])
    with c1:
        st.markdown("#### New request")
        typ = st.radio("Type", list(TYPES), format_func=lambda k: f"{TYPES[k]['icon']} {TYPES[k]['label']}", horizontal=True)
        with st.form("new_request", clear_on_submit=True):
            title = st.text_input("Title", max_chars=120)
            priority = st.select_slider("Priority", PRIORITIES, value="Normal")
            location, f, t = "", None, None
            if typ == "leave":
                a, b = st.columns(2)
                f = a.date_input("From", value=date.today())
                t = b.date_input("To", value=date.today())
            else:
                location = st.text_input("Location / lab / purpose", max_chars=80)
            details = st.text_area("Details", max_chars=1000)
            st.caption(f"Routed to **{TYPES[typ]['dept']}** by default")
            sub = st.form_submit_button("Submit request →", type="primary")
        if sub:
            if not title.strip():
                st.error("Please add a short title.")
            elif typ == "leave" and t < f:
                st.error("“To” date can’t be before “From”.")
            else:
                rid = next_id(d)
                ts = now_iso()
                d["requests"].insert(0, {"id": rid, "type": typ, "title": title.strip(), "details": details.strip(), "priority": priority,
                                         "location": location.strip(), "fromDate": str(f) if f else "", "toDate": str(t) if t else "",
                                         "status": "Pending", "department": None, "student": email, "createdAt": ts, "updatedAt": ts,
                                         "completedAt": None, "history": [{"status": "Pending", "at": ts, "note": "Request submitted"}]})
                notify(d, "admin", f"New request {rid}: {title.strip()}.")
                notify(d, email, f"{rid} submitted.")
                save(d)
                st.session_state.last_id = rid
                st.rerun()
        if st.session_state.get("last_id"):
            st.success("Request submitted! Your ID (click the copy icon):")
            st.code(st.session_state.last_id, language=None)
    with c2:
        st.markdown("#### Request history")
        tab = st.radio("Show", ["All", "Open", "Completed"], horizontal=True, label_visibility="collapsed")
        mine = sorted([r for r in d["requests"] if r["student"] == email], key=lambda r: r["createdAt"], reverse=True)
        mine = [r for r in mine if tab == "All" or (tab == "Open") == (r["status"] != "Completed")]
        if not mine:
            st.info("No requests here.")
        for r in mine:
            request_card(r)


def page_study(d):
    today = date.today()
    c1, c2 = st.columns([1.5, 1])
    with c1:
        st.markdown("#### Subjects & topics")
        for s in d["subjects"]:
            dn = sum(t["done"] for t in s["topics"])
            with st.container(border=True):
                h = st.columns([3, 2, 1])
                h[0].markdown(f"<span style='color:{s['color']}'>■</span> **{s['name']}** <span style='color:#64718f'>{s['code']}</span>", unsafe_allow_html=True)
                new_exam = h[1].date_input("Exam", value=date.fromisoformat(s["examDate"]), key="ex" + s["id"], label_visibility="collapsed")
                if str(new_exam) != s["examDate"]:
                    s["examDate"] = str(new_exam); regenerate(d, False); save(d); st.rerun()
                if h[2].button("🗑", key="ds" + s["id"], help="Remove subject"):
                    d["subjects"] = [x for x in d["subjects"] if x["id"] != s["id"]]
                    d["blocks"] = [b for b in d["blocks"] if b["subjectId"] != s["id"]]
                    d["deadlines"] = [x for x in d["deadlines"] if x["subjectId"] != s["id"]]
                    save(d); st.rerun()
                st.progress(dn / len(s["topics"]) if s["topics"] else 0.0, text=f"{dn}/{len(s['topics'])} topics")
                for t in s["topics"]:
                    val = st.checkbox(f"{t['name']} · {t['hours']}h", value=t["done"], key="tp" + t["id"])
                    if val != t["done"]:
                        t["done"] = val; regenerate(d, False); save(d)
                        st.toast(f"{'✓ ' + t['name'] + ' complete — ' if val else ''}remaining schedule updated")
                        st.rerun()
                with st.form("at" + s["id"], clear_on_submit=True):
                    a, b, c = st.columns([4, 1.3, 1])
                    nm = a.text_input("Topic", placeholder="Add topic…", label_visibility="collapsed")
                    hr = b.number_input("Hours", 1, 10, 2, label_visibility="collapsed")
                    if c.form_submit_button("＋") and nm.strip():
                        s["topics"].append({"id": "t-" + uuid.uuid4().hex[:8], "name": nm.strip(), "hours": int(hr), "done": False})
                        regenerate(d, False); save(d); st.rerun()
        with st.form("add_subject", clear_on_submit=True):
            st.markdown("**Add subject**")
            a, b, c = st.columns([3, 1.2, 1.6])
            nm = a.text_input("Name", placeholder="Operating Systems")
            code = b.text_input("Code", placeholder="CS205")
            ex = c.date_input("Exam date", value=today + timedelta(days=21), min_value=today)
            if st.form_submit_button("Add subject") and nm.strip():
                used = {x["color"] for x in d["subjects"]}
                color = next((p for p in PALETTE if p not in used), PALETTE[0])
                d["subjects"].append({"id": "sub-" + uuid.uuid4().hex[:6], "name": nm.strip(), "code": code.strip(), "color": color, "examDate": str(ex), "topics": []})
                save(d); st.rerun()

        st.markdown("#### Assignment deadlines")
        for dl in sorted(d["deadlines"], key=lambda x: x["due"]):
            s = subject(d, dl["subjectId"])
            v = st.checkbox(f"{dl['title']} · {s['name'] if s else ''} · due {dl['due']}", value=dl["done"], key="dl" + dl["id"])
            if v != dl["done"]:
                dl["done"] = v; save(d); st.rerun()
        if d["subjects"]:
            with st.form("add_dl", clear_on_submit=True):
                a, b, c = st.columns([3, 2, 1.6])
                tt = a.text_input("Deadline", placeholder="Lab record submission")
                sid = b.selectbox("Subject", [s["id"] for s in d["subjects"]], format_func=lambda x: subject(d, x)["name"])
                due = c.date_input("Due", value=today + timedelta(days=7))
                if st.form_submit_button("Add deadline") and tt.strip():
                    d["deadlines"].append({"id": "dl-" + uuid.uuid4().hex[:6], "subjectId": sid, "title": tt.strip(), "due": str(due), "done": False})
                    save(d); st.rerun()

    with c2:
        st.markdown("#### Schedule generator")
        hrs = st.slider("Weekly study hours", 2, 28, int(d["settings"]["weeklyHours"]))
        if hrs != d["settings"]["weeklyHours"]:
            d["settings"]["weeklyHours"] = hrs; save(d)
        st.caption("1-hour evening blocks. Closer exams and more remaining topics get more slots.")
        if st.button("🔄 Generate schedule", type="primary", use_container_width=True):
            regenerate(d); save(d); st.toast("Schedule regenerated"); st.rerun()
        missed = [b for b in d["blocks"] if b["status"] == "missed" and not (topic(d, b["subjectId"], b["topicId"]) or {}).get("done")]
        if missed:
            st.error(f"{len(missed)} missed block(s) — click Generate schedule to reschedule them.")
        st.markdown("#### Next 14 days")
        horizon = str(today + timedelta(days=14))
        up = [b for b in d["blocks"] if str(today) <= b["date"] < horizon and b["status"] in ("planned", "done")]
        last = None
        for b in up:
            s, t = subject(d, b["subjectId"]), topic(d, b["subjectId"], b["topicId"])
            if not s or not t:
                continue
            if b["date"] != last:
                st.markdown(f"**{date.fromisoformat(b['date']).strftime('%a %d %b')}**")
                last = b["date"]
            st.markdown(f"<div class='cf-card' style='padding:.45rem .7rem;border-left:4px solid {s['color']};margin-bottom:.35rem'>"
                        f"<code>{b['start']}</code> <b>{t['name']}</b> <span style='color:#93a0bd'>· {s['name']}</span>{' ✅' if b['status']=='done' else ''}</div>",
                        unsafe_allow_html=True)
        if not up:
            st.info("No upcoming blocks. Add topics with exam dates, then generate.")


def calendar_events(d, email):
    role = USERS[email]["role"]
    ev = {}
    add = lambda k, e: ev.setdefault(k, []).append(e)
    if role == "student":
        for b in d["blocks"]:
            if b["status"] == "rescheduled":
                continue
            s, t = subject(d, b["subjectId"]), topic(d, b["subjectId"], b["topicId"])
            if s and t:
                add(b["date"], (s["color"], f"{b['start']} {s['name']}", f"{t['name']} · {b['status']}"))
        for s in d["subjects"]:
            add(s["examDate"], ("#ff6b81", f"Exam · {s['name']}", s["code"]))
        for dl in d["deadlines"]:
            add(dl["due"], ("#f5b544", f"Due · {dl['title']}", "deadline"))
    for r in d["requests"]:
        if role == "admin" or r["student"] == email:
            add(r["createdAt"][:10], ("#c6f36b", f"{r['id']} · {r['title']}", r["status"]))
            if r.get("completedAt"):
                add(r["completedAt"][:10], ("#34d3a5", f"✓ {r['id']} completed", r["title"]))
    return ev


def page_calendar(d, email):
    if "cal" not in st.session_state:
        st.session_state.cal = date.today().replace(day=1)
    m = st.session_state.cal
    c = st.columns([1, 1, 1, 6])
    if c[0].button("←"):
        st.session_state.cal = (m - timedelta(days=1)).replace(day=1); st.rerun()
    if c[1].button("Today"):
        st.session_state.cal = date.today().replace(day=1); st.rerun()
    if c[2].button("→"):
        st.session_state.cal = (m + timedelta(days=32)).replace(day=1); st.rerun()
    c[3].markdown(f"### {m.strftime('%B %Y')}")
    st.caption("■ Study block (subject colour) · 🟥 Exam · 🟧 Deadline · 🟩 Request · ✓ Resolved")
    ev = calendar_events(d, email)
    weeks = calendar.Calendar(firstweekday=0).monthdatescalendar(m.year, m.month)
    html = '<div class="cf-cal"><table><tr>' + "".join(f"<th>{x}</th>" for x in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) + "</tr>"
    for wk in weeks:
        html += "<tr>"
        for day in wk:
            items = ev.get(str(day), [])
            cls = ("cf-today " if day == date.today() else "") + ("cf-out" if day.month != m.month else "")
            chips = "".join(f'<div class="cf-chip" style="background:{c}2e;border-left:3px solid {c}">{lbl}</div>' for c, lbl, _ in items[:3])
            more = f'<div style="font-size:.7rem;color:#93a0bd">+{len(items)-3} more</div>' if len(items) > 3 else ""
            html += f'<td class="{cls}"><div style="font-size:.75rem;color:#93a0bd">{day.day}</div>{chips}{more}</td>'
        html += "</tr>"
    st.markdown(html + "</table></div>", unsafe_allow_html=True)
    sel = st.date_input("Day details", value=date.today())
    items = ev.get(str(sel), [])
    if not items:
        st.info("Nothing on this day.")
    for c_, lbl, sub in items:
        st.markdown(f"<div class='cf-card' style='border-left:4px solid {c_};padding:.5rem .8rem'><b>{lbl}</b><br/><span style='color:#93a0bd;font-size:.85rem'>{sub}</span></div>", unsafe_allow_html=True)


def page_admin(d):
    reqs = d["requests"]
    done = [r for r in reqs if r["status"] == "Completed" and r.get("completedAt")]
    avg = sum((datetime.fromisoformat(r["completedAt"]) - datetime.fromisoformat(r["createdAt"])).total_seconds() for r in done) / len(done) if done else 0
    k = st.columns(4)
    with k[0]:
        kpi("Pending", sum(r["status"] == "Pending" for r in reqs), "waiting for assignment", "#f5b544")
    with k[1]:
        kpi("In progress", sum(r["status"] in ("Assigned", "In Progress") for r in reqs), "assigned or being worked on", "#5ad1ff")
    with k[2]:
        kpi("Completed", len(done), f"of {len(reqs)} total", "#34d3a5")
    with k[3]:
        kpi("Avg resolution", fmt_duration(avg), "submitted → completed")

    st.markdown("#### All requests")
    f = st.columns([2.4, 1, 1, 1, 1.2])
    q = f[0].text_input("Search", placeholder="Search ID, title, student, location…", label_visibility="collapsed")
    fs = f[1].selectbox("Status", ["All"] + STATUSES, label_visibility="collapsed")
    fd = f[2].selectbox("Department", ["All", "Unassigned"] + DEPARTMENTS, label_visibility="collapsed")
    ft = f[3].selectbox("Type", ["All"] + list(TYPES), format_func=lambda x: x if x == "All" else TYPES[x]["label"], label_visibility="collapsed")
    so = f[4].selectbox("Sort", ["Newest", "Oldest", "Priority", "Status"], label_visibility="collapsed")
    ql = q.strip().lower()
    rows = [r for r in reqs
            if (fs == "All" or r["status"] == fs)
            and (fd == "All" or (fd == "Unassigned" and not r["department"]) or r["department"] == fd)
            and (ft == "All" or r["type"] == ft)
            and (not ql or ql in " ".join([r["id"], r["title"], r.get("details", ""), USERS.get(r["student"], {}).get("name", ""), r.get("location", ""), r["department"] or ""]).lower())]
    keys = {"Newest": (lambda r: r["createdAt"], True), "Oldest": (lambda r: r["createdAt"], False),
            "Priority": (lambda r: PRIORITIES.index(r["priority"]), True), "Status": (lambda r: STATUSES.index(r["status"]), False)}
    kf, rev = keys[so]
    rows.sort(key=kf, reverse=rev)
    st.caption(f"{len(rows)} of {len(reqs)} shown")
    if rows:
        df = pd.DataFrame([{"ID": r["id"], "Request": f"{TYPES[r['type']]['icon']} {r['title']}", "Student": USERS.get(r["student"], {}).get("name", r["student"]),
                            "Priority": r["priority"], "Created": fmt_dt(r["createdAt"]), "Department": r["department"] or "—", "Status": r["status"]} for r in rows])
        st.dataframe(df, hide_index=True, use_container_width=True)
    for r in rows:
        with st.container(border=True):
            a, b, c, e = st.columns([3.2, 1.6, 1.6, 1.2])
            a.markdown(f"<span class='cf-id'>{r['id']}</span> {pill(r['status'])}<br/><b>{TYPES[r['type']]['icon']} {r['title']}</b>"
                       f"<br/><span style='color:#93a0bd;font-size:.8rem'>{r['priority']} · {fmt_dt(r['createdAt'])}{' · 📍 ' + r['location'] if r.get('location') else ''}</span>",
                       unsafe_allow_html=True)
            opts = DEPARTMENTS if r["department"] else ["— Unassigned —"] + DEPARTMENTS
            dep = b.selectbox("Department", opts, index=opts.index(r["department"]) if r["department"] else 0, key="dp" + r["id"])
            stt = c.selectbox("Status", STATUSES, index=STATUSES.index(r["status"]), key="st" + r["id"])
            nxt = STATUSES[STATUSES.index(r["status"]) + 1] if r["status"] != "Completed" else None
            adv = e.button(f"→ {nxt}", key="ad" + r["id"]) if nxt else False
            if dep in DEPARTMENTS and dep != r["department"]:
                update_request(d, r, department=dep); save(d); st.rerun()
            if stt != r["status"]:
                update_request(d, r, status=stt); save(d); st.rerun()
            if adv:
                update_request(d, r, status=nxt); save(d); st.rerun()


# ---------------------------------------------------------------- app
def main():
    data = load()
    email = st.session_state.get("user")
    if not email:
        page_login()
        return
    u = USERS[email]
    with st.sidebar:
        st.markdown("## 🌊 CampusFlow")
        st.markdown(f"**{u['name']}**  \n<span style='color:#93a0bd'>{u['meta']}</span>", unsafe_allow_html=True)
        pages = ["Dashboard", "Requests", "Study Planner", "Calendar"] if u["role"] == "student" else ["Request Queue", "Calendar"]
        page = st.radio("Navigate", pages, label_visibility="collapsed")
        st.divider()
        if st.button("Reset demo data", use_container_width=True):
            save(seed()); st.session_state.pop("last_id", None); st.rerun()
        if st.button("Sign out", use_container_width=True):
            st.session_state.clear(); st.rerun()
        st.caption("Data is stored in campusflow_data.json (resets when the Streamlit Cloud app restarts).")

    st.title(page)
    if page == "Dashboard":
        page_dashboard(data, email)
    elif page == "Requests":
        page_requests(data, email)
    elif page == "Study Planner":
        page_study(data)
    elif page == "Calendar":
        page_calendar(data, email)
    else:
        page_admin(data)


main()
