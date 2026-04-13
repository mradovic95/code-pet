# Premium pets (marketplace)

> **Internal doc.** This page is not linked from the public `README.md`. It
> preserves marketplace setup instructions for when the store is ready to be
> promoted publicly.

Premium pets are purchased from the marketplace and downloaded via license
key.

## Configure

Create `~/.code-pet/marketplace.json`:

```json
{
  "baseUrl": "https://2vyd33gumd.execute-api.us-east-2.amazonaws.com/stage",
  "apiKey": "your-api-key",
  "marketplaceId": 1
}
```

Environment variable overrides are supported: `MARKETPLACE_URL`,
`MARKETPLACE_API_KEY`, `MARKETPLACE_ID`.

## Buy and activate

1. Open the pet settings (double-click the pet) and use the **Store** tab
2. Buy a pet (free, or via PayPal for premium)
3. Activate the license key

Without a `marketplace.json`, the app runs in **mock mode** with dev assets
copied from `assets/pets-dev/`.

## How it works

```
Settings UI (Buy button)
  → IPC: purchase-pet → MarketplaceAPI.purchase(petId)
    → FREE:    license key returned immediately
    → PREMIUM: PayPal URL → shell.openExternal() → user pays
               → poll-payment-status → license key
  → IPC: activate-license → LicenseManager.activate(key)
    → PremiumStore.download(petId, key, api, productId)
      → XOR-encrypt + write to ~/.code-pet/premium-pets/{petId}/
    → renderer injects data: URIs into CSS
```

## Product ID ↔ Pet ID mapping

The marketplace uses numeric `productId`; code-pet uses string `petId`. The
mapping is built from the catalog response (product name lowercased) and
cached to `~/.code-pet/product-map.json`.

## Runtime state

| File | Purpose |
|---|---|
| `~/.code-pet/marketplace.json` | API configuration |
| `~/.code-pet/product-map.json` | Cached `productId` ↔ `petId` mapping |
| `~/.code-pet/license.json` | Activated license key, owned pets, validation timestamp |
| `~/.code-pet/premium-pets/` | Downloaded premium assets (XOR-encrypted sprites + manifest) |
