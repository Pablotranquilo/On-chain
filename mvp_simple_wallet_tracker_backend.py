"""
FastAPI MVP backend (no .env). Uses Etherscan to return latest ETH + ERC-20
transactions for a given EVM address.

Run:
  pip install fastapi uvicorn[standard] httpx
  uvicorn app:app --reload
"""

import re
from decimal import Decimal, getcontext
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# <<< PASTE YOUR ETHERSCAN API KEY HERE >>>
ETHERSCAN_API_KEY = "WKVUI6DNJYCWF5YGT8QBA1Y5QU21528PQE"
# ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
# Tip: do NOT expose this key to the browser. Keep it server-side.

API_BASE = "https://api.etherscan.io/api"
ADDR_RE  = re.compile(r"^0x[0-9a-fA-F]{40}$")
getcontext().prec = 60


# ---------------- FastAPI app ----------------
app = FastAPI(title="EVM Wallet Viewer (Etherscan, no .env)")

# CORS open for dev; lock down in prod if you serve the frontend from one origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


# ---------------- Helpers ----------------
def _is_valid_address(addr: str) -> bool:
    return bool(ADDR_RE.match(addr or ""))

def _iso_utc(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")

def _fmt_amount(raw: str, decimals: int) -> str:
    d = (Decimal(raw) / (Decimal(10) ** Decimal(decimals))) if decimals >= 0 else Decimal(raw)
    s = format(d.normalize(), "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s or "0"

def _wei_to_eth(wei: str) -> str:
    return _fmt_amount(wei, 18)

def _direction(me: str, from_addr: str, to_addr: str) -> str:
    me = (me or "").lower()
    if (from_addr or "").lower() == me:
        return "out"
    if (to_addr or "").lower() == me:
        return "in"
    return "other"

async def _etherscan(params: Dict[str, Any]) -> Dict[str, Any]:
    if not ETHERSCAN_API_KEY or ETHERSCAN_API_KEY.startswith("PASTE_"):
        raise HTTPException(500, "Server is not configured with an Etherscan API key.")
    q = dict(params)
    q["apikey"] = ETHERSCAN_API_KEY

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(API_BASE, params=q)
        r.raise_for_status()
        data = r.json()

    status = str(data.get("status"))
    message = str(data.get("message", ""))

    # Etherscan quirks:
    # - OK: {"status":"1","message":"OK","result":[...]}
    # - No tx: {"status":"0","message":"No transactions found","result":[]}
    # - Errors/rate limit: {"status":"0","message":"NOTOK","result":"Max rate limit reached"}
    if status == "0" and message == "NOTOK":
        detail = str(data.get("result") or "Etherscan NOTOK")
        if "rate limit" in detail.lower():
            raise HTTPException(429, f"Etherscan: {detail}")
        raise HTTPException(502, f"Etherscan error: {detail}")

    if status == "0" and message.lower().startswith("no transactions"):
        return {"status": "1", "result": []}

    return data

def _normalize_eth_item(me: str, it: Dict[str, Any]) -> Dict[str, Any]:
    ts = int(it["timeStamp"])
    is_error = (it.get("isError") == "1")
    tx_status = "failed" if is_error else ("success" if it.get("txreceipt_status") == "1" else "unknown")
    fn = (it.get("functionName") or "").split("(")[0]

    return {
        "type": "ETH",
        "timestamp": ts,
        "time_utc": _iso_utc(ts),
        "hash": it["hash"],
        "from": it.get("from"),
        "to": it.get("to"),
        "direction": _direction(me, it.get("from",""), it.get("to","")),
        "amount": _wei_to_eth(it.get("value","0")),
        "symbol": "ETH",
        "functionName": fn,
        "status": tx_status,
        "link": f"https://etherscan.io/tx/{it['hash']}",
    }

def _normalize_erc20_item(me: str, it: Dict[str, Any]) -> Dict[str, Any]:
    ts = int(it["timeStamp"])
    decimals = int(it.get("tokenDecimal") or 0)
    symbol = it.get("tokenSymbol") or "TOKEN"
    return {
        "type": "ERC20",
        "timestamp": ts,
        "time_utc": _iso_utc(ts),
        "hash": it["hash"],
        "from": it.get("from"),
        "to": it.get("to"),
        "direction": _direction(me, it.get("from",""), it.get("to","")),
        "amount": _fmt_amount(it.get("value","0"), decimals),
        "symbol": symbol,
        "tokenContract": it.get("contractAddress"),
        "functionName": "",
        "link": f"https://etherscan.io/tx/{it['hash']}",
    }


# ---------------- API ----------------
@app.get("/api/transactions")
async def get_transactions(
    address: str = Query(..., description="EVM address starting with 0x"),
    limit: int = Query(25, ge=1, le=200, description="How many recent items to return (merged ETH + ERC20)"),
):
    if not _is_valid_address(address):
        raise HTTPException(400, "Invalid address. Expected a 0x… EVM address.")

    # ETH & contract calls
    txlist = await _etherscan({
        "module": "account", "action": "txlist",
        "address": address,
        "startblock": 0, "endblock": 99999999,
        "page": 1, "offset": limit, "sort": "desc",
    })
    eth_items = [_normalize_eth_item(address, it) for it in txlist.get("result", [])]

    # ERC-20 transfers
    tokentx = await _etherscan({
        "module": "account", "action": "tokentx",
        "address": address,
        "page": 1, "offset": limit, "sort": "desc",
    })
    erc20_items = [_normalize_erc20_item(address, it) for it in tokentx.get("result", [])]

    combined = eth_items + erc20_items
    combined.sort(key=lambda x: x["timestamp"], reverse=True)
    latest = combined[:limit]

    counts = {
        "ETH": sum(1 for x in latest if x["type"] == "ETH"),
        "ERC20": sum(1 for x in latest if x["type"] == "ERC20"),
    }

    return JSONResponse({
        "address": address,
        "returned": len(latest),
        "counts": counts,
        "items": latest,
    })


@app.get("/api/ping")
async def ping():
    return {"ok": True}
