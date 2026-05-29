import sys
try:
    import psycopg2
except ImportError:
    print("Error: 'psycopg2' not found. Please run: pip install psycopg2-binary")
    sys.exit(1)

def seed(url):
    # This is a valid 64-character hex key format dk_<32_bytes_hex>
    VALID_KEY = "dk_6452f829837c4e5a9b2d1c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a"
    ADMIN_ID = "admin-1"

    try:
        print("Connecting to SMVD Database...")
        conn = psycopg2.connect(url)
        cur = conn.cursor()

        # 1. Clean up old attempts
        print("Cleaning up old records...")
        cur.execute("DELETE FROM \"ApiKey\" WHERE \"userId\" = %s OR key = 'dk_streamaura_fix_999';", (ADMIN_ID,))
        cur.execute("DELETE FROM \"User\" WHERE id = %s;", (ADMIN_ID,))

        # 2. Create the Admin User
        print("Creating Admin User...")
        cur.execute("""
            INSERT INTO \"User\" (id, email, name, \"isAdmin\", \"createdAt\", \"updatedAt\", \"isBlocked\") 
            VALUES (%s, 'admin@streamaura.site', 'Admin', true, NOW(), NOW(), false);
        """, (ADMIN_ID,))

        # 3. Create the Master API Key (Correct 64-char Format)
        print("Creating Valid 64-char API Key...")
        cur.execute("""
            INSERT INTO \"ApiKey\" (id, \"userId\", name, key, \"isBlocked\", \"createdAt\", \"updatedAt\", \"rateLimit\", \"maxDuration\")
            VALUES ('key-main', %s, 'StreamAuraKey', %s, false, NOW(), NOW(), 1000, 3600);
        """, (ADMIN_ID, VALID_KEY))

        conn.commit()
        cur.close()
        conn.close()
        print("\nSUCCESS!")
        print("==========================================================================")
        print("Your NEW SMVD API Key is:")
        print(VALID_KEY)
        print("==========================================================================")
        print("Step 1: Add this key to your StreamAura Render Dashboard (SMVD_API_KEY)")
        print("Step 2: Restart your StreamAura Web Service")

    except Exception as e:
        print(f"\nDATABASE ERROR: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python seed_smvd.py \"YOUR_EXTERNAL_DATABASE_URL\"")
    else:
        seed(sys.argv[1])
