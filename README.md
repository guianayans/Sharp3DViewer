# Sharp 3D Viewer

App web para gerar `.ply` via Apple ml-sharp e visualizar o resultado em 3D usando Gaussian Splatting no navegador.

## Requisitos

- Docker + Docker Compose
- (Opcional) GPU com drivers NVIDIA para acelerar o SHARP

## Estrutura

- `backend/`: FastAPI + wrapper do SHARP
- `frontend/`: Vite + React + @mkkellogg/gaussian-splats-3d
- `docker-compose.yml`: referencia de deploy

## Build e Run

```bash
docker compose up -d --build
```

Acesse:

```
http://IP-PUBLICO:3040
```

## Notas

- O backend expõe `/api/upload-image` e serve os `.ply` em `/gaussians/`.
- A pasta `backend/ml-sharp` deve conter o repositório `apple/ml-sharp` clonado.
- Para GPU, considere trocar a base do `backend/Dockerfile` para `nvidia/cuda` e iniciar os containers com suporte a GPU.
