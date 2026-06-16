# Backend local

Servidor Node 18+ para baixar mídia própria/autorizada do Instagram via Graph API, sem recompressão.

## Rodar

```bash
export IG_USER_ID="seu_ig_user_id"
export IG_ACCESS_TOKEN="seu_token"
npm start
```

No Windows PowerShell:

```powershell
$env:IG_USER_ID="seu_ig_user_id"
$env:IG_ACCESS_TOKEN="seu_token"
npm start
```

Teste:

```txt
http://localhost:3000/health
```
