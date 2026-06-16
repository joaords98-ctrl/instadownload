# InstaDownload Pessoal — GitHub + Vercel

Ferramenta pessoal em formato de painel web + extensão Chrome companion.

## O que faz

- Painel web estático pronto para Vercel.
- Campo para salvar links do Instagram na biblioteca.
- Biblioteca local no navegador com projeto, status e notas.
- Exportação em JSON e CSV.
- Extensão Chrome para detectar fotos, capas e mídias expostas em páginas do Instagram.
- Download direto de fotos/capas quando houver URL direta exposta.
- Envio da detecção da extensão para o painel hospedado na Vercel.

## Limitação

Quando o Instagram entrega vídeo/Reel como `blob:` ou stream, esta versão não faz contorno, interceptação de sessão ou quebra de proteção. Ela salva a referência e baixa apenas mídias expostas diretamente pela página.

## Estrutura

```txt
index.html          Painel web principal
app.css             Estilos do painel
app.js              Lógica do painel
extension/          Extensão Chrome companion
vercel.json         Ajuste simples para Vercel
package.json        Projeto estático
```

## Subir no GitHub

1. Extraia o ZIP.
2. Abra a pasta `instadownload-pessoal-github-vercel-v2`.
3. No GitHub, crie um repositório ou abra o repositório existente.
4. Clique em `Add file > Upload files`.
5. Arraste todo o conteúdo de dentro da pasta, não o ZIP.
6. Clique em `Commit changes`.

## Publicar na Vercel

1. Entre na Vercel.
2. Clique em `Add New > Project`.
3. Importe o repositório do GitHub.
4. Use estas configurações:

```txt
Framework Preset: Other
Root Directory: deixe vazio
Build Command: deixe vazio ou npm run build
Output Directory: deixe vazio
Install Command: deixe vazio ou npm install
```

5. Clique em `Deploy`.
6. Abra a URL gerada, exemplo:

```txt
https://seu-projeto.vercel.app
```

## Configurar a extensão com a URL da Vercel

1. Abra `chrome://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactação`.
4. Selecione a pasta `extension`.
5. Clique na engrenagem/opções da extensão.
6. Em `URL do painel`, coloque a URL da Vercel, por exemplo:

```txt
https://seu-projeto.vercel.app
```

7. Salve.

## Uso

1. Abra um post ou Reel no Instagram.
2. Clique na extensão.
3. Clique em `Detectar mídia`.
4. Fotos/capas expostas podem ser baixadas.
5. Clique em `Enviar ao painel` para abrir/salvar no painel da Vercel.

## Rodar localmente

Na pasta do projeto:

```bash
python -m http.server 5173
```

Depois abra:

```txt
http://localhost:5173
```
