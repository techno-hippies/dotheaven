### 0) First: the identifier you can “name” (ENS/DNSLink) is the **IPFS Root CID**, not the Filecoin/Beam “piece” id

* **ENS `contenthash`** and **DNSLink** are designed to point at:

  * `/ipfs/<rootCID>` (immutable), or
  * `/ipns/<name>` (mutable pointer) ([support.ens.domains][1])
* **FILBeam / filbeam** download links are keyed by a **Filecoin piece commitment / CommP** (often `baga…` / `bafk…`) and served over an HTTPS gateway. That **is not** the thing ENS/DNSLink resolves to. ([Filecoin Beam Docs][2])
* Practical consequence:

  * If your current “deploy” flow only gives you a **CommP/piece CID**, you must also produce/save the **IPFS root CID** of the website build (the `bafy…` directory CID) at deploy time. ([Filecoin Docs][3])

---

### 1) Fully self-custodied deploy to Filecoin (USDFC+FIL) **and** get an IPFS Root CID (recommended path)

Use **Filecoin Pin CLI** (it’s explicitly meant to persist **IPFS-addressed** content on Filecoin and returns both identifiers). ([Filecoin Docs][3])

**Install + payments**

```bash
# Node 22+ is required
npm install -g filecoin-pin@latest

# env (store locally; don't commit)
export PRIVATE_KEY="0x..."
export WALLET_ADDRESS="0x..."

# one-time: approve payment flows (no deposit yet)
filecoin-pin payments setup --auto
```

([Filecoin Docs][3])

**Upload your built frontend directory**

```bash
# example: your static build output is in dist/
filecoin-pin add dist/ --auto-fund
```

You should see output that includes:

* **Root CID**: `bafy...`  ← *this is what ENS/DNSLink/IPNS should point to*
* **Piece CID / CommP**: `bafk...`  ← *Filecoin proof / storage commitment*
* Data set info, provider service URL, etc. ([Filecoin Docs][3])

> If you truly want **no centralized gateways**, treat any “Direct Download URL” / hosted gateway as optional convenience. Your canonical address is `/ipfs/<RootCID>` (or `/ipns/<name>`). ([Filecoin Docs][3])

---

### 2) Create a **fully decentralized mutable pointer**: IPNS (no registry, no SaaS)

This gives you a stable name even when CIDs change.

**Run your own IPFS node**

```bash
ipfs init
ipfs daemon
```

(Any Kubo install method works; the important part is that your node is online when publishing.) ([IPFS Docs][4])

**Create a dedicated IPNS key (recommended)**

```bash
ipfs key gen --type=ed25519 frontend
# outputs something like: k51qzi5uqu5d...
```

**Publish the current build’s Root CID under that IPNS name**

```bash
ROOT_CID="bafy..."   # from filecoin-pin add output

ipfs name publish \
  --key=frontend \
  --ttl=5m \
  /ipfs/$ROOT_CID
```

**What you get**

* Your mutable URL becomes: `/ipns/<k51...>` (that `k51...` is the public key / IPNS name). ([IPFS Docs][4])

**Operational requirement (important)**

* IPNS records are distributed via the network (DHT by default) and need republishing; DHT records are ephemeral (expire regardless of your record “lifetime”). Kubo republishes periodically (default every few hours), but this only happens while your node is running. ([IPFS Docs][5])

---

### 3) Connect the mutable pointer to **ENS** (best “no centralized services” story)

**Goal:** pay ENS gas **once**, then do future updates off-chain via IPNS.

**One-time ENS setup**

* In the ENS app, set your name’s **Content Hash** record to:

  * `ipns://<k51...>`  (your IPNS name from `ipfs key gen`) ([support.ens.domains][1])
* ENS explicitly supports **IPFS/IPNS** in the Content Hash record. ([support.ens.domains][1])

**Every deploy after that**

* Upload new site build → get new **Root CID** (`bafy...`)
* Update IPNS:

  ```bash
  ipfs name publish --key=frontend --ttl=5m /ipfs/$NEW_ROOT_CID
  ```
* No ENS transaction needed.

> If you instead set ENS contenthash directly to `ipfs://bafy...`, you must do an on-chain update every deploy (simple, but not “frequent updates” friendly). ([support.ens.domains][1])

---

### 4) Connect to **DNSLink** (only if you control DNS; not as decentralized as ENS)

DNSLink is a TXT record convention:

* `_dnslink.example.com TXT "dnslink=/ipfs/<cid>"` **or** `"dnslink=/ipns/<name>"` ([DNSLink][6])

**Recommended DNSLink pattern (also “update without touching DNS”):**

* Set DNSLink once to IPNS:

  * `_dnslink.example.com TXT "dnslink=/ipns/<k51...>"`
* Keep the DNS TTL low (e.g., 60s) if you want updates to propagate quickly. ([DNSLink][6])
* Then your deploys only republish IPNS (same as ENS flow).

**Reality check**

* DNS has unavoidable centralized choke points (registrar / root / etc.). DNSLink standard itself calls this out; if you want “no centralized services,” ENS is the closer fit. ([DNSLink][6])

---

### 5) “No centralized services” access model (what users actually type)

If you avoid **all** public gateways:

* Users need an IPFS-capable setup and can use:

  * local gateway: `http://localhost:8080/ipns/<k51...>` or `/ipns/<domain>` ([IPFS Docs][7])
  * or native schemes: `ipns://<k51...>` / `ipfs://<cid>` (client support varies)

If you want regular-browser reach, you inevitably introduce **some** gateway layer (even if you self-host it). ENS documentation explicitly notes gateways like `eth.limo`/`eth.link` as access paths, but those are centralized gateways. ([support.ens.domains][1])

---

### 6) Minimal “runbook” you can automate

**One-time**

* `filecoin-pin payments setup --auto` ([Filecoin Docs][3])
* `ipfs key gen --type=ed25519 frontend` ([IPFS Docs][4])
* ENS: set contenthash = `ipns://<k51...>` ([support.ens.domains][1])
  *(or DNSLink: `_dnslink` TXT = `dnslink=/ipns/<k51...>`)* ([DNSLink][6])

**Each deploy**

1. Build static site → `dist/`
2. `filecoin-pin add dist/ --auto-fund` → capture **Root CID** (`bafy...`) ([Filecoin Docs][3])
3. `ipfs name publish --key=frontend --ttl=5m /ipfs/<newRootCID>` ([IPFS Docs][4])
4. Keep your Kubo node online so it republishes IPNS records over time. ([IPFS Docs][5])

---

If you paste what filbeam returns today (the exact `baga...` / `bafk...` you get after upload), I can map it to where in your pipeline you need to also capture the **IPFS Root CID** and ensure your “deploy output” always includes it.

[1]: https://support.ens.domains/en/articles/12275979-how-to-add-a-decentralised-website-to-an-ens-name "https://support.ens.domains/en/articles/12275979-how-to-add-a-decentralised-website-to-an-ens-name"
[2]: https://docs.filbeam.com/using-demo-web-app/retrieve-file "Retrieve File | Filecoin Beam Docs"
[3]: https://docs.filecoin.io/builder-cookbook/filecoin-pin/filecoin-pin-cli "Filecoin Pin CLI | Filecoin Docs"
[4]: https://docs.ipfs.tech/how-to/publish-ipns/ "https://docs.ipfs.tech/how-to/publish-ipns/"
[5]: https://docs.ipfs.tech/concepts/ipns/ "https://docs.ipfs.tech/concepts/ipns/"
[6]: https://dnslink.dev/ "https://dnslink.dev/"
[7]: https://docs.ipfs.tech/how-to/websites-on-ipfs/custom-domains/ "https://docs.ipfs.tech/how-to/websites-on-ipfs/custom-domains/"
