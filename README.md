# GeoCam TESTE — Versão com código de acesso pessoal

Este é um **ambiente separado** do seu app principal. Nada aqui afeta o
site que já está no ar (`carbankapp1-dev.github.io/foto-carro-geo-localizacao`).
É uma cópia completa, com uma trava extra: pra ver o resultado da
validação de uma foto (a tela que abre ao escanear o QR Code), a pessoa
agora precisa digitar um **código pessoal** primeiro.

Este documento assume que você **nunca fez nada disso antes** — por
isso é longo. Siga na ordem, um passo de cada vez. Sempre que aparecer
a palavra **"copie"**, é literalmente copiar e colar o texto tal como
está, sem digitar de novo.

---

## Índice

1. [Criar o novo projeto no Firebase](#passo-1)
2. [Ativar o login anônimo](#passo-2)
3. [Ativar o Firestore Database](#passo-3)
4. [Colar as regras de segurança](#passo-4)
5. [Pegar a chave de administrador (conta de serviço)](#passo-5)
6. [Criar a conta na Cloudflare e o Worker](#passo-6)
6B. [Cadastro em lote — para várias pessoas de uma vez](#passo-6b)
7. [Cadastrar os códigos de acesso das pessoas (um por um)](#passo-7)
8. [Publicar os arquivos do site no GitHub](#passo-8)
9. [Testar tudo](#passo-9)
10. [Como incluir / remover uma pessoa depois](#passo-10)
11. [Perguntas e problemas comuns](#passo-11)

---

<a id="passo-1"></a>
## Passo 1 — Criar o novo projeto no Firebase

Isso é igual ao que você já fez uma vez, só que criando um projeto
**novo e separado**.

1. Acesse **https://console.firebase.google.com**
2. Clique em **"Adicionar projeto"**
3. Dê um nome, por exemplo: `camera-geolocalizacao-teste`
4. Pode desativar o Google Analytics (não precisamos dele) → **Criar projeto**
5. Espere a barrinha de carregamento terminar → **Continuar**

Você agora está dentro do painel do projeto novo. **Confirme, no topo
da tela, que o nome do projeto é o que você acabou de criar** (com
"-teste" ou parecido) — isso evita mexer sem querer no projeto antigo.

---

<a id="passo-2"></a>
## Passo 2 — Ativar o login anônimo

1. No menu lateral esquerdo → **Compilação** → **Authentication**
2. Clique em **"Vamos começar"**
3. Na lista de métodos de login, clique em **"Anônimo"**
4. Ative o interruptor → **Salvar**

---

<a id="passo-3"></a>
## Passo 3 — Ativar o Firestore Database

1. Menu lateral → **Compilação** → **Firestore Database**
2. Clique em **"Criar banco de dados"**
3. Escolha **"Iniciar no modo de produção"** (já vem marcado)
4. Escolha a região **`southamerica-east1`** (São Paulo — mais rápido no Brasil)
5. Clique em **Ativar** e espere terminar

> Se aparecer o erro **"Database already exists"**: tudo bem, significa
> que ele já foi criado numa tentativa anterior. Só vá no menu lateral
> e clique em **"Firestore"** (não em "Realtime Database", que é outra
> coisa) pra abrir o que já existe.

---

<a id="passo-4"></a>
## Passo 4 — Colar as regras de segurança

1. Ainda dentro do Firestore, clique na aba **"Regras"** (no topo)
2. **Apague tudo** que estiver escrito na caixa de texto
3. Abra o arquivo **`firestore.rules`** (está junto com este README)
4. **Copie todo o conteúdo dele** e cole na caixa de texto do Firebase
5. Clique em **Publicar**

Isso já deixa configurado: a coleção de fotos não pode mais ser lida
direto pelo celular de ninguém (só o Worker que vamos criar consegue),
e cria o espaço pra guardar os códigos de acesso das pessoas.

---

<a id="passo-5"></a>
## Passo 5 — Pegar a chave de administrador (conta de serviço)

Essa chave é o que vai permitir que o Worker "converse" com o Firestore
como administrador, ignorando as travas normais. **Ela é secreta** —
nunca vai aparecer em nenhum arquivo do site, só vai ser colada dentro
da Cloudflare (Passo 6).

1. No painel do Firebase, clique na **engrenagem** (⚙️) ao lado de
   "Visão geral do projeto", no topo do menu lateral → **Configurações do projeto**
2. Vá na aba **"Contas de serviço"**
3. Clique em **"Gerar nova chave privada"**
4. Confirme em **"Gerar chave"**
5. Um arquivo `.json` vai ser baixado no seu computador/celular
   (algo como `camera-geolocalizacao-teste-firebase-adminsdk-xxxxx.json`)

**Guarde esse arquivo** — vamos abrir ele daqui a pouco pra copiar duas
informações de dentro dele. Não apague, não compartilhe esse arquivo
com ninguém fora da equipe técnica.

Abra esse arquivo `.json` num editor de texto simples (no computador,
pode usar o Bloco de Notas; se estiver só no celular, qualquer app de
"editor de texto" ou até abrir no navegador). Você vai ver algo assim:

```json
{
  "type": "service_account",
  "project_id": "camera-geolocalizacao-teste",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@camera-geolocalizacao-teste.iam.gserviceaccount.com",
  ...
}
```

Você vai precisar de **3 valores** desse arquivo daqui a pouco — deixe
essa aba/arquivo aberto:

- `project_id`
- `client_email`
- `private_key` (o texto grande, incluindo as linhas
  `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----`)

---

<a id="passo-6"></a>
## Passo 6 — Criar a conta na Cloudflare e o Worker

### 6.1 — Criar a conta

1. Acesse **https://dash.cloudflare.com/sign-up**
2. Cadastre-se com e-mail e senha (não pede cartão)
3. Confirme o e-mail se for solicitado

### 6.2 — Criar o Worker

1. No painel da Cloudflare, no menu lateral, procure **"Workers e Pages"**
2. Clique em **"Criar"** (ou "Create Application" / "Create Worker",
   dependendo do idioma da tela)
3. Escolha a opção de criar um **Worker** (não "Pages")
4. Dê um nome, por exemplo: `validar-codigo`
5. Clique em **"Implantar"** (Deploy) — ele vai criar um Worker de
   exemplo, ainda vazio. Tudo bem, vamos substituir o código.

### 6.3 — Colar o código do Worker

1. Depois de criado, clique em **"Editar código"** (Edit code) —
   isso abre um editor de código direto no navegador
2. **Apague todo** o código de exemplo que já está lá
3. Abra o arquivo **`cloudflare-worker-validar-codigo.js`** (está
   junto com este README)
4. **Copie todo o conteúdo** e cole no editor da Cloudflare
5. Clique em **"Implantar"** (Deploy / Save and Deploy)

### 6.4 — Adicionar os segredos (as 3 informações do Passo 5)

Ainda na tela do Worker:

1. Vá na aba **"Configurações"** (Settings)
2. Procure por **"Variáveis e Secrets"** (Variables and Secrets)
3. Clique em **"Adicionar"** (Add) e crie, um de cada vez, marcando
   sempre como tipo **"Secret"** (não "Text/Plaintext"):

   | Nome da variável           | Valor (vem do arquivo `.json` do Passo 5) |
   |-----------------------------|--------------------------------------------|
   | `FIREBASE_PROJECT_ID`       | o valor de `project_id`                    |
   | `FIREBASE_CLIENT_EMAIL`     | o valor de `client_email`                  |
   | `FIREBASE_PRIVATE_KEY`      | o valor de `private_key` (o texto grande, completo, com as linhas BEGIN/END) |
   | `ADMIN_PASSWORD`            | uma senha que você mesmo inventa agora — vai usar depois no `admin.html` pra cadastrar pessoas em lote (Passo 6B) |

4. Depois de adicionar as 3, clique em **Salvar/Implantar de novo**
   (o Worker precisa reiniciar pra reconhecer as variáveis novas)

### 6.5 — Pegar a URL do Worker

No topo da tela do Worker, deve aparecer um endereço parecido com:

```
https://validar-codigo.SEU-USUARIO.workers.dev
```

**Copie essa URL completa** — você vai colar ela no arquivo
`worker-config.js` (Passo 8).

---

<a id="passo-6b"></a>
## Passo 6B — Cadastro em lote (para várias pessoas de uma vez)

Se você tem uma lista grande de pessoas (ex: 300), não precisa cadastrar
uma por uma na tela do Firebase (Passo 7). Existe uma página própria
pra isso: **`admin.html`**.

### Como funciona

Você abre essa página no navegador, digita a senha de administrador
(a mesma que você inventou e guardou como `ADMIN_PASSWORD` no
Passo 6.4), cola uma lista de nomes + códigos, e clica em um botão.
Todo mundo é cadastrado de uma vez.

### Como usar

1. Depois de publicar os arquivos no GitHub (Passo 8), acesse:
   ```
   https://SEU-USUARIO.github.io/SEU-REPOSITORIO-TESTE/admin.html
   ```
2. No campo **"Senha de administrador"**, digite a senha que você
   colocou em `ADMIN_PASSWORD`
3. Na caixa de texto grande, cole a lista de pessoas, **uma por
   linha**, neste formato:
   ```
   CÓDIGO, Nome completo
   ```
   Exemplo, para várias pessoas:
   ```
   DKX3KJK, Marcos Alexandre Custodio
   DKX3DRQ, Paoline Helena de Souza Aguiar
   H7P2M4Z, Ana Souza
   Q1W2E3R, Carlos Eduardo Lima
   ```
   (Dica: se você já tem essa lista numa planilha do Excel/Google
   Sheets com uma coluna "código" e outra "nome", pode selecionar as
   duas colunas, copiar, e colar direto na caixa — geralmente já cola
   certinho, separado por vírgula ou tab. Se colar separado por TAB
   em vez de vírgula, funciona igual, o sistema reconhece os dois.)
4. Confira o contador logo abaixo da caixa ("X linha(s)
   reconhecida(s)") — se o número bater com a quantidade de pessoas
   que você colou, está tudo certo
5. Clique em **"Cadastrar todos"**
6. Espere a mensagem verde de confirmação aparecer

Pronto — todas as pessoas da lista já estão cadastradas e ativas na
coleção `codigos_acesso`, sem precisar abrir o Firestore Database
nenhuma vez.

**Rodar de novo mais tarde, com pessoas novas ou repetidas, não é
problema**: quem já existia só tem o nome atualizado (continua
`ativo: true`), e quem é novo é criado — nada é apagado ou duplicado.

> ⚠️ Não compartilhe o link do `admin.html` nem a senha de
> administrador com a equipe em geral — é só pra quem cuida do
> cadastro. A senha é o único ponto que impede qualquer pessoa de
> cadastrar códigos falsos.

---

<a id="passo-7"></a>
## Passo 7 — Cadastrar os códigos de acesso das pessoas (um por um)

Use este caminho só se for **1 ou 2 pessoas**, ou pra conferir/ajustar
um cadastro específico depois. Pra volume grande, use o Passo 6B acima.

Cada pessoa autorizada vira **um documento** dentro de uma coleção
chamada `codigos_acesso`, no Firestore do projeto novo.

1. Volte pro **Firebase Console** → seu projeto de teste → **Firestore Database** → aba **Dados**
2. Clique em **"Iniciar coleção"**
3. ID da coleção: digite exatamente `codigos_acesso` → Avançar
4. **ID do documento**: aqui você digita **o código da pessoa**, por
   exemplo `DKX3K9O`
5. Adicione dois campos:
   - Campo `nome` → tipo **string** → valor: o nome da pessoa (ex: `Marcos Alexandre`)
   - Campo `ativo` → tipo **boolean** → valor: **true**
6. Clique em **Salvar**

Repita esse processo (clicando em **"Adicionar documento"** dentro da
mesma coleção `codigos_acesso`) pra cada pessoa da equipe.

---

<a id="passo-8"></a>
## Passo 8 — Publicar os arquivos do site no GitHub

1. Preencha o arquivo **`firebase-config.js`** com as credenciais do
   projeto novo (mesmo processo do projeto principal: no Firebase,
   ícone **`</>`** na página inicial do projeto → registrar app Web →
   copiar o objeto `firebaseConfig` → colar substituindo os
   `"SUBSTITUA_AQUI"`)
2. Ajuste a linha `VERIFY_BASE_URL` nesse mesmo arquivo com o
   endereço final onde esse site de teste vai ficar
3. Preencha o arquivo **`worker-config.js`** com a URL do Worker que
   você copiou no Passo 6.5
4. Crie um **repositório novo** no GitHub (separado do principal, pra
   não misturar), por exemplo `geocam-teste`
5. Suba todos os arquivos desta pasta pra esse repositório
6. Ative o GitHub Pages nas configurações do repositório (Settings →
   Pages → Branch: main)

---

<a id="passo-9"></a>
## Passo 9 — Testar tudo

1. Abra o link do GitHub Pages novo no celular
2. Preencha os campos e tire uma foto normalmente (igual ao app
   principal) — ela vai ser salva nesse banco de dados novo, separado
3. Escaneie o QR Code que sai na foto (ou abra o link de validação)
4. Deve aparecer a tela **"🔒 Acesso restrito"** pedindo o código
5. Digite um código que você cadastrou no Passo 7 → **Validar**
6. Se estiver tudo certo, a tela de validação normal deve aparecer

Teste também digitando um código **errado** ou **inexistente** — deve
aparecer a mensagem "Código inválido ou inativo" e a foto não deve
aparecer.

---

<a id="passo-10"></a>
## Passo 10 — Como incluir / remover uma pessoa depois

**Incluir uma pessoa nova:**
- **Uma só**: Firebase Console → Firestore Database → coleção
  `codigos_acesso` → "Adicionar documento" → ID do documento = o
  novo código → campos `nome` (string) e `ativo` (boolean = true)
- **Várias de uma vez**: use o `admin.html` (Passo 6B) — cole a
  lista nova e clique em "Cadastrar todos"

**Remover o acesso de alguém** (duas formas):
- **Rápida (recomendada)**: abra o documento da pessoa → mude o campo
  `ativo` de `true` para `false` → Salvar. O código para de funcionar
  na hora, mas fica registrado que aquele código já existiu.
- **Definitiva**: abra o documento da pessoa → clique nos 3 pontinhos
  → **Excluir documento**.

Nenhuma dessas ações precisa mexer em código ou publicar nada de novo
— o efeito é imediato.

---

<a id="passo-11"></a>
## Passo 11 — Perguntas e problemas comuns

**"Código inválido ou inativo" mesmo digitando certo**
- Confira se digitou o código **exatamente** como está no Firestore
  (o app converte pra maiúsculas sozinho, mas espaços em branco antes/
  depois contam como diferente)
- Confira se o campo `ativo` está mesmo como `true` (booleano, não a
  palavra "true" como texto)

**"Erro interno" na tela de validação**
- Provavelmente as 3 variáveis secretas do Worker (Passo 6.4) estão
  faltando ou com algum valor incorreto — principalmente a
  `FIREBASE_PRIVATE_KEY`, que precisa estar **completa**, incluindo as
  linhas `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----`

**"Erro de conexão"**
- Confira se a URL no `worker-config.js` está exatamente igual à URL
  que a Cloudflare mostrou (sem espaço extra, com `https://` no início)

**"Senha de administrador incorreta" no admin.html**
- Confira se a senha digitada é exatamente igual ao valor que você
  colocou no segredo `ADMIN_PASSWORD` do Worker (Passo 6.4) —
  maiúsculas/minúsculas contam
- Se esqueceu a senha, é só ir no Worker → Configurações → Variáveis e
  Secrets → editar `ADMIN_PASSWORD` e colocar uma nova

**O contador de linhas do admin.html não bate com o que colei**
- Confira se cada linha da lista está no formato `CÓDIGO, Nome` (com
  vírgula separando os dois) — linhas em branco são ignoradas
  automaticamente, então isso é normal se você deixou espaços entre
  os nomes

**Dá pra usar isso no app principal também?**
- Sim, mas com calma: recomendo deixar esse ambiente de teste rodando
  por um tempo, confirmar que está tudo funcionando do jeito que você
  quer, e só depois migrarmos o app principal pra esse mesmo modelo
  (ou simplesmente passar a usar este de teste como definitivo).
