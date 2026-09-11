import React, { useState, useEffect, useCallback } from 'react';
import GaussianViewer from './components/GaussianViewer.jsx';

const API_ENDPOINT = '/api/upload-image';
const PLY_ENDPOINT = '/api/upload-ply';
const LIST_ENDPOINT = '/api/gaussians';
const RENAME_ENDPOINT = '/api/gaussians/rename';
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || '';

export default function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plyUrl, setPlyUrl] = useState('');
  const [jobId, setJobId] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [available, setAvailable] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [pendingPlyUrl, setPendingPlyUrl] = useState('');
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameCurrent, setRenameCurrent] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [plyFile, setPlyFile] = useState(null);
  const [plyLoading, setPlyLoading] = useState(false);
  const [plyError, setPlyError] = useState('');
  const [authInput, setAuthInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (!APP_PASSWORD) return true;
    const cached = localStorage.getItem('app_auth') || '';
    return cached === APP_PASSWORD;
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchGaussians = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const response = await fetch(LIST_ENDPOINT);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || 'Falha ao carregar lista.');
      }
      setAvailable(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setListError(err.message || 'Erro ao buscar cenas.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchGaussians();
  }, [fetchGaussians, isAuthenticated]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Selecione uma imagem para enviar.');
      return;
    }

    setError('');
    setLoading(true);
    setPlyUrl('');
    setPendingPlyUrl('');
    setJobId('');
    setProgress(0);
    setProgressMessage('');
    setOriginalName(file?.name || '');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        body: formData
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const message =
          typeof payload === 'string'
            ? payload.slice(0, 200)
            : payload?.detail || 'Falha no upload.';
        throw new Error(message);
      }

      if (typeof payload === 'string') {
        throw new Error('Resposta invalida do servidor.');
      }

      if (!payload.jobId) {
        throw new Error('Servidor nao retornou jobId.');
      }

      setJobId(payload.jobId);
    } catch (err) {
      setError(err.message || 'Erro inesperado.');
      setLoading(false);
    }
  };

  const handleAuthSubmit = (event) => {
    event.preventDefault();
    if (!APP_PASSWORD) {
      setIsAuthenticated(true);
      return;
    }
    if (authInput === APP_PASSWORD) {
      localStorage.setItem('app_auth', APP_PASSWORD);
      setIsAuthenticated(true);
      setAuthError('');
      setAuthInput('');
    } else {
      setAuthError('Senha incorreta.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('app_auth');
    setIsAuthenticated(false);
  };

  const handlePlyUpload = async (event) => {
    event.preventDefault();
    if (!plyFile) {
      setPlyError('Selecione um arquivo .ply.');
      return;
    }

    setPlyError('');
    setPlyLoading(true);

    const formData = new FormData();
    formData.append('file', plyFile);

    try {
      const response = await fetch(PLY_ENDPOINT, {
        method: 'POST',
        body: formData
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const message =
          typeof payload === 'string'
            ? payload.slice(0, 200)
            : payload?.detail || 'Falha ao enviar .ply.';
        throw new Error(message);
      }

      if (typeof payload === 'string') {
        throw new Error('Resposta invalida do servidor.');
      }

      setPlyUrl(payload.plyUrl);
      fetchGaussians();
    } catch (err) {
      setPlyError(err.message || 'Erro ao enviar .ply.');
    } finally {
      setPlyLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) return undefined;

    let active = true;

    const applyProgress = (data) => {
      if (!active) return;
      setProgress(data.progress ?? 0);
      setProgressMessage(data.message || '');

      if (data.status === 'error') {
        setError(data.message || 'Erro no processamento.');
        setLoading(false);
        active = false;
      }

      if (data.status === 'done') {
        setLoading(false);
        fetchGaussians();
        if (data.plyUrl) {
          const suggested = originalName ? originalName.replace(/\.[^/.]+$/, '') : 'scene';
          setPendingPlyUrl(data.plyUrl);
          setRenameCurrent(data.plyUrl);
          setRenameValue(suggested);
          setRenameError('');
          setShowRename(true);
        }
        active = false;
      }
    };

    const poll = async () => {
      try {
        const response = await fetch(`/api/progress/${jobId}/status`);
        const data = await response.json();
        if (response.ok) {
          applyProgress(data);
        }
      } catch (pollError) {
        // Keep silent: SSE may still be working.
      }
    };

    const interval = setInterval(poll, 2000);
    poll();

    const eventSource = new EventSource(`/api/progress/${jobId}`);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        applyProgress(data);
      } catch (parseError) {
        // Ignore malformed events, polling will recover.
      }
    };

    eventSource.onerror = () => {
      // Keep polling if SSE drops.
    };

    return () => {
      active = false;
      eventSource.close();
      clearInterval(interval);
    };
  }, [jobId, fetchGaussians]);

  const handleRenameConfirm = async () => {
    if (!renameCurrent) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Informe um nome para salvar.');
      return;
    }
    setRenaming(true);
    setRenameError('');
    try {
      const response = await fetch(RENAME_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current: renameCurrent,
          newName: trimmed
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail || 'Falha ao renomear.');
      }
      if (payload.plyUrl) {
        setPlyUrl(payload.plyUrl);
        setPendingPlyUrl('');
        fetchGaussians();
      }
      setShowRename(false);
      setRenameCurrent('');
    } catch (err) {
      setRenameError(err.message || 'Erro ao renomear.');
    } finally {
      setRenaming(false);
    }
  };

  const handleRenameSkip = () => {
    if (pendingPlyUrl) {
      setPlyUrl(pendingPlyUrl);
      setPendingPlyUrl('');
    }
    setShowRename(false);
    setRenameCurrent('');
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`/api/gaussians/${encodeURIComponent(deleteTarget.name)}`, {
        method: 'DELETE'
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail || 'Falha ao apagar.');
      }
      if (plyUrl === deleteTarget.plyUrl) {
        setPlyUrl('');
      }
      fetchGaussians();
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err.message || 'Erro ao apagar.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
    setDeleteError('');
  };

  useEffect(() => {
    if (!plyUrl) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') {
        setPlyUrl('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [plyUrl]);

  if (!isAuthenticated) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={handleAuthSubmit}>
          <h2>Acesso protegido</h2>
          <p>Digite a senha para continuar.</p>
          <input
            type="password"
            value={authInput}
            onChange={(event) => setAuthInput(event.target.value)}
            placeholder="Senha"
            autoFocus
          />
          {authError && <span className="error">{authError}</span>}
          <button type="submit">Entrar</button>
        </form>
      </div>
    );
  }

  return (
    <div className={`app ${plyUrl ? 'viewer-active' : ''} ${showRename ? 'modal-open' : ''}`}>
      {!plyUrl && (
        <header className="hero">
          <div>
            <p className="eyebrow">Sharp Gaussian Splatting</p>
            <h1>Gere cenas 3D a partir de uma imagem</h1>
            <p className="subtitle">
              Envie uma foto, aguarde o processamento do modelo Apple ml-sharp e navegue pela cena 3D
              renderizada em tempo real.
            </p>
          </div>
          <form className="upload-card" onSubmit={handleSubmit}>
            <div className="card-actions">
              <span>Sessao ativa</span>
              {APP_PASSWORD && (
                <button type="button" className="ghost" onClick={handleLogout}>
                  Sair
                </button>
              )}
            </div>
            <label className="file-input">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <span>{file ? file.name : 'Escolher imagem'}</span>
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Processando...' : 'Upload & Generate 3D'}
            </button>
            {loading && (
              <div className="progress">
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${progress}%` }} />
                </div>
                <span>{progress}%</span>
                {progressMessage && <small>{progressMessage}</small>}
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <div className="section-divider" />
            <label className="file-input">
              <input
                type="file"
                accept=".ply"
                onChange={(event) => setPlyFile(event.target.files?.[0] || null)}
              />
              <span>{plyFile ? plyFile.name : 'Escolher .ply'}</span>
            </label>
            <button type="button" onClick={handlePlyUpload} disabled={plyLoading}>
              {plyLoading ? 'Enviando...' : 'Enviar .ply'}
            </button>
            {plyError && <p className="error">{plyError}</p>}
            <div className="history">
              <div className="history-header">
                <span>Views processadas</span>
                <button type="button" className="ghost" onClick={fetchGaussians} disabled={loadingList}>
                  {loadingList ? 'Atualizando...' : 'Atualizar'}
                </button>
              </div>
              {listError && <p className="error">{listError}</p>}
              {available.length === 0 && !loadingList && !listError && (
                <p className="empty">Nenhuma cena gerada ainda.</p>
              )}
              <ul>
                {available.map((item) => (
                  <li key={item.name}>
                    <span>{item.name}</span>
                    <div className="item-actions">
                      <button type="button" onClick={() => setPlyUrl(item.plyUrl)}>
                        Abrir
                      </button>
                      <button type="button" className="danger" onClick={() => setDeleteTarget(item)}>
                        Apagar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </form>
        </header>
      )}

      {plyUrl && (
        <div className="viewer-overlay">
          <GaussianViewer plyUrl={plyUrl} disableControls={showRename} />
        </div>
      )}
      {showRename && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Salvar cena</h2>
            <p>Escolha um nome para o arquivo 3D gerado.</p>
            <input
              type="text"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="nome-da-cena"
              autoFocus
            />
            {renameError && <span className="error">{renameError}</span>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={handleRenameSkip} disabled={renaming}>
                Agora nao
              </button>
              <button type="button" onClick={handleRenameConfirm} disabled={renaming}>
                {renaming ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Apagar cena</h2>
            <p>Tem certeza que deseja apagar {deleteTarget.name}?</p>
            {deleteError && <span className="error">{deleteError}</span>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={handleDeleteCancel} disabled={deleting}>
                Cancelar
              </button>
              <button type="button" className="danger" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? 'Apagando...' : 'Apagar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
