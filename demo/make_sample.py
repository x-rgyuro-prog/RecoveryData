#!/usr/bin/env python3
"""Generate a realistic SAMPLE vehicle-recovery dataset for demo/testing only.
This is placeholder data used to validate the rendering pipeline before real
data is available. It is NOT real and NOT committed as the source of truth.
"""
import csv, random, datetime, sys

random.seed(42)
makes = {
    "Ford": ["F-150", "Escape", "Explorer", "Fusion"],
    "Chevrolet": ["Silverado", "Malibu", "Equinox", "Cruze"],
    "Toyota": ["Camry", "Corolla", "RAV4", "Tacoma"],
    "Honda": ["Civic", "Accord", "CR-V", "Pilot"],
    "Nissan": ["Altima", "Sentra", "Rogue", "Titan"],
    "Dodge": ["Charger", "Ram 1500", "Durango"],
    "BMW": ["3 Series", "X5", "5 Series"],
}
states = ["TX", "CA", "FL", "GA", "NY", "OH", "AZ", "NC", "IL", "PA", "TN", "WA"]
agents = ["A. Morales", "J. Chen", "R. Patel", "M. Johnson", "T. Nguyen", "S. Williams", "D. Garcia", "K. Brown"]
statuses = ["Recovered", "Recovered", "Recovered", "Recovered", "Pending", "In Progress", "Closed - Unrecovered"]
conditions = ["Good", "Fair", "Poor", "Excellent", "Damaged"]
lienholders = ["First National Bank", "Auto Credit Corp", "Westlake Financial", "Santander", "Credit Union One", "Ally"]

rows = []
start = datetime.date(2024, 1, 1)
for i in range(320):
    make = random.choice(list(makes))
    model = random.choice(makes[make])
    assigned = start + datetime.timedelta(days=random.randint(0, 600))
    status = random.choice(statuses)
    recovered_date = ""
    days = ""
    fee = ""
    if status in ("Recovered", "Closed", "Recovered"):
        d = random.randint(1, 95)
        rec = assigned + datetime.timedelta(days=d)
        recovered_date = rec.strftime("%m/%d/%Y")
        days = d
        fee = f"${random.randint(250, 1200)}"
    elif status == "Closed - Unrecovered":
        pass
    else:
        fee = ""
    rows.append({
        "Case ID": f"RC-{10000+i}",
        "Date Assigned": assigned.strftime("%m/%d/%Y"),
        "Date Recovered": recovered_date,
        "Status": status,
        "Make": make,
        "Model": model,
        "Year": random.randint(2008, 2023),
        "VIN": "".join(random.choices("ABCDEFGH0123456789", k=17)),
        "State": random.choice(states),
        "Recovery Agent": random.choice(agents),
        "Days to Recover": days,
        "Recovery Fee": fee,
        "Mileage": random.randint(15000, 210000),
        "Condition": random.choice(conditions) if recovered_date else "",
        "Lienholder": random.choice(lienholders),
    })

fields = list(rows[0].keys())
out = sys.argv[1] if len(sys.argv) > 1 else "demo/data.csv"
with open(out, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
print(f"wrote {len(rows)} rows -> {out}")
