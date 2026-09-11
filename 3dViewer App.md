3dViewer App.md

Quero que você gere **todo o código** de um projeto web completo para rodar no meu servidor Linux, com a seguinte especificação. O projeto deve caber na pasta `/pendriver/3DViewer` e ser facilmente deployado via **Coolify** usando Docker.

### Objetivo geral

Criar um app web que:

- Roda em `0.0.0.0:3040`.
- Será publicado pelo Coolify em `http://IP-PUBLICO:3040`.
- Backend expõe um endpoint para upload de imagem, roda o modelo **Apple ml-sharp** para gerar um `.ply` de 3D Gaussian Splatting e salva esse arquivo.
- Frontend permite:
  - Upload da imagem.
  - Após o processamento, carregar o `.ply` retornado e renderizar em tempo real a cena 3D no navegador com navegação (mouse + teclado) usando WebGL.
- Tudo empacotado em Docker, com `docker-compose.yml` pronto (mesmo que o Coolify depois não use diretamente o compose, isso serve de referência).

### Estrutura de pastas

Crie essa estrutura:

- `/pendriver/3DViewer/`
  - `backend/`
    - `app.py`
    - `requirements.txt`
    - `Dockerfile`
    - `sharp_runner.py` (wrapper para chamar o SHARP)
    - pasta `uploads/` (onde ficam as imagens enviadas)
    - pasta `gaussians/` (onde ficam os `.ply`)
    - pasta `ml-sharp/` (já existe, com o repositório já clonado do Apple ml-sharp)
  - `frontend/`
    - projeto React ou Vite + React
    - usa `@mkkellogg/gaussian-splats-3d` para visualizar o `.ply`[1][2]
    - `Dockerfile`
  - `docker-compose.yml`
  - `README.md` com instruções básicas de build e run.

### Backend (Python + FastAPI)

Requisitos:

- Usar **FastAPI** + `uvicorn`.
- Roda em `0.0.0.0:8000` internamente.
- Endpoint principal:
  - `POST /api/upload-image`
  - Recebe `multipart/form-data` com um campo `file` (imagem).
  - Salva a imagem em `backend/uploads/<uuid>.png` ou `.jpg`.
  - Chama uma função em `sharp_runner.py` que:
    - Executa o comando do SHARP para gerar o 3D Gaussian Splatting em `.ply`.[3][4]
    - Exemplo (ajuste caminhos relativos dentro do container):
      ```bash
      sharp predict \
        -i /app/uploads/<input-image> \
        -o /app/gaussians
      ```
    - A função deve localizar o `.ply` gerado (nome do arquivo) e retornar o caminho.
  - Resposta JSON:
    ```json
    {
      "status": "ok",
      "plyUrl": "/gaussians/<nome-arquivo>.ply"
    }
    ```
- Servir estaticamente a pasta `gaussians/` em `/gaussians/...` (para o frontend conseguir baixar o `.ply`).
- Tratar erros básicos (arquivo inválido, erro no SHARP) com códigos HTTP adequados.

Instalação do SHARP no container:

- Base da imagem: `nvidia/cuda` se possível, ou `python:3.10-slim` com instruções claras onde depois poderei habilitar GPU.
- No `Dockerfile` do backend:
  - Instalar dependências de sistema necessárias.
  - Clonar e instalar `apple/ml-sharp` ou, se já existir pacote pip, instalar via pip.[4][3]
  - Instalar deps do `requirements.txt`.
- `requirements.txt` deve conter, no mínimo:
  - `fastapi`
  - `uvicorn[standard]`
  - `python-multipart`
  - dependências necessárias para rodar o SHARP via Python ou subprocess.

### Arquivo `sharp_runner.py`

- Implementar uma função, por exemplo:
  ```python
  def run_sharp(input_image_path: str, output_dir: str) -> str:
      """
      Roda o SHARP para uma imagem e retorna o caminho do .ply gerado.
      Lança exceções em caso de erro.
      """
  ```
- Usar `subprocess.run` para chamar `sharp predict`.
- Garantir que:
  - Cria `output_dir` se não existir.
  - Depois de executar, procura o `.ply` mais recente no `output_dir` e retorna o path relativo que será servido em `/gaussians/...`.

### Frontend (React + GaussianSplats3D)

- Use React (pode ser Vite + React).
- Roda em `0.0.0.0:3040` dentro do container final (Nginx ou `vite build` + servidor estático).
- Página principal:
  - Formulário de upload de imagem:
    - Input type `file`.
    - Botão “Upload & Generate 3D”.
  - Ao enviar:
    - Faz `POST` para `http://backend:8000/api/upload-image` (no ambiente Docker, usar o nome do serviço backend) com `multipart/form-data`.
    - Mostra algum loading.
  - Quando a resposta chegar, pega `plyUrl` e carrega o viewer.
- Viewer:
  - Usar `@mkkellogg/gaussian-splats-3d` para renderizar o `.ply`.[2][1]
  - Criar um componente `<GaussianViewer plyUrl="...">`.
  - Configurar câmera com controles padrão:
    - Rotação com mouse.
    - Zoom com scroll.
    - Idealmente WASD para movimentação (se a lib permitir).

### Dockerfile frontend

- Build:
  - Usar `node:18` para buildar.
  - Rodar `npm install` e `npm run build`.
- Runtime:
  - Usar `nginx:alpine` servindo o build em `/usr/share/nginx/html`.
  - Nginx deve ouvir na porta `3040` dentro do container.
- Configurar Nginx para fazer proxy do backend:
  - Qualquer request para `/api/` deve ser proxy para `http://backend:8000`.
  - Requests para `/gaussians/` podem ir direto para o backend ou serem servidos pelo backend (via proxy).
- Expor porta `3040` no container.

### Dockerfile backend

- Base python
- Copiar o código para `/app`.
- Instalar deps do sistema + `ml-sharp` (clonar repositório da Apple ou instalar via pip se disponível).[3][4]
- Rodar FastAPI com:
  ```bash
  uvicorn app:app --host 0.0.0.0 --port 8000
  ```

### docker-compose.yml

Na raiz `/pendriver/3DViewer/`:

- Serviço `backend`:
  - `build: ./backend`
  - `container_name: sharp-backend`
  - `ports: ["8000:8000"]` (para debug).
  - Volumes opcionais para persistência (`./backend/uploads`, `./backend/gaussians`).
- Serviço `frontend`:
  - `build: ./frontend`
  - `container_name: sharp-frontend`
  - `ports: ["3040:3040"]`
  - `depends_on: ["backend"]`

### Considerações finais

- Gere **todos** os arquivos necessários com o conteúdo completo:
  - `app.py` (FastAPI)
  - `sharp_runner.py`
  - `requirements.txt`
  - `Dockerfile` backend
  - projeto React completo (incluindo `package.json`, `vite.config`, `src/main.tsx` ou `.jsx`, componente do viewer, etc.)
  - `Dockerfile` frontend
  - `docker-compose.yml`
  - `README.md` com passos:
    - `docker compose up -d`
    - acessar `http://IP-PUBLICO:3040`
- Tenha cuidado com caminhos relativos dentro dos containers para que o frontend consiga acessar `plyUrl` retornado pelo backend.
- Escreva o código de forma limpa, comentando apenas o essencial.